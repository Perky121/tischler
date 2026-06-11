import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import multer from "multer";
import AdmZip from "adm-zip";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
const sourceMacsDir = path.join(dataDir, "source_macs");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");
const parseMacPath = path.resolve(workspaceRoot, "artifacts/api-server/parse_mac.py");

// Resolve python3: prefer env override, then check if the Nix path exists (Replit),
// otherwise fall back to the system "python3" in PATH (macOS/Windows/Linux).
const NIX_PYTHON3 = "/nix/store/1y5i7y4iqd5pvkdvmj2hwlsjizq2ckq2-python3-3.8.18/bin/python3";
const PYTHON3_BIN =
  process.env["PYTHON3_BIN"] ??
  (fs.existsSync(NIX_PYTHON3) ? NIX_PYTHON3 : "python3");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(sourceMacsDir, { recursive: true });

logger.info({ python3: PYTHON3_BIN }, "MAC parser: using python3 binary");

function sanitizeFilename(name: string): string {
  // Strip directory components, then allow only safe characters
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._\-]/g, "_");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    cb(null, `${ts}-${sanitizeFilename(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".mac") || name.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .mac and .zip files are allowed"));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

function readKnowledgeBase() {
  try {
    if (fs.existsSync(knowledgeBasePath)) {
      const raw = fs.readFileSync(knowledgeBasePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    logger.warn({ err: e }, "Error reading knowledge base");
  }
  return { formulas: [], parameters: [], syntax_rules: [], _meta: { files_processed: 0 } };
}

router.get("/knowledge", (req, res): void => {
  const kb = readKnowledgeBase();
  const stats = {
    formulaCount: kb.formulas?.length ?? 0,
    parameterCount: kb.parameters?.length ?? 0,
    fileCount: kb._meta?.files_processed ?? 0,
  };
  res.json({
    formulas: kb.formulas ?? [],
    parameters: kb.parameters ?? [],
    syntax_rules: kb.syntax_rules ?? [],
    stats,
  });
});

function runParser(inputPath: string, extraArgs: string[] = []): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = [parseMacPath, inputPath, "--output", knowledgeBasePath, ...extraArgs];
    const proc = spawn(PYTHON3_BIN, args);
    let stderr = "";

    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      resolve(code === 0 ? { success: true } : { success: false, error: stderr });
    });

    proc.on("error", (err) => {
      // Translate ENOENT into a human-readable message so the user knows it's
      // a server configuration issue, not a problem with their file.
      const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
      const detail = isNotFound
        ? `Python interpreter nije pronađen na serveru (putanja: ${PYTHON3_BIN}). Kontaktiraj administratora.`
        : err.message;
      resolve({ success: false, error: detail });
    });
  });
}

type MacFile = { path: string; originalName: string };

async function parseMacFile(file: MacFile): Promise<{ success: boolean; error?: string }> {
  const result = await runParser(file.path, ["--merge"]);

  if (result.success) {
    // Keep the source file (overwrite same-named older versions) for future re-parsing
    const destPath = path.join(sourceMacsDir, file.originalName);
    try {
      fs.renameSync(file.path, destPath);
    } catch {
      fs.unlink(file.path, () => {});
    }
  } else {
    fs.unlink(file.path, () => {});
  }

  return result;
}

function extractMacFilesFromZip(zipPath: string): MacFile[] {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const extracted: MacFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryName = entry.entryName.toLowerCase();
    if (!entryName.endsWith(".mac")) continue;

    // Use only the filename (strip directory path from inside zip)
    const baseName = path.basename(entry.entryName);
    const destPath = path.join(uploadsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}`);

    fs.writeFileSync(destPath, entry.getData());
    extracted.push({ path: destPath, originalName: baseName });
  }

  return extracted;
}

router.post("/upload-mac", upload.array("files"), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  req.log.info({ count: files.length }, "Processing uploaded files");

  try {
    // Collect all .mac files to process (directly uploaded + extracted from zips)
    const macFiles: MacFile[] = [];
    const zipPaths: string[] = [];

    for (const file of files) {
      if (file.originalname.toLowerCase().endsWith(".zip")) {
        zipPaths.push(file.path);
        const extracted = extractMacFilesFromZip(file.path);
        req.log.info({ zip: file.originalname, count: extracted.length }, "Extracted .mac files from zip");
        macFiles.push(...extracted);
      } else {
        macFiles.push({ path: file.path, originalName: file.originalname });
      }
    }

    // Clean up zip files after extraction
    for (const zipPath of zipPaths) {
      fs.unlink(zipPath, () => {});
    }

    if (macFiles.length === 0) {
      res.status(400).json({ error: "No .mac files found (check that your .zip contains .mac files)" });
      return;
    }

    // Parse files sequentially — each run does --merge which modifies knowledge_base.json;
    // parallel execution would cause race conditions and lost data.
    const results: { success: boolean; error?: string }[] = [];
    for (const mf of macFiles) {
      results.push(await parseMacFile(mf));
    }

    const failed = results.filter((r) => !r.success);
    const succeeded = results.length - failed.length;

    if (failed.length > 0) {
      req.log.error({ errors: failed }, "Some .mac files failed to parse");
    }

    if (succeeded === 0) {
      const firstError = failed[0]?.error ?? "Nepoznata greška parsera";
      res.status(500).json({
        error: `Nije uspjelo parsirati nijednu .mac datoteku. Greška: ${firstError}`,
      });
      return;
    }

    const kb = readKnowledgeBase();
    const stats = {
      formulaCount: kb.formulas?.length ?? 0,
      parameterCount: kb.parameters?.length ?? 0,
      fileCount: kb._meta?.files_processed ?? macFiles.length,
    };

    res.json({
      success: true,
      message: `Obrađeno ${succeeded} od ${macFiles.length} .mac datoteka`,
      stats,
    });
  } catch (err) {
    req.log.error({ err }, "Error processing uploaded files");
    res.status(500).json({ error: "Failed to process uploaded files" });
  }
});

router.post("/reparse", async (req, res): Promise<void> => {
  try {
    const sourceFiles = fs.existsSync(sourceMacsDir)
      ? fs.readdirSync(sourceMacsDir).filter((f) => f.toLowerCase().endsWith(".mac"))
      : [];

    if (sourceFiles.length === 0) {
      res.status(400).json({ error: "Nema spremljenih .mac datoteka za ponovno parsiranje" });
      return;
    }

    req.log.info({ count: sourceFiles.length }, "Re-parsing all source MAC files");

    // Fresh parse of the whole folder (no --merge: rebuilds knowledge base from scratch)
    const result = await runParser(sourceMacsDir);

    if (!result.success) {
      res.status(500).json({ error: `Ponovno parsiranje nije uspjelo: ${result.error}` });
      return;
    }

    const kb = readKnowledgeBase();
    const stats = {
      formulaCount: kb.formulas?.length ?? 0,
      parameterCount: kb.parameters?.length ?? 0,
      fileCount: kb._meta?.files_processed ?? sourceFiles.length,
    };

    res.json({
      success: true,
      message: `Ponovno parsirano ${sourceFiles.length} .mac datoteka`,
      stats,
    });
  } catch (err) {
    req.log.error({ err }, "Error re-parsing MAC files");
    res.status(500).json({ error: "Failed to re-parse MAC files" });
  }
});

// ── Faza E: Reparse a single .mac file by name ───────────────────────────────
router.post("/knowledge/reparse-one", async (req, res): Promise<void> => {
  const { filename } = req.body as { filename?: string };

  if (!filename) {
    res.status(400).json({ error: "filename is required" });
    return;
  }

  const safe = path.basename(filename);
  const filePath = path.join(sourceMacsDir, safe);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({
      success: false,
      error: `Datoteka '${safe}' nije pronađena u source_macs/. Uploadaj je prvo.`,
    });
    return;
  }

  try {
    const result = await runParser(filePath, ["--merge"]);
    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }
    const kb = readKnowledgeBase();
    res.json({
      success: true,
      message: `Modul ${safe} je re-parsiran i spojen s bazom znanja`,
      formulaCount: kb.formulas?.length ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "reparse-one error");
    res.status(500).json({ success: false, error: "Parsiranje nije uspjelo" });
  }
});

// ── Faza D: Learn endpoint — merge screenshot-observed knowledge into KB ──────

interface LearnEntry {
  formula?: string;
  source?: string;
  confidence?: number;
}
interface LearnParamEntry {
  name?: string;
  description?: string;
  source?: string;
}
interface LearnObsEntry {
  text?: string;
  timestamp?: string;
}

router.post("/knowledge/learn", (req, res): void => {
  const {
    formulas = [],
    parameters = [],
    observations = [],
  } = req.body as {
    formulas?: LearnEntry[];
    parameters?: LearnParamEntry[];
    observations?: LearnObsEntry[];
  };

  try {
    const kb = readKnowledgeBase();

    if (!kb.learned) {
      kb.learned = { formulas: [], parameters: [], observations: [] };
    }

    let added = 0;

    // Dedup formulas by formula string
    const existingFormulas = new Set<string>(
      (kb.learned.formulas as LearnEntry[]).map((f) => f.formula ?? "")
    );
    for (const f of formulas) {
      if (f.formula && !existingFormulas.has(f.formula)) {
        (kb.learned.formulas as LearnEntry[]).push({
          formula: f.formula,
          source: f.source ?? `screenshot:${new Date().toISOString().slice(0, 10)}`,
          confidence: f.confidence ?? 0.8,
        });
        existingFormulas.add(f.formula);
        added++;
      }
    }

    // Dedup parameters by name
    const existingParams = new Set<string>(
      (kb.learned.parameters as LearnParamEntry[]).map((p) => p.name ?? "")
    );
    for (const p of parameters) {
      if (p.name && !existingParams.has(p.name)) {
        (kb.learned.parameters as LearnParamEntry[]).push({
          name: p.name,
          description: p.description ?? "",
          source: p.source ?? "screenshot",
        });
        existingParams.add(p.name);
        added++;
      }
    }

    // Dedup observations by text
    const existingObs = new Set<string>(
      (kb.learned.observations as LearnObsEntry[]).map((o) => o.text ?? "")
    );
    for (const o of observations) {
      if (o.text && !existingObs.has(o.text)) {
        (kb.learned.observations as LearnObsEntry[]).push({
          text: o.text,
          timestamp: o.timestamp ?? new Date().toISOString(),
        });
        existingObs.add(o.text);
        added++;
      }
    }

    fs.writeFileSync(knowledgeBasePath, JSON.stringify(kb, null, 2));

    logger.info({ added }, "kb/learn: entries added");
    res.json({
      success: true,
      added,
      learned: {
        formulaCount: (kb.learned.formulas as LearnEntry[]).length,
        parameterCount: (kb.learned.parameters as LearnParamEntry[]).length,
        observationCount: (kb.learned.observations as LearnObsEntry[]).length,
      },
    });
  } catch (err) {
    logger.error({ err }, "kb/learn error");
    res.status(500).json({ error: "Failed to save learned entries" });
  }
});

export default router;

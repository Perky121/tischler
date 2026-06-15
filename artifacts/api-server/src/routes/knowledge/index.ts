import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import { logger } from "../../lib/logger";
import { mergeFileIntoKb, buildKbFromFiles, SYNTAX_RULES, type KnowledgeBase } from "../../lib/parse-mac";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
const sourceMacsDir = path.join(dataDir, "source_macs");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(sourceMacsDir, { recursive: true });

logger.info("MAC parser: using built-in TypeScript parser (no Python required)");

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
    if (name.endsWith(".mac") || name.endsWith(".zip") || name.endsWith(".prt")) {
      cb(null, true);
    } else {
      cb(new Error("Podržane su samo .mac, .prt i .zip datoteke"));
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
  const { module: moduleFilter } = req.query;

  let formulas = kb.formulas ?? [];
  if (typeof moduleFilter === "string" && moduleFilter) {
    formulas = formulas.filter((f: { module?: string }) => f.module === moduleFilter);
  }

  const stats = {
    formulaCount: kb.formulas?.length ?? 0,
    parameterCount: kb.parameters?.length ?? 0,
    fileCount: kb._meta?.files_processed ?? 0,
  };
  res.json({
    formulas,
    parameters: kb.parameters ?? [],
    syntax_rules: kb.syntax_rules ?? [],
    stats,
  });
});

type MacFile = { path: string; originalName: string };

function loadKnowledgeBase(): KnowledgeBase {
  try {
    if (fs.existsSync(knowledgeBasePath)) {
      const kb = JSON.parse(fs.readFileSync(knowledgeBasePath, "utf-8")) as KnowledgeBase;
      // Backfill `module` field on formulas that predate the schema update
      let migrated = false;
      for (const f of kb.formulas ?? []) {
        if (!f.module && f.source) {
          (f as { module?: string }).module = f.source.replace(/\.mac$/i, "");
          migrated = true;
        }
      }
      if (migrated) {
        fs.writeFileSync(knowledgeBasePath, JSON.stringify(kb, null, 2));
      }
      return kb;
    }
  } catch { /* ignore */ }
  return { formulas: [], parameters: [], syntax_rules: SYNTAX_RULES, _meta: { files_processed: 0 } };
}

function saveKnowledgeBase(kb: KnowledgeBase): void {
  fs.writeFileSync(knowledgeBasePath, JSON.stringify(kb, null, 2));
}

function parseMacFileIntoKb(file: MacFile): { success: boolean; error?: string } {
  try {
    const existing = loadKnowledgeBase();
    mergeFileIntoKb(file.path, existing);
    saveKnowledgeBase(existing);

    // Keep the source file for future re-parsing
    const destPath = path.join(sourceMacsDir, file.originalName);
    try {
      fs.renameSync(file.path, destPath);
    } catch {
      fs.unlink(file.path, () => {});
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Keep old name used further down the file
function parseMacFile(file: MacFile): Promise<{ success: boolean; error?: string }> {
  return Promise.resolve(parseMacFileIntoKb(file));
}


function extractMacFilesFromZip(zipPath: string): MacFile[] {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const extracted: MacFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryName = entry.entryName.toLowerCase();
    if (!entryName.endsWith(".mac") && !entryName.endsWith(".prt")) continue;

    // Use only the filename (strip directory path from inside zip)
    const baseName = path.basename(entry.entryName);
    const destPath = path.join(uploadsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}`);

    fs.writeFileSync(destPath, entry.getData());
    extracted.push({ path: destPath, originalName: baseName });
  }

  return extracted;
}

router.post("/upload-mac", (req, res, next) => {
  upload.array("files")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Upload greška: ${err.message}` });
      return;
    } else if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    res.status(400).json({ error: "Nema uploadanih datoteka" });
    return;
  }

  req.log.info({ count: files.length }, "Processing uploaded files");

  try {
    // Collect all .mac / .prt files to process (directly uploaded + extracted from zips)
    const macFiles: MacFile[] = [];
    const zipPaths: string[] = [];

    for (const file of files) {
      const nameLower = file.originalname.toLowerCase();
      if (nameLower.endsWith(".zip")) {
        zipPaths.push(file.path);
        const extracted = extractMacFilesFromZip(file.path);
        req.log.info({ zip: file.originalname, count: extracted.length }, "Extracted .mac/.prt files from zip");
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
      res.status(400).json({ error: "Nema .mac / .prt datoteka (provjeri da .zip sadrži .mac ili .prt datoteke)" });
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
      req.log.error({ errors: failed }, "Some files failed to parse");
    }

    if (succeeded === 0) {
      const firstError = failed[0]?.error ?? "Nepoznata greška parsera";
      res.status(500).json({
        error: `Nije uspjelo parsirati nijednu datoteku. Greška: ${firstError}`,
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
      message: `Obrađeno ${succeeded} od ${macFiles.length} datoteka`,
      stats,
    });
  } catch (err) {
    req.log.error({ err }, "Error processing uploaded files");
    res.status(500).json({ error: "Greška pri obradi datoteka" });
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

    // Fresh parse of the whole folder — rebuilds knowledge base from scratch
    const filePaths = sourceFiles.map(f => path.join(sourceMacsDir, f));
    const kb = buildKbFromFiles(filePaths);
    saveKnowledgeBase(kb);
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
    const result = parseMacFileIntoKb({ path: filePath, originalName: safe });
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

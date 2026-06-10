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

// python3 is in the Nix store; use absolute path as fallback when PATH doesn't include it
const PYTHON3_BIN =
  process.env["PYTHON3_BIN"] ??
  "/nix/store/1y5i7y4iqd5pvkdvmj2hwlsjizq2ckq2-python3-3.8.18/bin/python3";

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(sourceMacsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    cb(null, `${ts}-${file.originalname}`);
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
      resolve({ success: false, error: err.message });
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

    const results = await Promise.all(macFiles.map(parseMacFile));

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

export default router;

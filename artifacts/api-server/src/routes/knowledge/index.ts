import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import multer from "multer";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");
const parseMacPath = path.resolve(workspaceRoot, "artifacts/api-server/parse_mac.py");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

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
    if (file.originalname.toLowerCase().endsWith(".mac")) {
      cb(null, true);
    } else {
      cb(new Error("Only .mac files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
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

router.post("/upload-mac", upload.array("files"), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    res.status(400).json({ error: "No .mac files uploaded" });
    return;
  }

  req.log.info({ count: files.length }, "Processing uploaded MAC files");

  try {
    const results = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ success: boolean; error?: string }>((resolve) => {
            const args = [
              parseMacPath,
              file.path,
              "--output",
              knowledgeBasePath,
              "--merge",
            ];

            const proc = spawn("python3", args);
            let stderr = "";

            proc.stderr.on("data", (d: Buffer) => {
              stderr += d.toString();
            });

            proc.on("close", (code) => {
              if (code === 0) {
                resolve({ success: true });
              } else {
                resolve({ success: false, error: stderr });
              }
              // Clean up uploaded file
              fs.unlink(file.path, () => {});
            });

            proc.on("error", (err) => {
              resolve({ success: false, error: err.message });
            });
          })
      )
    );

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      req.log.error({ errors: failed }, "Some files failed to parse");
    }

    const kb = readKnowledgeBase();
    const stats = {
      formulaCount: kb.formulas?.length ?? 0,
      parameterCount: kb.parameters?.length ?? 0,
      fileCount: kb._meta?.files_processed ?? files.length,
    };

    res.json({
      success: true,
      message: `Processed ${files.length - failed.length} of ${files.length} files`,
      stats,
    });
  } catch (err) {
    req.log.error({ err }, "Error processing MAC files");
    res.status(500).json({ error: "Failed to process MAC files" });
  }
});

export default router;

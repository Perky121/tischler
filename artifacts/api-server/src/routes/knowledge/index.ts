import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import { logger } from "../../lib/logger";
import { mergeFileIntoKb, mergeInto, deriveParamsFromFormulas, buildKbFromFiles, SYNTAX_RULES, type KnowledgeBase } from "../../lib/parse-mac";
import { parseMtsxFile } from "../../lib/parse-mtsx";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
const sourceMacsDir = path.join(dataDir, "source_macs");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");
const fileSummariesPath = path.join(dataDir, "file_summaries.json");

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
    if (name.endsWith(".mac") || name.endsWith(".zip") || name.endsWith(".prt") || name.endsWith(".mtsx")) {
      cb(null, true);
    } else {
      cb(new Error("Podržane su samo .mac, .prt, .mtsx i .zip datoteke"));
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
  const meta = (kb as unknown as Record<string, unknown>)["_meta"] as Record<string, unknown> | undefined;
  const csv_meta = {
    materials_count: (meta?.["materials_count"] as number | undefined) ?? 0,
    materials_updated_at: (meta?.["materials_updated_at"] as string | undefined) ?? null,
    elements_count: (meta?.["elements_count"] as number | undefined) ?? 0,
    elements_updated_at: (meta?.["elements_updated_at"] as string | undefined) ?? null,
    userparameters_count: (meta?.["userparameters_count"] as number | undefined) ?? 0,
    userparameters_updated_at: (meta?.["userparameters_updated_at"] as string | undefined) ?? null,
  };
  const userparameters = ((kb as unknown as Record<string, unknown>)["userparameters"] as UserParameterEntry[] | undefined) ?? [];
  res.json({
    formulas,
    parameters: kb.parameters ?? [],
    userparameters,
    syntax_rules: kb.syntax_rules ?? [],
    stats,
    csv_meta,
  });
});

type MacFile = { path: string; originalName: string; category?: string };

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
    if (file.originalName.toLowerCase().endsWith(".mtsx")) {
      const { formulas, params } = parseMtsxFile(file.path, file.category);
      existing.parameters = existing.parameters.filter((p) => !p.description?.startsWith("koristi se u "));
      mergeInto(existing, formulas, params);
      existing.syntax_rules = SYNTAX_RULES;
      existing._meta.files_processed = (existing._meta.files_processed ?? 0) + 1;
      deriveParamsFromFormulas(existing);
    } else {
      mergeFileIntoKb(file.path, existing);
    }
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
    if (!entryName.endsWith(".mac") && !entryName.endsWith(".prt") && !entryName.endsWith(".mtsx")) continue;

    // Use only the filename (strip directory path from inside zip)
    const baseName = path.basename(entry.entryName);
    // For .mtsx, the immediate parent folder inside the zip is the category.
    const category = entryName.endsWith(".mtsx")
      ? path.basename(path.dirname(entry.entryName)) || undefined
      : undefined;
    const destPath = path.join(uploadsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}`);

    fs.writeFileSync(destPath, entry.getData());
    extracted.push({ path: destPath, originalName: baseName, category });
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
      res.status(400).json({ error: "Nema .mac / .prt / .mtsx datoteka (provjeri da .zip sadrži podržane datoteke)" });
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

// ── CSV catalogue upload ──────────────────────────────────────────────────────

const csvUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Samo .csv datoteke su podržane"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

/** Parse a semicolon-separated CSV with optional UTF-8 BOM. Returns array of row objects keyed by header column. */
function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  // Strip BOM if present
  const content = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";");
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

type MaterialEntry = {
  key: string;
  desc: string;
  desc2: string;
  thick: number | null;
  group: number;
  tier: "core" | "decor" | "hardware";
};

const DECOR_BRAND_PREFIXES = ["EG_", "KA_", "SK_", "DDL_", "GR_"];
const HARDWARE_BRAND_PREFIXES = ["BL_", "HA_", "HE_", "AS_", "GT_", "KW_", "GTV_", "HX_", "NMC_", "FEK_"];

/**
 * Derive material group (1-11) from key prefix.
 * MAT_GROUP in the CSV is an ARGB color/layer value, not the 1-11 group number.
 * Keys starting with a digit N belong to group N (1=Ploče, 2=Furnir, 3=Masiv,
 * 4=Metarska roba, 5=Staklo, 6=Okov prozori, 7=Okov namještaj, 8=Površinski, 9=Vijci).
 * Brand-prefix hardware keys (BL_, HE_, etc.) map to group 7.
 */
function deriveGroupFromKey(key: string): number {
  const first = key.charAt(0);
  if (first >= "1" && first <= "9") return parseInt(first, 10);
  if (HARDWARE_BRAND_PREFIXES.some(p => key.startsWith(p))) return 7;
  if (DECOR_BRAND_PREFIXES.some(p => key.startsWith(p))) return 1;
  return 0;
}

function parseMaterialsCsv(filePath: string): MaterialEntry[] {
  const rows = parseCsv(filePath);
  const results: MaterialEntry[] = [];
  for (const row of rows) {
    const key = (row["MAT_KEY"] ?? "").trim();
    if (!key) continue;
    const desc = (row["MAT_DESC"] ?? "").trim();
    // Filter separator rows
    if (desc.includes("----") || key.endsWith("---") || key.endsWith("--")) continue;
    const desc2 = (row["MAT_DESC2"] ?? "").trim();
    const thickRaw = parseFloat((row["MAT_THICK"] ?? "0").replace(",", "."));
    const thick = isNaN(thickRaw) || thickRaw === 0 ? null : thickRaw;
    const group = deriveGroupFromKey(key);

    let tier: MaterialEntry["tier"] = "core";
    if (group === 7 || group === 9) {
      tier = "hardware";
    } else if (DECOR_BRAND_PREFIXES.some(p => key.startsWith(p))) {
      tier = "decor";
    }

    results.push({ key, desc, desc2, thick, group, tier });
  }
  return results;
}

const EL_CATEGORY_MAP: Record<string, string> = {
  "1": "Korpus", "2": "Unutrašnjost", "3": "Ladica", "4": "Fronta",
  "5": "Podnožje", "6": "Pultovi", "7": "Razno", "8": "Stolarija",
  "9": "Okov", "K": "Kreveti", "Z": "Fiktivni",
};

type ElementEntry = {
  key: string;
  description: string;
  category: string;
  material?: string;
  mac?: string;
};

function parseElementsCsv(filePath: string): ElementEntry[] {
  const rows = parseCsv(filePath);
  const results: ElementEntry[] = [];
  for (const row of rows) {
    const key = (row["EL_KEY"] ?? "").trim();
    if (!key) continue;
    const description = (row["EL_DESC"] ?? "").trim();
    const prefix = key.charAt(0).toUpperCase();
    const category = EL_CATEGORY_MAP[prefix] ?? "Ostalo";
    const material = (row["EL_MAT1_KEY"] ?? "").trim() || undefined;
    const mac = (row["EL_MAC"] ?? "").trim() || undefined;
    results.push({ key, description, category, material, mac });
  }
  return results;
}

type UserParameterEntry = {
  key: string;
  desc: string;
  caption: string;
  longdesc: string;
  isHelper: boolean;
  allowNeg: boolean;
  isInt: boolean;
  limMin: number | null;
  limMax: number | null;
};

const HELPER_KEY_PATTERN = /^(IZR_\d+|KUT_I\d+)$/;

function parseUserParametersCsv(filePath: string): UserParameterEntry[] {
  const rows = parseCsv(filePath);
  const results: UserParameterEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = (row["UP_KEY"] ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const desc = (row["UP_DESC"] ?? "").trim();
    const caption = (row["UP_CAPTION"] ?? "").trim();
    const longdesc = (row["UP_LONGDESC"] ?? "").trim();
    const isHelper = HELPER_KEY_PATTERN.test(key);
    const allowNeg = (row["UP_ALLOW_NEG"] ?? "").trim() === "1";
    const isInt = (row["UP_IS_INT"] ?? "").trim() === "1";
    const limMinRaw = parseFloat((row["UP_LIM_MIN"] ?? "").replace(",", "."));
    const limMaxRaw = parseFloat((row["UP_LIM_MAX"] ?? "").replace(",", "."));
    const limMin = isNaN(limMinRaw) ? null : limMinRaw;
    const limMax = isNaN(limMaxRaw) ? null : limMaxRaw;
    results.push({ key, desc, caption, longdesc, isHelper, allowNeg, isInt, limMin, limMax });
  }
  return results;
}

router.post("/upload-csv", (req, res, next) => {
  csvUpload.single("file")(req, res, (err) => {
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
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Nema uploadane datoteke" });
    return;
  }

  const csvType = (req.query["type"] as string | undefined)?.toLowerCase();
  if (!csvType || !["materials", "elements", "userparameters"].includes(csvType)) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Parametar type mora biti: materials, elements ili userparameters" });
    return;
  }

  try {
    const kb = loadKnowledgeBase() as unknown as Record<string, unknown>;

    if (!kb["_meta"] || typeof kb["_meta"] !== "object") {
      kb["_meta"] = {};
    }
    const meta = kb["_meta"] as Record<string, unknown>;

    let count = 0;
    if (csvType === "materials") {
      const entries = parseMaterialsCsv(file.path);
      kb["materials"] = entries;
      meta["materials_count"] = entries.length;
      meta["materials_updated_at"] = new Date().toISOString();
      count = entries.length;
      req.log.info({ count }, "Materials CSV imported");
    } else if (csvType === "elements") {
      const entries = parseElementsCsv(file.path);
      kb["elements"] = entries;
      meta["elements_count"] = entries.length;
      meta["elements_updated_at"] = new Date().toISOString();
      count = entries.length;
      req.log.info({ count }, "Elements CSV imported");
    } else {
      const entries = parseUserParametersCsv(file.path);
      kb["userparameters"] = entries;
      meta["userparameters_count"] = entries.length;
      meta["userparameters_updated_at"] = new Date().toISOString();
      count = entries.length;
      req.log.info({ count }, "UserParameters CSV imported");
    }

    fs.writeFileSync(knowledgeBasePath, JSON.stringify(kb, null, 2));
    fs.unlink(file.path, () => {});

    res.json({ success: true, message: `Uvezeno ${count} zapisa (${csvType})`, count });
  } catch (err) {
    fs.unlink(file.path, () => {});
    req.log.error({ err }, "CSV upload failed");
    res.status(500).json({ error: "Greška pri parsiranju CSV datoteke" });
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

// ── File summaries helpers ────────────────────────────────────────────────

type FileSummaries = Record<string, { summary: string; generatedAt: string }>;

function readFileSummaries(): FileSummaries {
  try {
    if (fs.existsSync(fileSummariesPath)) {
      return JSON.parse(fs.readFileSync(fileSummariesPath, "utf-8")) as FileSummaries;
    }
  } catch { /* ignore */ }
  return {};
}

function writeFileSummaries(summaries: FileSummaries): void {
  fs.writeFileSync(fileSummariesPath, JSON.stringify(summaries, null, 2));
}

// ── GET /knowledge/files ──────────────────────────────────────────────────

router.get("/knowledge/files", (req, res): void => {
  try {
    const kb = readKnowledgeBase();
    const summaries = readFileSummaries();

    const sourceFiles = fs.existsSync(sourceMacsDir)
      ? fs.readdirSync(sourceMacsDir).filter((f) => f.toLowerCase().endsWith(".mac"))
      : [];

    const formulaCountBySource = new Map<string, number>();
    for (const f of kb.formulas ?? []) {
      if (f.source) {
        formulaCountBySource.set(f.source, (formulaCountBySource.get(f.source) ?? 0) + 1);
      }
    }

    const files = sourceFiles
      .map((name) => {
        const formulaCount = formulaCountBySource.get(name) ?? 0;
        let uploadedAt = new Date().toISOString();
        try {
          const stat = fs.statSync(path.join(sourceMacsDir, name));
          uploadedAt = stat.mtime.toISOString();
        } catch { /* ignore */ }
        const summaryEntry = summaries[name];
        return {
          name,
          module: name.replace(/\.mac$/i, ""),
          uploadedAt,
          formulaCount,
          summary: summaryEntry?.summary ?? null,
        };
      })
      .filter((f) => f.formulaCount > 0)
      .sort((a, b) => b.formulaCount - a.formulaCount);

    res.json({ files });
  } catch (err) {
    logger.error({ err }, "knowledge/files error");
    res.status(500).json({ error: "Greška pri čitanju popisa datoteka" });
  }
});

// ── POST /knowledge/summarize-file ───────────────────────────────────────

router.post("/knowledge/summarize-file", async (req, res): Promise<void> => {
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ error: "filename je obavezan" });
    return;
  }

  const safe = path.basename(filename);
  const module = safe.replace(/\.mac$/i, "");
  const kb = readKnowledgeBase();
  const formulas = (kb.formulas ?? []).filter((f: { source?: string }) => f.source === safe);

  if (formulas.length === 0) {
    res.status(404).json({ error: `Nema formula za '${safe}'` });
    return;
  }

  const sampleFormulas = formulas.slice(0, 60).map((f: { formula: string; type?: string }) => `[${f.type ?? "?"}] ${f.formula}`).join("\n");

  const prompt = `Ti si ekspert za MegaTischler CAD softver. Analiziraj ${formulas.length} formula iz modula ${module} i napiši sažeto sumirano znanje.

Primjer formula (prvih ${Math.min(60, formulas.length)}/${formulas.length}):
${sampleFormulas}

Napiši: što ovaj modul opisuje, koje su dominantne vrste formula (dimenzije/pozicije/uvjeti/uključenja), koji su ključni parametri i obrasci. Max 120 riječi. Odgovori na hrvatskom.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const summaries = readFileSummaries();
    summaries[safe] = { summary, generatedAt: new Date().toISOString() };
    writeFileSummaries(summaries);

    req.log.info({ filename: safe, chars: summary.length }, "File summary generated");
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error({ err }, "summarize-file failed");
    res.status(500).json({ error: "Greška pri generiranju sažetka" });
  }
});

export default router;

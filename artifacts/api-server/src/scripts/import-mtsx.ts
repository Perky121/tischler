/**
 * One-off importer: reads a .zip of .mtsx files, parses every entry with the
 * .mtsx parser, and merges the extracted formulas + parameters into the shared
 * `data/knowledge_base.json`. Also rewrites `syntax_rules` from the canonical
 * SYNTAX_RULES so the served KB stays in lockstep with the parser.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run import-mtsx -- <path-to-zip>
 *   (defaults to attached_assets/Mtsx_1781621594138.zip when no path is given)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";

import {
  SYNTAX_RULES,
  deriveParamsFromFormulas,
  mergeInto,
  type KnowledgeBase,
} from "../lib/parse-mac";
import { parseMtsxContent } from "../lib/parse-mtsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiServerRoot = path.resolve(here, "..", "..");
const workspaceRoot = path.resolve(apiServerRoot, "..", "..");
const kbPath = path.join(apiServerRoot, "data", "knowledge_base.json");

const zipArg = process.argv[2];
const zipPath = zipArg
  ? path.resolve(zipArg)
  : path.join(workspaceRoot, "attached_assets", "Mtsx_1781621594138.zip");

if (!fs.existsSync(zipPath)) {
  console.error(`❌ Zip nije pronađen: ${zipPath}`);
  process.exit(1);
}

function loadKb(): KnowledgeBase {
  if (fs.existsSync(kbPath)) {
    return JSON.parse(fs.readFileSync(kbPath, "utf-8")) as KnowledgeBase;
  }
  return { formulas: [], parameters: [], syntax_rules: SYNTAX_RULES, _meta: { files_processed: 0 } };
}

const kb = loadKb();

// Idempotent re-import: drop any previously imported .mtsx formulas (and adjust
// the processed-file count) so re-running the script replaces rather than
// duplicates the .mtsx corpus.
const priorMtsxSources = new Set(
  kb.formulas.filter((f) => f.source.toLowerCase().endsWith(".mtsx")).map((f) => f.source),
);
kb.formulas = kb.formulas.filter((f) => !f.source.toLowerCase().endsWith(".mtsx"));
kb._meta.files_processed = Math.max(0, (kb._meta.files_processed ?? 0) - priorMtsxSources.size);

const beforeFormulas = kb.formulas.length;
const beforeParams = kb.parameters.length;

// Drop previously derived params so usage counts get recomputed across the
// combined .mac + .mtsx corpus.
kb.parameters = kb.parameters.filter((p) => !p.description?.startsWith("koristi se u "));

const zip = new AdmZip(zipPath);
const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".mtsx"));

let processed = 0;
const catCount = new Map<string, number>();

for (const entry of entries) {
  const content = entry.getData().toString("utf-8");
  const source = path.basename(entry.entryName);
  const category = path.basename(path.dirname(entry.entryName)) || undefined;
  const { formulas, params } = parseMtsxContent(content, source, category);
  mergeInto(kb, formulas, params);
  processed++;
  if (category) catCount.set(category, (catCount.get(category) ?? 0) + 1);
}

kb._meta.files_processed = (kb._meta.files_processed ?? 0) + processed;
kb.syntax_rules = SYNTAX_RULES;
deriveParamsFromFormulas(kb);

fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2));

console.log(`✅ Importirano ${processed} .mtsx datoteka iz ${path.basename(zipPath)}`);
console.log(`   Formule: ${beforeFormulas} → ${kb.formulas.length} (+${kb.formulas.length - beforeFormulas})`);
console.log(`   Parametri: ${beforeParams} → ${kb.parameters.length}`);
console.log(`   Kategorije: ${[...catCount.entries()].map(([c, n]) => `${c}:${n}`).join(", ")}`);

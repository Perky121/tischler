/**
 * CLI guard: fails (exit 1) when the served knowledge base diverges from the
 * parser's canonical syntax-rules list.
 *
 * `SYNTAX_RULES` in `src/lib/parse-mac.ts` is the single source of truth. The
 * parser writes those rules into `data/knowledge_base.json` whenever the .mac
 * files are (re)parsed, and the chat route injects the JSON copy into the AI
 * prompt. If someone edits `SYNTAX_RULES` without re-parsing, the served JSON
 * silently keeps the old rules and the AI drifts away from the parser.
 *
 * Run with `pnpm --filter @workspace/api-server run check:syntax-rules`.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { SYNTAX_RULES } from "../lib/parse-mac";

const here = path.dirname(fileURLToPath(import.meta.url));
const kbPath = path.join(here, "..", "..", "data", "knowledge_base.json");

const problems: string[] = [];

let live: unknown[] = [];
try {
  const kb = JSON.parse(fs.readFileSync(kbPath, "utf-8")) as { syntax_rules?: unknown };
  live = Array.isArray(kb.syntax_rules) ? kb.syntax_rules : [];
  if (!Array.isArray(kb.syntax_rules)) {
    problems.push("knowledge_base.json nema polje 'syntax_rules' (ili nije lista).");
  }
} catch (err) {
  console.error(`❌ Ne mogu pročitati ${kbPath}: ${(err as Error).message}`);
  process.exit(1);
}

if (live.length !== SYNTAX_RULES.length) {
  problems.push(
    `Broj pravila se razlikuje: parser (SYNTAX_RULES)=${SYNTAX_RULES.length}, knowledge_base.json=${live.length}.`,
  );
}

const max = Math.max(live.length, SYNTAX_RULES.length);
for (let i = 0; i < max; i++) {
  const fromParser = SYNTAX_RULES[i];
  const fromKb = live[i];
  if (fromParser !== fromKb) {
    problems.push(
      `Pravilo #${i + 1} se razlikuje:\n` +
        `    parser: ${fromParser ?? "(nedostaje)"}\n` +
        `    baza:   ${typeof fromKb === "string" ? fromKb : fromKb === undefined ? "(nedostaje)" : JSON.stringify(fromKb)}`,
    );
  }
}

if (problems.length === 0) {
  console.log(`✅ syntax_rules u knowledge_base.json usklađeni s parserom (${SYNTAX_RULES.length} pravila).`);
  process.exit(0);
}

console.error(
  `❌ Pronađeno ${problems.length} razilaženja između SYNTAX_RULES (parse-mac.ts) i knowledge_base.json:\n`,
);
for (const p of problems) {
  console.error(`  • ${p}`);
}
console.error(
  "\nUskladi knowledge_base.json s parserom: ponovno parsiraj .mac datoteke (/api/upload-mac)\n" +
    "ili ažuriraj polje 'syntax_rules' u artifacts/api-server/data/knowledge_base.json tako da\n" +
    "odgovara konstanti SYNTAX_RULES u artifacts/api-server/src/lib/parse-mac.ts.",
);
process.exit(1);

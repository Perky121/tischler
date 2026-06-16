/**
 * CLI guard: fails (exit 1) when the rules shown in the app diverge from the AI
 * prompt facts. Run with `pnpm --filter @workspace/formula-rules run check`.
 */

import { findRuleInconsistencies } from "./consistency";

const problems = findRuleInconsistencies();

if (problems.length === 0) {
  console.log("✅ Pravila prikaza i AI prompta su usklađena.");
  process.exit(0);
}

console.error(`❌ Pronađeno ${problems.length} razilaženja prikazanih pravila i AI prompta:\n`);
for (const p of problems) {
  console.error(`  • ${p}`);
}
console.error(
  "\nUskladi vrijednosti u lib/formula-rules/src/display.ts i lib/formula-rules/src/prompt.ts.",
);
process.exit(1);

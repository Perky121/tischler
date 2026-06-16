/**
 * Consistency guard between the structured rules shown in the app (`display.ts`)
 * and the prose blocks injected into the AI system prompt (`prompt.ts`).
 *
 * Returns a list of human-readable problems. An empty list means the displayed
 * rules and the AI instructions agree on every key fact. Run via
 * `consistency.check.ts` (exits non-zero on any mismatch) so a divergence breaks
 * the build instead of silently drifting.
 */

import {
  ANTI_PATTERNS,
  COMPARISON_OPERATORS,
  FORMULA_PATTERNS,
  FUNCTIONS,
  HIERARCHY,
  HIERARCHY_NAMED,
  HIERARCHY_NOTE,
  LOGICAL_OPERATORS,
  MATERIAL_CODES,
  MODULE_TYPES,
  OPERATORS_NOTE,
  SYSTEM_VARIABLES,
} from "./display";
import {
  ANTI_PATTERNS_PROMPT,
  buildHierarchyGuide,
  FORMULA_PATTERNS_PROMPT,
  FUNCTIONS_AND_OPERATORS,
  MODULE_DOMINANT_TYPE,
} from "./prompt";

/** The leading token of a formula-pattern count, e.g. "11× (identično…)" → "11×". */
function countNeedle(count: string): string {
  const idx = count.indexOf(" (");
  return idx === -1 ? count : count.slice(0, idx);
}

/** The stable name token of a function, e.g. "ABS(x) / abs(x)" → "ABS". */
function functionToken(name: string): string {
  const idx = name.indexOf("(");
  return idx === -1 ? name : name.slice(0, idx);
}

export function findRuleInconsistencies(): string[] {
  const problems: string[] = [];

  // ── Operators: each symbol's occurrence count must appear in the prompt ──────
  for (const op of [...COMPARISON_OPERATORS, ...LOGICAL_OPERATORS, ...SYSTEM_VARIABLES]) {
    const needle = `(${op.count} formula)`;
    if (!FUNCTIONS_AND_OPERATORS.includes(needle)) {
      problems.push(
        `Operator/varijabla "${op.symbol}": prikaz navodi ${op.count} pojava, ali "${needle}" nije u FUNCTIONS_AND_OPERATORS promptu.`,
      );
    }
  }

  // Operators note: the AND/OR breakdown must match
  if (OPERATORS_NOTE.includes("AND:50, OR:32") && !FUNCTIONS_AND_OPERATORS.includes("AND:50, OR:32")) {
    problems.push(`OPERATORS_NOTE navodi "AND:50, OR:32", ali to nije u promptu.`);
  }

  // ── Functions: name token + occurrence count must appear in the prompt ───────
  for (const fn of FUNCTIONS) {
    const token = functionToken(fn.name);
    if (!FUNCTIONS_AND_OPERATORS.includes(token)) {
      problems.push(`Funkcija "${fn.name}": token "${token}" nije u FUNCTIONS_AND_OPERATORS promptu.`);
    }
    if (!FUNCTIONS_AND_OPERATORS.includes(String(fn.count))) {
      problems.push(
        `Funkcija "${fn.name}": prikaz navodi ${fn.count} pojava, ali "${fn.count}" nije u FUNCTIONS_AND_OPERATORS promptu.`,
      );
    }
  }

  // ── Material codes: every displayed code must be listed in the prompt ────────
  for (const code of MATERIAL_CODES) {
    if (!FUNCTIONS_AND_OPERATORS.includes(code)) {
      problems.push(`Materijalni kod "${code}" prikazan u aplikaciji nije naveden u promptu.`);
    }
  }

  // ── Anti-patterns: both the wrong and the correct form must appear ───────────
  for (const ap of ANTI_PATTERNS) {
    if (!ANTI_PATTERNS_PROMPT.includes(ap.wrong)) {
      problems.push(`Anti-pattern: pogrešni oblik "${ap.wrong}" nije u ANTI_PATTERNS promptu.`);
    }
    if (!ANTI_PATTERNS_PROMPT.includes(ap.correct)) {
      problems.push(`Anti-pattern: ispravni oblik "${ap.correct}" nije u ANTI_PATTERNS promptu.`);
    }
  }

  // ── Formula patterns: the count needle must appear in the prompt ─────────────
  for (const fp of FORMULA_PATTERNS) {
    const needle = countNeedle(fp.count);
    if (!FORMULA_PATTERNS_PROMPT.includes(needle)) {
      problems.push(
        `Obrazac "${fp.title}": prikaz navodi "${fp.count}", ali "${needle}" nije u FORMULA_PATTERNS promptu.`,
      );
    }
  }

  // ── Modules: derived prompt map must equal the displayed type, key by key ────
  for (const m of MODULE_TYPES) {
    const promptType = MODULE_DOMINANT_TYPE[`${m.module}.mac`];
    if (promptType !== m.type) {
      problems.push(
        `Modul "${m.module}": prikaz="${m.type}" ≠ prompt="${promptType ?? "(nedostaje)"}".`,
      );
    }
  }

  // ── Hierarchy: every displayed reference + the critical note must be in guide ─
  const guide = buildHierarchyGuide([]);
  for (const row of [...HIERARCHY, ...HIERARCHY_NAMED]) {
    if (!guide.includes(row.ref)) {
      problems.push(`Hijerarhija: referenca "${row.ref}" nije u buildHierarchyGuide izlazu.`);
    }
  }
  if (!guide.includes(HIERARCHY_NOTE)) {
    problems.push(`Hijerarhija: HIERARCHY_NOTE nije u buildHierarchyGuide izlazu.`);
  }

  return problems;
}

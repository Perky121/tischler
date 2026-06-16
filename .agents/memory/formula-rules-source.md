---
name: Formula rules single source
description: Where MegaTischler formula rules live and what keeps display vs AI prompt from drifting
---

# Formula rules: single source of truth

Strukturirana pravila o formulama žive u libu `@workspace/formula-rules`
(`lib/formula-rules/src/`):

- `display.ts` — strukturirani podaci (operatori, funkcije, anti-patterni,
  obrasci, hijerarhija, moduli) koje aplikacija prikazuje. Frontend
  `artifacts/app/src/data/formula-rules.ts` samo re-eksportira lib.
- `prompt.ts` — prozni blokovi koji idu u AI system prompt
  (`ANTI_PATTERNS_PROMPT`, `FUNCTIONS_AND_OPERATORS`, `FORMULA_PATTERNS_PROMPT`).
  `MODULE_DOMINANT_TYPE` i `buildHierarchyGuide` se IZVODE iz `display.ts` pa se
  ne mogu razići. Backend `chat/index.ts` uvozi ovih 5 imena.

**Pravilo:** kad mijenjaš broj pojava, materijalni kod, anti-pattern ili obrazac
u `display.ts`, MORAŠ uskladiti i proznu vrijednost u `prompt.ts` (i obrnuto).

**Why:** prozni blokovi su slobodan tekst (AI ponašanje), pa ih izvođenje iz
podataka ne pokriva; ručno zrcaljenje se prije razilazilo (npr. `…` vs `...`).

**How to apply:** `findRuleInconsistencies()` u `consistency.ts` provjerava da se
brojevi/kodovi/reference iz `display.ts` pojavljuju u proznim blokovima. CLI
`consistency.check.ts` pukne (exit 1) na razilaženje; registriran kao validacijski
korak `rules-consistency` (`pnpm --filter @workspace/formula-rules run check`).

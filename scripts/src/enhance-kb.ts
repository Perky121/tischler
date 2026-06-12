/**
 * enhance-kb.ts
 * Adds to knowledge_base.json:
 *   1. kb.modules[]  — descriptions for all 9 known modules
 *   2. kb.learned    — initialised empty structure
 *   3. formula.type  — auto-classified intent tag for each formula
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_PATH = path.resolve(
  __dirname,
  "../../artifacts/api-server/data/knowledge_base.json"
);

const kb = JSON.parse(fs.readFileSync(KB_PATH, "utf-8"));

// ─── 1. MODULE DESCRIPTIONS ───────────────────────────────────────────────────
const MODULE_DESCRIPTIONS: Record<
  string,
  { opis: string; tipicni_parametri: string[]; keywords: string[] }
> = {
  "KUH_VISOKI.mac": {
    opis:
      "Visoki kuhinjski ormarići — integrirana ugradna oprema: hladnjak, zamrzivač, kombinirani hladnjak, stupni ormari. Najkompleksniji modul s >130 parametara.",
    tipicni_parametri: ["KOAP", "KDT", "HPP1", "HPP2", "HDTD1", "HDTD2", "HSTR", "LEDIZRK"],
    keywords: ["visoki", "hladnjak", "zamrzivač", "stupni", "ugradni", "aparati", "leđa puna"],
  },
  "KUTNI.mac": {
    opis:
      "Kutni kuhinjski ormarići — Le Mans II mehanizam, karusel police, otvaranje u kutu zidova. Podržava kut zidova koji nije 90° putem KZ (kut razlike) i KT (smjer kuta).",
    tipicni_parametri: ["KZ", "KT", "ZRK", "ODPLM2", "HPP1", "LEDIZRK"],
    keywords: ["kutni", "kut", "le mans", "karusel", "uglovni", "kutak"],
  },
  "KUTNI_VANJSKI.mac": {
    opis:
      "Vanjski kutni kuhinjski ormarići — slično KUTNI.mac, ali za vanjske kutne pozicije. KZ/KT parametri za kompenzaciju kuta zida.",
    tipicni_parametri: ["KZ", "KT", "ZRK", "HPP1"],
    keywords: ["kutni vanjski", "vanjski kut", "external corner"],
  },
  "MIKROVALNA.mac": {
    opis:
      "Viseći ormarić s ugradnom mikrovalnom pećnicom ili griljom. Parameterizira nosač mikrovalke, okvir i poziciju aparata.",
    tipicni_parametri: ["KOAP", "HPP1", "ZRK", "ODU"],
    keywords: ["mikrovalnica", "mikrovalna", "grill", "ugradna"],
  },
  "NAPA.mac": {
    opis:
      "Kuhinjska napa (aspirator) — viseći ormarić s napostrojem za otvorenu ili skrivenu napu. Dimenzioniranje nape i okolnih ploča.",
    tipicni_parametri: ["HPP1", "ZRK", "ODU", "GLU"],
    keywords: ["napa", "aspirator", "odvod", "ventilacija"],
  },
  "VISECI.mac": {
    opis:
      "Viseći kuhinjski ormarići — standardni zidni ormarići s policama. Najčešće korišten modul uz KUH_VISOKI za gornje elemente kuhinje.",
    tipicni_parametri: ["HPP1", "HPP2", "ZRK", "ODU", "GLU", "LEDIZRK"],
    keywords: ["viseći", "viseci", "gornji ormar", "zidni ormar", "police"],
  },
  "PECNICA.mac": {
    opis:
      "Ugradna pećnica — modul za integraciju pećnice u visoki ormarić ili posebni okvir. Pozicioniranje i dimenzije nosačke konstrukcije.",
    tipicni_parametri: ["KOAP", "HPP1", "HSTR", "ZRK"],
    keywords: ["pećnica", "pecnica", "ugradna pećnica", "oven"],
  },
  "PERILICA.mac": {
    opis:
      "Ugradna perilica posuđa — integracija perilice u donji ormarić. Dimenzioniranje prednjeg panela i okvira.",
    tipicni_parametri: ["HPP1", "ZRK", "ODU"],
    keywords: ["perilica", "perilica posuđa", "dishwasher"],
  },
  "OTVORENI.mac": {
    opis:
      "Otvoreni polični ormarići bez vrata — jednostavniji modul za police i niše. Minimalan set parametara.",
    tipicni_parametri: ["ZRK", "ODU", "HPP1"],
    keywords: ["otvoreni", "police", "niša", "polica bez vrata", "bookcase"],
  },
};

const existingModuleNames = new Set(
  (kb.modules ?? []).map((m: { name: string }) => m.name)
);

let addedModules = 0;
const modulesArray: typeof kb.modules = kb.modules ?? [];

for (const [name, info] of Object.entries(MODULE_DESCRIPTIONS)) {
  if (!existingModuleNames.has(name)) {
    modulesArray.push({ name, ...info });
    console.log("  Modul dodan:", name);
    addedModules++;
  } else {
    // Update existing entry to ensure keywords are present
    const existing = modulesArray.find((m: { name: string }) => m.name === name);
    if (existing && !existing.keywords) {
      existing.keywords = info.keywords;
      console.log("  Keywords dodani:", name);
      addedModules++;
    }
  }
}
kb.modules = modulesArray;
console.log(`\nUkupno modula dodano/ažurirano: ${addedModules}`);

// ─── 2. INITIALIZE kb.learned ─────────────────────────────────────────────────
if (!kb.learned || typeof kb.learned !== "object" || Array.isArray(kb.learned)) {
  kb.learned = {
    confirmed_formulas: [] as Array<{
      formula: string;
      source: string;
      confirmed_at: string;
      context: string;
    }>,
    confirmed_patterns: [] as Array<{
      name: string;
      pattern: string;
      description: string;
      confirmed_at: string;
    }>,
    observations: [] as Array<{
      note: string;
      added_at: string;
    }>,
  };
  console.log("\nkb.learned inicijaliziran.");
} else {
  // Ensure all sub-arrays exist
  kb.learned.confirmed_formulas = kb.learned.confirmed_formulas ?? [];
  kb.learned.confirmed_patterns = kb.learned.confirmed_patterns ?? [];
  kb.learned.observations = kb.learned.observations ?? [];
  console.log("\nkb.learned već postoji, provjerene sub-array strukture.");
}

// ─── 3. FORMULA TYPE TAGS ─────────────────────────────────────────────────────
function classifyFormula(formula: string): string {
  const f = formula.trim();

  // Explicit on/off inclusion patterns
  if (/^if\s*\(.+;\s*0\s*;\s*1\s*\)|^if\s*\(.+;\s*1\s*;\s*0\s*\)/i.test(f))
    return "ukljucenje";

  // Conditional formulas (complex if/ifelse chains)
  if (/^if\s*\(|^ifelse\s*\(/i.test(f)) {
    // If the formula result is a position/rotation value, classify more specifically
    if (/Rx|Ry|Rz|kut|cos\s*\(|sin\s*\(/i.test(f)) return "rotacija";
    if (/\.(Z|Y|X)\]|\bZ\b|\bY\b|\bX\b/.test(f) && /\+|-|\*/.test(f)) return "pozicija";
    if (/\.(W|L|T|D|H)\]|\bW\b|\bL\b|\bT\b/.test(f) && /\+|-|\*/.test(f)) return "dimenzija";
    return "uvjet"; // generic conditional
  }

  // Rotation / trigonometry
  if (/\b(Rx|Ry|Rz)\b|cos\s*\(|sin\s*\(|tan\s*\(|acos\s*\(|asin\s*\(/.test(f))
    return "rotacija";

  // Positioning — references a position param (Z, Y, X) with arithmetic
  if (/\[\.*[A-Za-z0-9_.]*\.(Z|Y|X)\]/.test(f) && /[+\-*\/]/.test(f))
    return "pozicija";
  if (/\[\.*[A-Za-z0-9_.]*\.(Z|Y|X)\]/.test(f)) return "pozicija";

  // Dimension — references a size param (W, L, T, D, H)
  if (/\[\.*[A-Za-z0-9_.]*\.(W|L|T|D|H)\]/.test(f)) return "dimenzija";

  // Plain dimension formula with bare param names
  if (/\b(W|L|T|D|H)\b/.test(f) && /\[/.test(f)) return "dimenzija";

  // Fallback: has brackets → general reference
  if (/\[/.test(f)) return "referenca";

  return "konstanta";
}

let typed = 0;
let alreadyTyped = 0;
for (const formula of (kb.formulas ?? []) as Array<{
  formula: string;
  source: string;
  type?: string;
}>) {
  if (!formula.type) {
    formula.type = classifyFormula(formula.formula);
    typed++;
  } else {
    alreadyTyped++;
  }
}

// Print distribution
const dist: Record<string, number> = {};
for (const f of kb.formulas) dist[f.type] = (dist[f.type] ?? 0) + 1;
console.log(`\nFormula type distribucija (${typed} novih, ${alreadyTyped} već imalo):`);
for (const [t, n] of Object.entries(dist).sort((a, b) => (b[1] as number) - (a[1] as number))) {
  console.log(`  ${t}: ${n}`);
}

// ─── WRITE ────────────────────────────────────────────────────────────────────
fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2));
console.log("\nZapisano u knowledge_base.json ✓");

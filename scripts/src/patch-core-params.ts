/**
 * Adds descriptions for the fundamental MegaTischler element parameters
 * (T, Z, Y, X, W, L, Rx, Ry, Rz, D, H, Ks) that appear most frequently
 * in formulas but had no description in the KB.
 */
import fs from "fs";
import path from "path";

const workspaceRoot = process.cwd().endsWith("scripts")
  ? path.resolve(process.cwd(), "..")
  : process.cwd();
const kbPath = path.resolve(workspaceRoot, "artifacts/api-server/data/knowledge_base.json");

// Fundamental MegaTischler built-in element parameters
const CORE_PARAM_DESCRIPTIONS: Record<string, { description: string; typical_values?: string[] }> = {
  T: {
    description: "Debljina elementa (thickness) — temeljna dimenzija svake ploče ili profila; npr. [.T] = debljina roditelja",
    typical_values: ["0,5", "1", "16", "18", "19", "22", "25"],
  },
  W: {
    description: "Širina elementa — poprečna dimenzija u lokalnom koordinatnom sustavu elementa",
    typical_values: ["300", "400", "600", "900", "1200"],
  },
  L: {
    description: "Duljina elementa — uzdužna dimenzija (za stojećih ploča = visina ploče); često se miješa s H",
    typical_values: ["500", "720", "900", "2000", "2400"],
  },
  X: {
    description: "Pozicija elementa na X-osi (horizontala, lijevo→desno) — uvijek u koordinatnom sustavu roditelja",
    typical_values: ["0", "[.T]", "[.W]-[T]"],
  },
  Y: {
    description: "Pozicija elementa na Y-osi (dubina, sprijeda→straga) — uvijek u koordinatnom sustavu roditelja",
    typical_values: ["0", "[.T]", "[.D]-[T]"],
  },
  Z: {
    description: "Pozicija elementa na Z-osi (vertikala, odozdo→gore) — npr. [.Pod.Z]+[.Pod.T] = vrh poda",
    typical_values: ["0", "[.Pod.Z]+[.Pod.T]", "[.H]-[T]"],
  },
  Rx: {
    description: "Rotacija elementa oko X-osi u stupnjevima — koristi se za nagnute/zarotiran e dijelove",
    typical_values: ["0", "90", "-90"],
  },
  Ry: {
    description: "Rotacija elementa oko Y-osi u stupnjevima — npr. za horizontalne ploče rotiramo Ry=90",
    typical_values: ["0", "90", "-90"],
  },
  Rz: {
    description: "Rotacija elementa oko Z-osi u stupnjevima — okretanje u tlocrtu (kutni namještaj)",
    typical_values: ["0", "[KZ]", "-[KZ]", "90"],
  },
  D: {
    description: "Dubina ormarića/elementa (depth) — korisnički parametar koji definira dubinu od prednjeg do stražnjeg ruba",
    typical_values: ["300", "380", "580", "600"],
  },
  H: {
    description: "Visina ormarića/elementa (height) — korisnički parametar za ukupnu visinu konstrukcije",
    typical_values: ["720", "900", "2000", "2200", "2400"],
  },
  Ks: {
    description: "Korekcija stranice — odmak/korekcija pozicije stranice pri montaži ili posebnim konstrukcijama",
  },
};

function run() {
  const kb = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
  const params: Array<{ name: string; description: string; typical_values?: string[] }> = kb.parameters;

  let updated = 0;
  for (const param of params) {
    const patch = CORE_PARAM_DESCRIPTIONS[param.name];
    if (patch && (!param.description || !param.description.trim())) {
      param.description = patch.description;
      if (patch.typical_values && (!param.typical_values || !param.typical_values.length)) {
        param.typical_values = patch.typical_values;
      }
      console.log(`  Patched: ${param.name} — ${param.description.slice(0, 70)}`);
      updated++;
    }
  }

  console.log(`\nAžurirano: ${updated} parametara`);
  fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2), "utf-8");
  console.log("Zapisano u knowledge_base.json");
}

run();

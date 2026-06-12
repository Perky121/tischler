import fs from "fs";
import path from "path";

const workspaceRoot = process.cwd().endsWith("scripts")
  ? path.resolve(process.cwd(), "..")
  : process.cwd();

const csvPath = path.resolve(workspaceRoot, "attached_assets/MATERIALS_1781255204523.csv");
const kbPath = path.resolve(workspaceRoot, "artifacts/api-server/data/knowledge_base.json");

interface MaterialEntry {
  key: string;
  desc: string;
  desc2: string;
  thick: number | null;
  group: number;
  tier: "core" | "decor" | "hardware";
}

// Remove BOM if present and split into lines
function parseCSV(raw: string): string[][] {
  const content = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  return content
    .split(/\r?\n/)
    .slice(1) // skip header
    .filter(l => l.trim().length > 0)
    .map(l => l.split(";"));
}

function isSeparatorDesc(desc: string): boolean {
  const t = desc.trim();
  return !t || /^[-=x]{3,}$/.test(t) || /^-{3,}/.test(t) || /^={3,}/.test(t) || /^x{3,}/.test(t);
}

const CORE_PREFIXES_1 = [
  "1MDF", "1IL", "1IV", "1MP", "1SP", "1PA", "1PF", "1RP",
  "1SACE", "1STIR", "1UP", "1VK", "1MIP", "1MIPC", "1HDF",
];

const HARDWARE_BRAND_PREFIXES = [
  "BL_", "HA_", "HE_", "AS_", "GT_PB", "GT_",
  "SCH_", "SP_", "IN_", "DT_", "BC_", "OS_",
  "IF_", "SI_", "GP_", "FO_",
];

function getTier(key: string, art1: number): MaterialEntry["tier"] {
  const firstChar = key.charAt(0);

  if (/^\d/.test(firstChar)) {
    // numeric-prefix keys
    if (key.startsWith("1")) {
      // only truly generic boards are "core"
      const isGeneric = CORE_PREFIXES_1.some(p => key.startsWith(p));
      return isGeneric ? "core" : "decor";
    }
    // 2=furnir, 3=masiv categories — only separators/headers, handled upstream
    if (key.startsWith("2") || key.startsWith("3")) return "decor";
    // 4=edgebanding, 5=glass, 7=hardware, 8=surface, 9=screws
    return "core";
  }

  // letter-prefix keys
  const isHardwareBrand = HARDWARE_BRAND_PREFIXES.some(p => key.startsWith(p));
  if (isHardwareBrand || art1 === 6 || art1 === 7) return "hardware";

  // letter-prefix but not hardware = decor brand (EG_, KA_, SK_, DDL_, GR_, etc.)
  return "decor";
}

function parseThick(val: string): number | null {
  const v = val.trim().replace(",", ".");
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function run() {
  console.log("Reading CSV...");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(raw);

  const materials: MaterialEntry[] = [];
  let skipped = 0;

  for (const cols of rows) {
    const key = (cols[0] ?? "").trim();
    const desc = (cols[2] ?? "").trim();
    const desc2 = (cols[3] ?? "").trim();
    const thickRaw = (cols[6] ?? "").trim();
    const art1Raw = (cols[11] ?? "").trim();

    if (!key) { skipped++; continue; }
    if (isSeparatorDesc(desc) && !desc2) { skipped++; continue; }

    const art1 = parseInt(art1Raw, 10);
    const thick = parseThick(thickRaw);
    const tier = getTier(key, isNaN(art1) ? 0 : art1);

    materials.push({
      key,
      desc: desc || key,
      desc2,
      thick: thick === 0 ? null : thick,
      group: isNaN(art1) ? 0 : art1,
      tier,
    });
  }

  console.log(`Parsed: ${materials.length} materials, skipped ${skipped} separator rows`);

  const coreMats = materials.filter(m => m.tier === "core");
  const decorMats = materials.filter(m => m.tier === "decor");
  const hwMats = materials.filter(m => m.tier === "hardware");
  console.log(`  core: ${coreMats.length} | decor: ${decorMats.length} | hardware: ${hwMats.length}`);

  console.log("Reading knowledge base...");
  const kb = JSON.parse(fs.readFileSync(kbPath, "utf-8"));

  const prevCount = (kb.materials ?? []).length;
  kb.materials = materials;

  if (!kb._meta) kb._meta = {};
  kb._meta.materialsImportedAt = new Date().toISOString();
  kb._meta.materialsCount = materials.length;

  console.log(`Writing KB (prev materials: ${prevCount} → now: ${materials.length})...`);
  fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2), "utf-8");
  console.log("Done.");
}

run();

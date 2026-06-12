import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { SendChatBody } from "@workspace/api-zod";
import { logger } from "../../lib/logger";
// Type aliases matching @anthropic-ai/sdk shapes — avoids resolving the SDK subpath
// across workspace package boundaries.
type TextBlockParam = { type: "text"; text: string };
type ImageBlockParam = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
};
type MessageParam = { role: "user" | "assistant"; content: string | Array<TextBlockParam | ImageBlockParam> };

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");
const rulesPath = path.join(dataDir, "stipe_rules.txt");
const conceptualGuidePath = path.join(dataDir, "konceptualni_vodic_parametrizacije.txt");

function readKnowledgeBase() {
  try {
    if (fs.existsSync(knowledgeBasePath)) {
      return JSON.parse(fs.readFileSync(knowledgeBasePath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return { formulas: [], parameters: [], syntax_rules: [], _meta: {} };
}

function readRules(): string {
  try {
    if (fs.existsSync(rulesPath)) {
      return fs.readFileSync(rulesPath, "utf-8").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

function readConceptualGuide(): string {
  try {
    if (fs.existsSync(conceptualGuidePath)) {
      return fs.readFileSync(conceptualGuidePath, "utf-8").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

interface SessionContext {
  dialogType?: string;
  parametersSeen?: Array<{ name: string; value: string }>;
  formulasSeen?: string[];
  moduleHint?: string | null;
  summary?: string;
  lastUpdated?: string;
}

// ── Material catalog: compact injection into system prompt ────────────────────

interface MaterialEntry {
  key: string;
  desc: string;
  desc2: string;
  thick: number | null;
  group: number;
  tier: "core" | "decor" | "hardware";
}

const GROUP_LABELS: Record<number, string> = {
  1: "Ploče",
  2: "Furnir",
  3: "Masiv",
  4: "Metarska roba",
  5: "Staklo/Limovi",
  6: "Okov prozori",
  7: "Okov za namještaj",
  8: "Površinski materijali",
  9: "Vijci/Spojevi",
  10: "Nabavna roba",
  11: "Gabariti",
};

/**
 * Build a compact materials section for the system prompt.
 * Tier "core" materials are always injected (structural boards, edgebanding, glass, hardware).
 * Tier "decor" and "hardware" materials are injected only when their key appears in context.
 */
function buildMaterialsCatalog(
  allMaterials: MaterialEntry[],
  userMessage: string,
  sessionCtx?: SessionContext | null,
): string {
  if (!allMaterials?.length) return "";

  // Detect material keys mentioned in context (screenshots, messages, session)
  const combinedText = [
    userMessage,
    ...(sessionCtx?.formulasSeen ?? []),
    ...(sessionCtx?.parametersSeen?.map(p => `${p.name} ${p.value}`) ?? []),
    sessionCtx?.summary ?? "",
  ].join(" ").toUpperCase();

  const mentionedKeys = new Set<string>();
  for (const m of allMaterials) {
    if (combinedText.includes(m.key.toUpperCase())) mentionedKeys.add(m.key);
  }

  const lines: string[] = [
    `KATALOG MATERIJALA (MAT_KEY — šifra materijala u MegaTischleru):`,
    `Prefiks grupe: 1=Ploče, 4=Metarska roba (kant trake/profili), 5=Staklo, 7=Okov namještaj, 8=Površinski mat., 9=Vijci`,
    `DEKORI — konvencija: EG_U702ST9_19=Egger U702 ST9 19mm ploča | _01=0,8mm ultrapas/dekor | _A1023=ABS kant 1mm/23mm | _A0823=ABS 0,8mm/23mm`,
    `BRENDOVI: EG_=Egger, KA_=Kaindl, SK_=Schattdecor, DDL_=DDL, GR_=Granitog, BL_=Blum, HA_/HE_=Hettich, AS_=AluStyle, GT_=Grass`,
  ];

  // Group core materials by their group number
  const coreMats = allMaterials.filter(m => m.tier === "core");
  const coreByGroup = new Map<number, MaterialEntry[]>();
  for (const m of coreMats) {
    const g = coreByGroup.get(m.group) ?? [];
    g.push(m);
    coreByGroup.set(m.group, g);
  }

  // For G7 (hardware) and G9 (screws) — skip pure size-variant entries that end in
  // an underscore + digits (e.g. 7OPG_KV_F20_21 through _44). Keep the category
  // headers and base-type keys so the prompt stays compact (~100 G7 entries max).
  function isHardwareSizeVariant(key: string): boolean {
    // ends with _digits (size variant like 7OPG_KV_F20_21, 9EU6X09)
    return /_\d+$/.test(key) || /\d{2,}$/.test(key);
  }

  const groupOrder = [1, 4, 5, 8, 7, 9];
  for (const g of groupOrder) {
    let mats = coreByGroup.get(g);
    if (!mats?.length) continue;

    // Compact hardware: skip size variants; keep headers + named types
    if (g === 7 || g === 9) {
      mats = mats.filter(m => !isHardwareSizeVariant(m.key));
    }

    const label = GROUP_LABELS[g] ?? `Grupa ${g}`;
    lines.push(`\n${label.toUpperCase()} (${g}*):`);
    for (const m of mats) {
      const thickStr = m.thick ? ` ${m.thick}mm` : "";
      const d2 = m.desc2 ? ` (${m.desc2})` : "";
      lines.push(`  ${m.key} — ${m.desc}${thickStr}${d2}`);
    }
  }

  // Inject any mentioned decor/hardware materials from context
  const mentioned = allMaterials.filter(
    m => m.tier !== "core" && mentionedKeys.has(m.key),
  );
  if (mentioned.length) {
    lines.push(`\nMATERIJALI VIDLJIVI/SPOMINJANI U OVOM KONTEKSTU:`);
    for (const m of mentioned) {
      const thickStr = m.thick ? ` ${m.thick}mm` : "";
      const d2 = m.desc2 ? ` — ${m.desc2}` : "";
      const groupLabel = GROUP_LABELS[m.group] ?? `Grupa ${m.group}`;
      lines.push(`  ${m.key} — ${m.desc}${thickStr}${d2} [${groupLabel}]`);
    }
  }

  return lines.join("\n");
}

// ── Element catalog: compact injection into system prompt ─────────────────────

interface ElementEntry {
  key: string;
  description: string;
  category: string;
  material?: string;
  mac?: string;
}

/**
 * Build a compact elements section for the system prompt.
 * Injects: naming convention + "Ostalo" (no-prefix) elements + mentioned elements.
 */
function buildElementsCatalog(
  allElements: ElementEntry[],
  userMessage: string,
  sessionCtx?: SessionContext | null,
): string {
  if (!allElements?.length) return "";

  const lines: string[] = [
    `KATALOG ELEMENATA (upisuje se u polje "Elem" u dijalogu elementa):`,
    `Prefiks=kategorija: 1=Korpus, 2=Unutrašnjost, 3=Ladica, 4=Fronta, 5=Podnožje, 6=Pultovi, 7=Razno, 8=Stolarija, 9=Okov, K=Kreveti, Z=Fiktivni(ne ispisuje se)`,
    `Sufiks=kantovani rubovi: _PXXX=Prednji, _PSXX=P+S, _PXLX=P+L, _PXXD=P+D, _PXLD=P+L+D, _PSLD=svi 4 ruba, _DLDG=D+L+D+G`,
    `Materijalni sufiks: _FF=furnir-furnir kant, _FM=furnir-masiv kant, _MAS=masiv, _MDF=MDF, _ST=staklo`,
    `Materijali: 1IL18=iveral18mm, 1IL16=iveral16mm, 1IV18=furniran18mm, 1MDF18=MDF18mm, 1MP18=masiv18mm, 3MAS=masiv profil`,
    `Fiktivni Z_ elementi se NE ispisuju — služe samo za pozicioniranje/konstruiranje (npr. Z_VRA_FIKTIVNA za pante).`,
  ];

  // "Ostalo" elements have no numeric prefix — must be listed explicitly
  const noPrefix = allElements.filter(e => e.category === "Ostalo");
  if (noPrefix.length) {
    lines.push(`\nElementi bez prefiksa (navedeni eksplicitno):`);
    for (const e of noPrefix) {
      lines.push(`  ${e.key} — ${e.description}${e.material ? ` [${e.material}]` : ""}`);
    }
  }

  // Elements explicitly mentioned in user message or visible on screen
  const mentionedKeys = new Set<string>();
  const combinedText = [
    userMessage,
    ...(sessionCtx?.formulasSeen ?? []),
    ...(sessionCtx?.parametersSeen?.map(p => p.value) ?? []),
    sessionCtx?.summary ?? "",
  ].join(" ").toUpperCase();

  for (const e of allElements) {
    if (combinedText.includes(e.key.toUpperCase())) {
      mentionedKeys.add(e.key);
    }
  }

  const mentioned = allElements.filter(e => mentionedKeys.has(e.key));
  if (mentioned.length) {
    lines.push(`\nElementi vidljivi/spomenuti u ovom kontekstu:`);
    for (const e of mentioned) {
      lines.push(`  ${e.key} — ${e.description} [${e.category}${e.material ? ", " + e.material : ""}]${e.mac ? " (.MAC: " + e.mac + ")" : ""}`);
    }
  }

  return lines.join("\n");
}

// ── RAG: relevance-based formula retrieval ────────────────────────────────────

/**
 * Extract MegaTischler parameter names from any text string.
 * Captures [W], [.W], [...Polica.W] style references AND bare uppercase
 * identifiers from natural-language questions ("kako da W prati D").
 */
function extractParamNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const m of text.matchAll(/\[\.{0,4}([A-Za-z0-9_.]+)\]/g)) {
    const leaf = m[1].split(".").at(-1);
    if (leaf) names.add(leaf);
  }
  // bare uppercase words likely to be parameter names (2–12 chars)
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]{1,11})\b/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Score and select the most relevant formulas for the current query.
 *
 * Scoring per formula:
 *   +20  source module matches Live-detected moduleHint
 *   + 5  per parameter visible on screen that appears in the formula
 *   + 3  per parameter mentioned in the user's message
 *   + 1  formula contains a hierarchy reference [.x] (prefer structured ones)
 *
 * Falls back gracefully when no context is available (returns top-50 with
 * hierarchical formulas ranked first, preserving the previous behaviour).
 */
/** Keyword → module mapping for query-time module boost (no Live mod needed). */
const KEYWORD_MODULE_MAP: Array<{ keywords: RegExp; module: string }> = [
  { keywords: /kutni|kut\s+zida|le\s*mans|karusel|uglovni/i, module: "KUTNI.mac" },
  { keywords: /kutni\s+vanjski|vanjski\s+kut/i, module: "KUTNI_VANJSKI.mac" },
  { keywords: /visoki|hladnjak|zamrziva[cč]|stupni|ugradni\s+aparat|aparat/i, module: "KUH_VISOKI.mac" },
  { keywords: /vise[cć]i|gornji\s+ormar|zidni\s+ormar/i, module: "VISECI.mac" },
  { keywords: /mikrovalnica|mikrovalna|grilja[cč]/i, module: "MIKROVALNA.mac" },
  { keywords: /napa|aspirator|odvod\s+para/i, module: "NAPA.mac" },
  { keywords: /pe[cć]nica|ugradna\s+pe[cć]/i, module: "PECNICA.mac" },
  { keywords: /perilica|strojno\s+pranje/i, module: "PERILICA.mac" },
  { keywords: /otvoren[ai]|polica\s+bez\s+vrata|niša|bok\s+polica/i, module: "OTVORENI.mac" },
];

/** Detect the dominant formula type intent from a user query. */
function detectQueryIntent(userMessage: string): string | null {
  const m = userMessage.toLowerCase();
  if (/pozicion|smjesti|gdje\s+staviti|položaj|pomakni|offset/i.test(m)) return "pozicija";
  if (/širina|visina|dubina|debljina|dimenz|duljina|mjera/i.test(m)) return "dimenzija";
  if (/uklju[čc]i|isklju[čc]i|priklju[čc]i|vidljiv|prikaži\s+samo|sakrij/i.test(m)) return "ukljucenje";
  if (/rotir|zakreni|kut|nagni/i.test(m)) return "rotacija";
  if (/ako|uvjet|condition|if\s*\(/i.test(m)) return "uvjet";
  return null;
}

function selectRelevantFormulas(
  allFormulas: Array<{ formula: string; source: string; type?: string }>,
  sessionCtx: SessionContext | null | undefined,
  userMessage: string,
  limit = 250,
): Array<{ formula: string; source: string; type?: string }> {
  const liveModule = sessionCtx?.moduleHint ?? null;

  // Detect keyword-based module hint when Live mod is not active
  let keywordModule: string | null = null;
  if (!liveModule && userMessage) {
    for (const entry of KEYWORD_MODULE_MAP) {
      if (entry.keywords.test(userMessage)) {
        keywordModule = entry.module;
        break;
      }
    }
  }
  const activeModule = liveModule ?? keywordModule;

  const screenParams = new Set<string>();
  for (const p of sessionCtx?.parametersSeen ?? []) screenParams.add(p.name);
  for (const f of sessionCtx?.formulasSeen ?? []) {
    for (const name of extractParamNames(f)) screenParams.add(name);
  }

  const questionParams = extractParamNames(userMessage);
  const queryIntent = detectQueryIntent(userMessage);

  const hasContext = activeModule !== null || screenParams.size > 0 || questionParams.size > 0;

  if (!hasContext) {
    const hierarchical = allFormulas.filter((f) => /\[\.+/.test(f.formula));
    const rest = allFormulas.filter((f) => !/\[\.+/.test(f.formula));
    return [...hierarchical, ...rest].slice(0, limit);
  }

  const scored = allFormulas.map((f) => {
    let score = 0;
    // Module match: Live-detected gets +20, keyword-detected gets +15
    if (liveModule && f.source === liveModule) score += 20;
    else if (keywordModule && f.source === keywordModule) score += 15;
    // Screen parameters
    for (const p of screenParams) {
      if (new RegExp(`\\[\\.{0,4}(?:[A-Za-z0-9_.]*\\.)?${p}\\]`).test(f.formula)) score += 5;
    }
    // Question parameters
    for (const p of questionParams) {
      if (new RegExp(`\\[\\.{0,4}(?:[A-Za-z0-9_.]*\\.)?${p}\\]`).test(f.formula)) score += 3;
    }
    // Formula type matches detected query intent
    if (queryIntent && f.type === queryIntent) score += 4;
    // Hierarchy reference bonus
    if (/\[\.+/.test(f.formula)) score += 1;
    return score;
  });

  const sorted = allFormulas
    .map((f, i) => ({ f, score: scored[i] }))
    .sort((a, b) => b.score - a.score);

  // Type-diversity pass: when context is active, guarantee minimum
  // representation for each major formula type so the AI always sees
  // a balanced set (not just 200 pozicija formulas from one module).
  const MIN_PER_TYPE = 15;
  const DIVERSE_TYPES = ["pozicija", "ukljucenje", "dimenzija", "rotacija"];
  const selected: typeof sorted = [];
  const usedIdx = new Set<number>();

  if (hasContext) {
    for (const type of DIVERSE_TYPES) {
      let count = 0;
      for (let i = 0; i < sorted.length && count < MIN_PER_TYPE; i++) {
        if (!usedIdx.has(i) && sorted[i].f.type === type) {
          selected.push(sorted[i]);
          usedIdx.add(i);
          count++;
        }
      }
    }
  }

  // Fill remaining slots from the top of the scored list
  for (let i = 0; i < sorted.length && selected.length < limit; i++) {
    if (!usedIdx.has(i)) {
      selected.push(sorted[i]);
      usedIdx.add(i);
    }
  }

  return selected.slice(0, limit).map(({ f }) => f);
}

/**
 * Build a hierarchy reference guide using real examples extracted from the
 * knowledge base. Only confirmed facts are stated — no assumptions.
 *
 * Confirmed by user:
 *   [X]     = globalni parametar (bez točaka)
 *   [.X]    = direktni roditelj (1 razina gore)
 *   [..X]   = djed (2 razine gore)
 *   [...X]  = root/korijenski ormar (3 razine gore)
 *   [....X] = 4 razine gore
 */
function buildHierarchyGuide(
  formulas: Array<{ formula: string; source: string }>,
): string {
  // Collect one real example per hierarchy depth from the actual KB formulas
  const examples: Record<string, string> = {};
  for (const { formula } of formulas) {
    for (const m of formula.matchAll(/\[(\.*[A-Za-z0-9_.]+)\]/g)) {
      const ref = m[0];
      const dots = (m[1].match(/^\.*/) ?? [""])[0].length;
      const key = ".".repeat(dots);
      // Prefer formulas that clearly show the reference in context
      if (!examples[key] || examples[key].length < formula.length) {
        examples[key] = formula.length <= 80 ? formula : ref;
      }
    }
  }

  const lines = [
    "HIJERARHIJA REFERENCI U FORMULAMA:",
    `[X]      — globalni parametar (bez točaka); primjer: [KDT], [KZ], [KT]`,
    `[.X]     — direktni roditelj (1 razina gore); primjer: ${examples["."] ?? "[.W]"}`,
    `[..X]    — djed (2 razine gore); primjer: ${examples[".."] ?? "[..StranicaL.T]"}`,
    `[...X]   — root/korijenski ormar (3 razine gore); primjer: ${examples["..."] ?? "[...W]"}`,
    `[....X]  — 4 razine gore; primjer: ${examples["...."] ?? "[....Unutranjosti.H.Z]"}`,
    "",
    "Referenca može uključivati i ime elementa na putu:",
    `  [.Pod.Z]       — Z pozicija elementa Pod koji je direktno dijete`,
    `  [..StranicaL.T] — debljina StranicaL na razini djeda`,
    `  [...Ormar.W]   — širina Ormar na razini roota`,
    "",
    "KRITIČNO: [X] bez točke je GLOBALNI parametar (vrijedi za cijelu konstrukciju).",
    "Ako misliš na parametar roditelja, uvijek stavi barem jednu točku: [.X]",
  ];

  return lines.join("\n");
}

/** Anti-patterns confirmed from actual .mac formula files — 100% verified. */
const ANTI_PATTERNS = `ČESTE GREŠKE — NIKAD OVAKO:
❌  0.5          →  ✅  0,5          (decimalni separator je ZAREZ, ne točka)
❌  if(A=B;...)  →  ✅  if(A==B;...) (usporedba je ==, ne =)
❌  if(A!=B;...) →  ✅  if(A<>B;...) ("nije jednako" je <>, ne != )
❌  if(A,B,C)    →  ✅  if(A;B;C)   (separator argumenata je ; ne ,)
❌  [X]          →  ✅  [.X]         ([X] bez točke = GLOBALNI param; za roditelja uvijek [.X])
❌  if(A and B)  →  ✅  if((A) and (B)) (svaki uvjet u if-u mora biti u zagradama)`;

/**
 * Guide for functions and operators extracted 100% from actual .mac formulas.
 * Counts are exact occurrence counts from the 1228-formula knowledge base.
 */
const FUNCTIONS_AND_OPERATORS = `OPERATORI U FORMULAMA (potvrđeno iz .mac datoteka):
  ==    usporedba jednakosti       (382 formula)  primjer: if([KDT]==3;0;1)
  <>    nije jednako               (9 formula)    primjer: if([...KOAP]<>1;1;0)
  >     veće od                    (125 formula)
  <     manje od                   (82 formula)
  >=    veće ili jednako           (14 formula)
  <=    manje ili jednako          (15 formula)
  and   logički I                  (107 formula)  primjer: if(([KDT]==1) and (POSW>200);...)
  or    logički ILI                (33 formula)   primjer: if(([.BST]==0) or ([.VSST]==1);...)
Napomena: AND i OR (velika slova) su ekvivalentni with and/or (mala slova) — oba oblika postoje u .mac datotekama.

SISTEMSKE VARIJABLE (bez uglatih zagrada — NE pisati [POSW]):
  POSW  — širina pozicije elementa u prostoru (22 formula)  primjer: if(POSW>200;[KDOSZI];0,5)
  POSD  — dubina pozicije elementa u prostoru (5 formula)   primjer: ifelse([.KDT]==0;[.SV];[.KDT]==1;POSD-...
  POSH  — visina pozicije elementa u prostoru (5 formula)   primjer: POSH-ifelse([.KODS]==0;0;...)
Ove varijable MegaTischler automatski pruža — ne trebaju [] i ne mogu se postaviti kao parametri.

FUNKCIJE U FORMULAMA (potvrđeno iz .mac datoteka):
  if(uvjet;istina;laž)                       — 2-granični uvjet           (294 formula)
  ifelse(u1;v1;u2;v2;...;zadano)             — višestruki uvjet (switch)  (27 formula)
  ABS(x)                                     — apsolutna vrijednost        (93 formula)
  NEG(x)  ili  neg(x)                        — negacija (isto što -x)      (77 formula)
  SIN(x)                                     — sinus (radijani)            (190 formula)
  COS(x)                                     — kosinus (radijani)          (185 formula)
  TAN(x)                                     — tangens                     (51 formula)
  ATAN(x)                                    — arkustangens                (1 formula)
  MIN(a;b;...)                               — minimum                     (2 formula)
  MAX(a;b;...)                               — maksimum                    (2 formula)
  EULER(m11;m12;...;Rx;Ry;Rz;x;y;z)         — rotacijska matrica           (18 formula)
  ADD(x)                                     — akumulacija                 (7 formula)
  GETMATDATA(mat;ključ)                      — čita podatak o materijalu   (2 formula)
  STRCAT(s1;s2;...)                          — spaja tekst                 (1 formula)
  VAL(x)                                     — konverzija u broj           (1 formula)

IFELSE — VIŠESTRUKI UVJET (switch/case sintaksa):
Koristiti kada ima 3+ grana — čišće od ugniježđenih if().
Format: ifelse(uvjet1;vrijednost1;uvjet2;vrijednost2;zadanaVrijednost)
Primjeri iz .mac datoteka:
  ifelse([KOAP]==1;50;[KOOL]==0;20;[KOOL]==1;35;50)
  ifelse([KDOS]==0;0,5;[KDOS]==1;2;45)
  ifelse([KUT]<90;1;[KUT]>90;0;2)
  ifelse([.KODS]==0;0;[.KODS]==4;[.MaskaGoreHor.T];[.MSS]+[.MSZRG])`;

/**
 * Extract the most frequently referenced element names from hierarchical formula
 * paths in the knowledge base. These are real element names from actual .mac files.
 */
function buildElementVocabulary(
  formulas: Array<{ formula: string; source: string }>,
): string {
  const elemNames = new Map<string, number>();
  for (const { formula } of formulas) {
    // Match [.ElementName.param] or [..ElementName.param] patterns
    for (const m of formula.matchAll(/\[\.+([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)\]/g)) {
      const elem = m[1];
      // Skip if it looks like a param name (all caps short), not an element name
      if (elem.length >= 3 && !/^[A-Z]{1,4}$/.test(elem)) {
        elemNames.set(elem, (elemNames.get(elem) ?? 0) + 1);
      }
    }
  }

  const top = [...elemNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  if (top.length === 0) return "";

  const names = top.map(([name, cnt]) => `${name}(×${cnt})`).join(", ");
  return `ČESTI NAZIVI ELEMENATA U HIJERARHIJSKIM PUTANJAMA (iz .mac datoteka):
${names}
Ovi nazivi se koriste u formulama kao npr. [.StranicaL.T], [..Ormar.W], [...Viseci.H].`;
}

function buildSystemPrompt(
  kb: ReturnType<typeof readKnowledgeBase>,
  userRules: string,
  sessionCtx?: SessionContext | null,
  conceptualGuide?: string,
  userMessage = "",
): string {
  const syntaxRules = (kb.syntax_rules ?? []).join("\n");

  // Build formula-frequency map so the most-referenced params bubble to the top.
  // This runs fast (<2ms for 1228 formulas) so it's computed per-request.
  const formulaParamFreq = new Map<string, number>();
  for (const f of (kb.formulas ?? []) as Array<{ formula: string }>) {
    for (const m of f.formula.matchAll(/\[\.{0,4}([A-Za-z0-9_.]+)\]/g)) {
      const leaf = m[1].split(".").at(-1);
      if (leaf) formulaParamFreq.set(leaf, (formulaParamFreq.get(leaf) ?? 0) + 1);
    }
  }
  // Params currently visible on screen get an extra boost (+500) so they
  // always appear in the top-80 window regardless of global frequency.
  const visibleParamNames = new Set(sessionCtx?.parametersSeen?.map(p => p.name) ?? []);

  // Category groups for parameter display — ordered by purpose
  const PARAM_CATEGORIES: Record<string, string[]> = {
    "DIMENZIJSKI":  ["T", "W", "L", "D", "H"],
    "POZICIJSKI":   ["X", "Y", "Z"],
    "ROTACIJSKI":   ["Rx", "Ry", "Rz", "KZ", "KT"],
  };
  const categorised = new Set(Object.values(PARAM_CATEGORIES).flat());

  const sortedParams = ((kb.parameters ?? []) as Array<{ name: string; description: string; typical_values: string[]; observed_values?: string[] }>)
    .slice()
    .sort((a, b) => {
      const aScore = (visibleParamNames.has(a.name) ? 500 : 0) + (formulaParamFreq.get(a.name) ?? 0);
      const bScore = (visibleParamNames.has(b.name) ? 500 : 0) + (formulaParamFreq.get(b.name) ?? 0);
      return bScore - aScore;
    });

  // Build a categorised display: fixed groups first, then top modular params
  // observed_values take priority over typical_values — they are derived from real formula conditions
  const formatParam = (p: { name: string; description: string; typical_values: string[]; observed_values?: string[] }) => {
    const valHint = p.observed_values?.length
      ? ` [opažene vrijednosti: ${p.observed_values.join(", ")}]`
      : p.typical_values?.length
        ? ` (tipično: ${p.typical_values.join(", ")})`
        : "";
    return `${p.name}${p.description ? ` — ${p.description}` : ""}${valHint}`;
  };

  const paramsByName = new Map(sortedParams.map(p => [p.name, p]));
  const paramLines: string[] = [];

  for (const [cat, names] of Object.entries(PARAM_CATEGORIES)) {
    const rows = names.map(n => paramsByName.get(n)).filter(Boolean);
    if (rows.length) paramLines.push(`[${cat}] ${rows.map(p => formatParam(p!)).join(" | ")}`);
  }

  // Remaining top params not in fixed categories (up to 80 total slots)
  const remaining = sortedParams
    .filter(p => !categorised.has(p.name))
    .slice(0, 80 - Object.values(PARAM_CATEGORIES).flat().length);
  if (remaining.length) {
    paramLines.push(`[MODULARNI]\n${remaining.map(formatParam).join("\n")}`);
  }

  const topParams = paramLines.join("\n");

  const allFormulas: Array<{ formula: string; source: string }> = kb.formulas ?? [];
  const relevantFormulas = selectRelevantFormulas(allFormulas, sessionCtx, userMessage);
  const topFormulas = relevantFormulas
    .map((f: { formula: string; source: string }) => `${f.formula}  [iz: ${f.source}]`)
    .join("\n");

  // Faza D: include learned entries from knowledge base (new structure: confirmed_formulas/confirmed_patterns/observations)
  const learnedFormulas: Array<{ formula: string; source: string }> =
    kb.learned?.confirmed_formulas ?? kb.learned?.formulas ?? [];
  const learnedParams: Array<{ name: string; description?: string; pattern?: string }> =
    kb.learned?.confirmed_patterns ?? kb.learned?.parameters ?? [];
  const learnedObs: Array<{ note?: string; text?: string }> = kb.learned?.observations ?? [];

  const parts = [
    `Ti si MegaTischler parametarski asistent za formule.
Korisnik je stručnjak za izradu namještaja koji zna sve o konstrukciji, ali treba pomoć pri pisanju MegaTischler formula.
Uvijek odgovaraj na hrvatskom jeziku.
Budi direktan i konkretan — daj točnu formulu koju treba upisati i objasni gdje je upisati.
Kad vidiš screenshot, pažljivo pročitaj dijaloški okvir parametara — identificiraj imena parametara, trenutne vrijednosti i što korisnik pokušava postići.
Ako korisnik pošalje samo screenshot bez teksta, to znači: nastavi logično rješavati zadatak na kojem smo radili. Pitaj za pojašnjenje samo ako stvarno ne možeš nastaviti.

KRITIČNO — DECIMALNI SEPARATOR: Decimalni separator je UVIJEK zarez (,), NIKAD točka (.). Primjeri: 0,5 ispravno; 0.5 POGREŠKA. Ako vidiš formulu s točkom kao decimalnim separatorom, to je greška koju treba ispraviti.

FORMAT ODGOVORA — RADNI LIST:
Nakon kratkog uvoda (max 1 rečenica), UVIJEK završi odgovor s JSON blokom:
\`\`\`worklist
{
  "steps": [
    {
      "title": "Postavi širinu police da prati dubinu roditelja",
      "where": "Dijalog parametara → Polica.W → polje Formula",
      "formula": "[.D]-2*0,5",
      "hint": "D je dubina roditelja; 0,5 je luft na svakoj strani"
    }
  ]
}
\`\`\`
Pravila za SVAKI korak (sva 4 polja su važna za preglednost):
- "title": jedna jasna rečenica ŠTO radiš (ne samo "Referenca parametra" — reci što postižeš).
- "where": TOČNA putanja gdje klikati/upisati (Dijalog → Parametar → polje).
- "formula": točan tekst za kopiranje; null samo ako korak nema formule (npr. samo otvori dijalog).
- "hint": OBAVEZNO jedna kratka rečenica ZAŠTO (objašnjenje za početnika, ne tehnički žargon).
- Maksimalno 4 koraka za preglednost.
- Ne izmišljaj formule — koristi bazu znanja ili ekran.
- Za screenshot-only: samo sljedeći koraci, bez ponavljanja cijelog plana.`,
  ];

  if (conceptualGuide) {
    parts.push(`\nKONCEPTUALNI VODIČ PARAMETRIZACIJE:\n${conceptualGuide}`);
  }

  if (syntaxRules) {
    parts.push(`\nPRAVILA SINTAKSE MEGATISCHLER:\n${syntaxRules}`);
  }

  // Hierarchy guide — built from real KB formula examples, facts confirmed by user
  parts.push(`\n${buildHierarchyGuide((kb.formulas ?? []) as Array<{ formula: string; source: string }>)}`);

  // Anti-patterns — 100% verified from actual .mac formula files
  parts.push(`\n${ANTI_PATTERNS}`);

  // Functions and operators — 100% extracted from actual .mac formula files
  parts.push(`\n${FUNCTIONS_AND_OPERATORS}`);

  // Element vocabulary — real element names extracted from hierarchical paths in .mac files
  const elemVocab = buildElementVocabulary((kb.formulas ?? []) as Array<{ formula: string; source: string }>);
  if (elemVocab) {
    parts.push(`\n${elemVocab}`);
  }

  // Faza C: session context from Live screenshots
  if (sessionCtx && (sessionCtx.parametersSeen?.length || sessionCtx.formulasSeen?.length || sessionCtx.summary)) {
    const ctxLines: string[] = [`\nTRENUTNI KONTEKST EKRANA (Live mod):`];
    if (sessionCtx.summary) ctxLines.push(`Ekran: ${sessionCtx.summary}`);
    if (sessionCtx.moduleHint) {
      // Inject module description from kb.modules if available
      const moduleDef = ((kb as unknown as Record<string, unknown>).modules as Array<{ name: string; opis: string }> | undefined)
        ?.find(m => m.name === sessionCtx.moduleHint);
      // Module-dominant formula type — derived from actual formula type counts in KB
      const MODULE_DOMINANT_TYPE: Record<string, string> = {
        "KUH_VISOKI.mac":   "dominantno pozicijske formule (49%)",
        "KUTNI.mac":        "dominantno ROTACIJSKE formule (35%) — EULER() i SIN/COS/TAN česti",
        "KUTNI_VANJSKI.mac":"dominantno pozicijske formule (49%)",
        "MIKROVALNA.mac":   "dominantno pozicijske formule (57%)",
        "NAPA.mac":         "dominantno pozicijske formule (59%)",
        "VISECI.mac":       "dominantno formule uključenja (43%)",
        "PECNICA.mac":      "dominantno pozicijske formule (48%)",
        "PERILICA.mac":     "mješovit (pozicija + reference)",
        "OTVORENI.mac":     "mješovit (reference + dimenzije)",
      };
      const typHint = MODULE_DOMINANT_TYPE[sessionCtx.moduleHint ?? ""] ?? "";
      ctxLines.push(`Modul: ${sessionCtx.moduleHint}${moduleDef ? ` — ${moduleDef.opis}` : ""}${typHint ? ` | ${typHint}` : ""}`);
    }
    if (sessionCtx.dialogType && sessionCtx.dialogType !== "none") {
      ctxLines.push(`Tip dijaloga: ${sessionCtx.dialogType}`);
    }
    if (sessionCtx.parametersSeen?.length) {
      ctxLines.push(`Vidljivi parametri: ${sessionCtx.parametersSeen.map(p => `${p.name}=${p.value}`).join(", ")}`);
    }
    if (sessionCtx.formulasSeen?.length) {
      ctxLines.push(`Vidljive formule: ${sessionCtx.formulasSeen.join(" | ")}`);
    }
    parts.push(ctxLines.join("\n"));
  }

  if (topParams) {
    parts.push(`\nKATALOG PARAMETARA:\n${topParams}`);
  }

  // Slim mode: skip heavy catalogs when there is no screen/module context.
  // Saves ~4 000 tokens on simple formula questions with no Live mod active.
  const hasRichContext = !!(
    sessionCtx && (
      sessionCtx.parametersSeen?.length ||
      sessionCtx.formulasSeen?.length ||
      sessionCtx.moduleHint
    )
  );
  const mentionsMaterial = /materijal|ploča|kant|iveral|mdf|furnir|dekor|boja|debljin/i.test(userMessage);
  const mentionsElement = /element|korpus|stranica|polica|vrata|fronta|leđa|pod|strop/i.test(userMessage);

  if (hasRichContext || mentionsMaterial) {
    const materialsCatalog = buildMaterialsCatalog(
      (kb.materials ?? []) as MaterialEntry[],
      userMessage,
      sessionCtx,
    );
    if (materialsCatalog) {
      parts.push(`\n${materialsCatalog}`);
    }
  }

  if (hasRichContext || mentionsElement) {
    const elementsCatalog = buildElementsCatalog(
      (kb.elements ?? []) as ElementEntry[],
      userMessage,
      sessionCtx,
    );
    if (elementsCatalog) {
      parts.push(`\n${elementsCatalog}`);
    }
  }

  if (topFormulas) {
    parts.push(`\nPRIMJERI FORMULA IZ KORISNIKOVIH DATOTEKA:\n${topFormulas}`);
  }

  // Faza D: learned entries from screenshots
  if (learnedFormulas.length > 0) {
    const lf = learnedFormulas.slice(0, 20).map(f => `${f.formula}  [naučeno iz: ${f.source}]`).join("\n");
    parts.push(`\nNAUČENE FORMULE IZ SESSIJA:\n${lf}`);
  }

  if (learnedParams.length > 0) {
    const lp = learnedParams.slice(0, 20).map(p =>
      p.pattern
        ? `${p.name} — ${p.description ?? ""}: ${p.pattern}`
        : `${p.name}${p.description ? ` — ${p.description}` : ""}`
    ).join("\n");
    parts.push(`\nNAUČENI OBRASCI IZ SESSIJA:\n${lp}`);
  }

  if (learnedObs.length > 0) {
    const lo = learnedObs.slice(0, 10).map(o => `- ${o.note ?? o.text ?? ""}`).join("\n");
    parts.push(`\nZABILJEŠKE IZ SESSIJA:\n${lo}`);
  }

  if (userRules) {
    parts.push(`\nKORISNIKOVA PRAVILA ZA NAMJEŠTAJ:\n${userRules}`);
  }

  return parts.join("\n");
}

function buildDebugSystemPrompt(
  kb: ReturnType<typeof readKnowledgeBase>,
  userRules: string,
  conceptualGuide: string,
): string {
  const syntaxRules = (kb.syntax_rules as string[] ?? []).join("\n");

  const parts = [
    `Ti si MegaTischler dijagnostički asistent.
Korisnik ti je poslao niz screenshotova koji prikazuju slijed klikova/radnji u MegaTischleru.
Uvijek odgovaraj na hrvatskom jeziku.
Tvoj zadatak je pronaći uzrok problema koji je korisnik opisao, koristeći screenshotove kao dokaz.

KAKO ANALIZIRATI SCREENSHOTOVE:
- Analiziraj screenshotove REDOM (Screenshot 1 = prvi korak, Screenshot N = zadnji korak)
- Usporedi parametre, formule i vrijednosti između screenshotova
- Traži: == vs =, zarez vs točka, ; u if(), zagrade, hijerarhiju [.] i [..] referencija
- Identificiraj točno gdje nastaje problem

KRITIČNO — DECIMALNI SEPARATOR: Decimalni separator je UVIJEK zarez (,), NIKAD točka (.). 0,5 ispravno; 0.5 POGREŠKA.

FORMAT ODGOVORA — DIJAGNOSTIČKI RADNI LIST:
Jedna rečenica: što si pronašao (uzrok greške). Zatim worklist (max 3 koraka):
\`\`\`worklist
{
  "steps": [
    {
      "title": "Ispravi separator u formuli",
      "where": "Dijalog parametara → Polica.W → polje Formula",
      "formula": "[.D]-2*0,5",
      "hint": "Koristio si točku (.) umjesto zareza (,) kao decimalni separator"
    }
  ]
}
\`\`\`
Pravila:
- Maksimalno 3 koraka — fokusiraj se na JEDAN uzrok i jedno rješenje
- "hint" OBAVEZNO objašnjava ZAŠTO je to bio problem
- Ako nemaš dovoljno informacija, jedno jasno pitanje + korak "pošalji screenshot X dijela"`,
  ];

  if (conceptualGuide) {
    parts.push(`\nKONCEPTUALNI VODIČ:\n${conceptualGuide}`);
  }
  if (syntaxRules) {
    parts.push(`\nPRAVILA SINTAKSE:\n${syntaxRules}`);
  }
  if (userRules) {
    parts.push(`\nPRAVILA KORISNIKA:\n${userRules}`);
  }

  const allFormulas: Array<{ formula: string; source: string }> = kb.formulas ?? [];
  if (allFormulas.length > 0) {
    const sample = allFormulas.slice(0, 30).map((f) => f.formula).join("\n");
    parts.push(`\nBAZA FORMULA (primjeri):\n${sample}`);
  }

  return parts.join("\n");
}

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, screenshot_base64, history } = parsed.data;

  // Debug mode: optional extra fields not in the strict Zod schema
  const rawBody = req.body as Record<string, unknown>;
  const mode = rawBody.mode as string | undefined;
  const screenshots = rawBody.screenshots as Array<{ base64: string; index: number }> | undefined;

  // Debug mode: validate we have screenshots + message
  if (mode === "debug") {
    if (!message?.trim()) {
      res.status(400).json({ error: "Opis problema je obavezan za debug mod." });
      return;
    }
    if (!screenshots || screenshots.length === 0) {
      res.status(400).json({ error: "Najmanje jedan screenshot je obavezan za debug mod." });
      return;
    }
    if (screenshots.length > 12) {
      res.status(400).json({ error: "Maksimalno 12 screenshotova." });
      return;
    }
  }

  // Reject if there is nothing to send (normal mode)
  if (mode !== "debug" && !message.trim() && !screenshot_base64) {
    res.status(400).json({ error: "Poruka ili screenshot su obavezni." });
    return;
  }

  const kb = readKnowledgeBase();
  const userRules = readRules();
  const conceptualGuide = readConceptualGuide();

  // Build conversation history (last 10 messages)
  const recentHistory = (history ?? []).slice(-10);
  const chatMessages: MessageParam[] = recentHistory.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  let systemPrompt: string;
  const userContent: Array<TextBlockParam | ImageBlockParam> = [];

  if (mode === "debug" && screenshots && screenshots.length > 0) {
    // ── Debug mode: multi-screenshot analysis ──────────────────────────────────
    systemPrompt = buildDebugSystemPrompt(kb, userRules, conceptualGuide);

    // Build user message: problem description + labelled screenshots
    userContent.push({
      type: "text",
      text: `Korisnik opisuje problem: "${message.trim()}"\n\nAnaliziraj sljedeće ${screenshots.length} screenshotov${screenshots.length === 1 ? "" : "a"} redom (klik 1…${screenshots.length}).`,
    });

    const sorted = [...screenshots].sort((a, b) => a.index - b.index);
    for (const shot of sorted) {
      userContent.push({ type: "text", text: `Screenshot ${shot.index}:` });
      let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
      if (shot.base64.startsWith("iVBOR")) mediaType = "image/png";
      else if (shot.base64.startsWith("R0lGOD")) mediaType = "image/gif";
      else if (shot.base64.startsWith("UklGR")) mediaType = "image/webp";
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: shot.base64 },
      });
    }
  } else {
    // ── Normal / screenshot-single mode ───────────────────────────────────────
    const effectiveMessage = message.trim() || (screenshot_base64
      ? "Korisnik je poslao screenshot bez dodatnog teksta. Nastavi logično rješavati zadatak na kojem radimo na temelju povijesti razgovora i screenshota. Ako ti nedostaje kontekst za nastavak, postavi jasna pitanja za pojašnjenje."
      : "");

    const sessionCtx = rawBody.session_context as SessionContext | null ?? null;
    systemPrompt = buildSystemPrompt(kb, userRules, sessionCtx, conceptualGuide, effectiveMessage);

    if (screenshot_base64) {
      let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
      if (screenshot_base64.startsWith("iVBOR")) mediaType = "image/png";
      else if (screenshot_base64.startsWith("R0lGOD")) mediaType = "image/gif";
      else if (screenshot_base64.startsWith("UklGR")) mediaType = "image/webp";
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: screenshot_base64 },
      });
    }

    if (effectiveMessage) {
      userContent.push({ type: "text", text: effectiveMessage });
    }
  }

  chatMessages.push({ role: "user", content: userContent });

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Error calling Claude API");
    res.write(`data: ${JSON.stringify({ error: `AI greška: ${detail}` })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;

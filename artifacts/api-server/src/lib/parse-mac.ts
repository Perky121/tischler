/**
 * MegaTischler .mac file parser — TypeScript port of parse_mac.py.
 * Extracts formula and parameter knowledge from .mac XML-like files.
 * No external dependencies — pure Node.js regex + Buffer operations.
 */

import fs from "fs";
import path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

// Rules derived from analysis of 1228 expert formulas across 9 .mac modules.
export const SYNTAX_RULES = [
  "Decimalni separator pri unosu je ZAREZ ne točka: 0,5 a ne 0.5",
  "Separator argumenata funkcija je TOČKA-ZAREZ: if(uvjet;istina;laž) — nikad zarez",
  "Usporedba jednakosti koristi == (dvostruki znak): if([KDT]==3;0;1) — stručne formule koriste == u 93% slučajeva",
  "Reference parametara u uglatim zagradama: [W], [D], [H]",
  "Roditeljski parametar: [.W] = jedan nivo gore; svaka dodatna točka = jedan nivo više (do [.....] = 5 nivoa u praksi)",
  "Korijenski parametar: [....W] = četiri točke = root razina",
  "Navigacija prema djetetu: [...PoliceP.Polica.W] — točke pa imena elemenata odvojena točkom",
  "Identifikator BEZ zagrada = lokalna/pomoćna varijabla: POSW>200 (POSW je lokalna varijabla, ne parametar)",
  "Uvjet: if(uvjet;istina;laž) — ugnježđivanje je uobičajeno: if(A;1;if(B;2;3))",
  "Višestruki uvjet: ifelse(u1;v1;u2;v2;zadano): ifelse([KOAP]==1;50;[KOOL]==0;20;[KOOL]==1;35;50)",
  "Složeni uvjeti sa and/or — svaki uvjet u SVOJIM zagradama: if(([KDT]==1) and (POSW>200);[KDOSZI];0,5)",
  "Logički operatori: and, or, not — pišu se između zagrada uvjeta, ne kao funkcija oko svih",
  "Operatori usporedbe: <, >, <=, >=, ==, <> (različito)",
  "Aritmetički operatori: +, -, *, /",
  "Funkcije kuta za rotacije: cos(), sin(), tan() — vrlo česte u pozicioniranju",
  "Apsolutna vrijednost: abs() ili ABS() — oba oblika postoje u stručnim formulama",
  "Min/Max: min(a;b), max(a;b)",
  "Zaokruživanje: round(vrijednost;decimale); cijeli broj: int(vrijednost)",
  "Kvadratni korijen: sqrt(vrijednost)",
  "Spajanje stringova s + operatorom",
  "Tipičan obrazac pozicioniranja: [.Pod.Z]+[.Pod.H] — pozicija susjednog elementa + njegova dimenzija",
  "Tipičan obrazac uključenja/isključenja: if([PARAM]==0;0;1) — 0 isključuje element, 1 uključuje",
];

const PARAM_TAGS = ["ParFloat", "ParEnum", "ParString", "ParInt", "ParBool", "Parameter", "DimItem", "VarItem"];
const FORMULA_TAGS = ["Formula", "Expression", "MaterialItem", "PartItem"];
const ALL_TAGS = [...PARAM_TAGS, ...FORMULA_TAGS, "Value", "Condition"];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormulaEntry {
  formula: string;
  source: string;        // izvorni .mac filename (npr. "KUH_VISOKI.mac")
  parameter?: string;    // ime parametra kojemu formula pripada (npr. "VIS_KORPUSA")
  description?: string;  // opis parametra
  module?: string;       // naziv modula bez ekstenzije (npr. "KUH_VISOKI")
  type?: string;         // tip formule: pozicija|dimenzija|ukljucenje|uvjet|referenca|rotacija|konstanta
}
export interface ParamEntry { name: string; description: string; typical_values: string[]; }

export interface KnowledgeBase {
  formulas: FormulaEntry[];
  parameters: ParamEntry[];
  syntax_rules: string[];
  learned?: { formulas?: FormulaEntry[]; parameters?: ParamEntry[]; observations?: { text: string }[] };
  _meta: { files_processed: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function getAttr(block: string, attr: string): string | null {
  const re1 = new RegExp(`\\b${attr}="([^"]*)"`, "i");
  const m1 = block.match(re1);
  if (m1) return unescapeXml(m1[1].trim());
  const re2 = new RegExp(`\\b${attr}='([^']*)'`, "i");
  const m2 = block.match(re2);
  if (m2) return unescapeXml(m2[1].trim());
  return null;
}

function getInner(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const m = block.match(re);
  if (m) return unescapeXml(m[1].trim());
  return null;
}

function isFormula(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  // Reject XML fragments accidentally captured across tag boundaries.
  // Real formulas are single-line; comparison operators (<, >) are followed by
  // a digit, bracket or '=', never by a tag name or a slash.
  if (/[\r\n]/.test(v)) return false;
  if (/<\/?[A-Za-z]/.test(v)) return false;
  if (/^-?\d+([,.]?\d+)?$/.test(v)) return false;
  const indicators = ["[", "if(", "ifelse(", "cos(", "sin(", "tan(", "neg(", "round(", "int(", "sqrt(", "abs(", "min(", "max(", "and(", "or(", "not("];
  const hasRef = /\[[\w.]+\]/.test(v);
  const hasOp = /[+*/\-]/.test(v) && v.length > 3;
  return indicators.some(ind => v.includes(ind)) || hasRef || (hasOp && !v.includes("[") && v.length > 6);
}

// ── Formula type inference ────────────────────────────────────────────────────

function inferFormulaType(formula: string): string | undefined {
  const v = formula.trim();
  if (!v) return undefined;
  // Rotation: uses trig functions
  if (/cos\s*\(|sin\s*\(|tan\s*\(/i.test(v)) return "rotacija";
  // Simple numeric constant
  if (/^-?\d+([.,]\d+)?$/.test(v)) return "konstanta";
  // Simple direct reference [.?PARAM] with no operators
  if (/^\[\.{0,4}[\w.]+\]$/.test(v)) {
    const core = v.replace(/^\[\.{0,4}/, "").replace(/\]$/, "").split(".").pop()?.toUpperCase() ?? "";
    if (["X", "Y", "Z"].includes(core)) return "pozicija";
    if (["W", "D", "H", "T", "L"].includes(core)) return "dimenzija";
    return "referenca";
  }
  // Multi-branch conditional
  if (/^ifelse\s*\(/i.test(v)) return "uvjet";
  if (/^if\s*\(/i.test(v)) {
    // Binary 0/1 result → on/off toggle
    if (/[;,](0|1)[;,](0|1)\)/.test(v) || /[;,](0|1)\)$/.test(v)) return "ukljucenje";
    return "uvjet";
  }
  // Arithmetic with param refs → dimension/position
  if (/[+\-*/]/.test(v) && /\[/.test(v)) {
    if (/\[\.?[XYZ]\]|\[\.{0,4}(Pod|Pos)\./i.test(v)) return "pozicija";
    return "dimenzija";
  }
  return undefined;
}

// ── Core parser ───────────────────────────────────────────────────────────────

function parseMacContent(content: string, source: string): { formulas: FormulaEntry[]; params: ParamEntry[] } {
  const formulas: FormulaEntry[] = [];
  const paramsMap = new Map<string, ParamEntry>();

  const module = source.replace(/\.mac$/i, "");

  // Extract XML blocks for all relevant tags
  for (const tag of ALL_TAGS) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:[\\s\\S]*?)<\\/${tag}>|<${tag}(?:\\s[^>]*)?\\/>`,"gi");
    for (const block of content.matchAll(re)) {
      const b = block[0];
      const name = getAttr(b, "Name") ?? getAttr(b, "name");
      const value = getAttr(b, "Value") ?? getAttr(b, "value") ?? getInner(b, "Value");
      const formula = getAttr(b, "Formula") ?? getAttr(b, "formula") ?? getInner(b, "Formula");
      const desc = getAttr(b, "Description") ?? getAttr(b, "Desc") ?? getAttr(b, "description") ?? getInner(b, "Description") ?? "";
      // Capture XML Type attribute (if present on tag) for formula classification
      const xmlType = getAttr(b, "Type") ?? getAttr(b, "type");

      for (const candidate of [formula, value]) {
        if (candidate && isFormula(candidate)) {
          const trimmed = candidate.trim();
          formulas.push({
            formula: trimmed,
            source,
            module,
            parameter: name?.trim() || undefined,
            description: (desc && name) ? desc.trim() : undefined,
            type: xmlType?.trim() || inferFormulaType(trimmed),
          });
        }
      }

      if (name?.trim()) {
        const n = name.trim();
        const valStr = (value && !isFormula(value)) ? value.trim() : null;
        if (!paramsMap.has(n)) {
          paramsMap.set(n, { name: n, description: desc ?? "", typical_values: [] });
        }
        const entry = paramsMap.get(n)!;
        if (valStr && !entry.typical_values.includes(valStr)) entry.typical_values.push(valStr);
        if (desc && !entry.description) entry.description = desc;
      }
    }
  }

  // Raw sweep for formula attributes (no parameter context available here)
  const rawFormulaRe = /(?:Formula|Expression|Condition)="([^"]{4,})"/gi;
  for (const m of content.matchAll(rawFormulaRe)) {
    const f = unescapeXml(m[1]);
    if (isFormula(f)) formulas.push({ formula: f.trim(), source, module, type: inferFormulaType(f.trim()) });
  }

  // Attribute-pair sweeps
  const nameAttrPattern = "(?:Name|VarName|Ident|ParName|ID)";
  const pairRe1 = new RegExp(`<\\w+[^>]*\\b${nameAttrPattern}="([^"]+)"[^>]*\\bValue="([^"]*)"`, "gi");
  for (const m of content.matchAll(pairRe1)) {
    const n = unescapeXml(m[1].trim()), v = unescapeXml(m[2].trim());
    if (n && v && !isFormula(v)) {
      if (!paramsMap.has(n)) paramsMap.set(n, { name: n, description: "", typical_values: [] });
      const entry = paramsMap.get(n)!;
      if (!entry.typical_values.includes(v)) entry.typical_values.push(v);
    }
  }
  const pairRe2 = new RegExp(`<\\w+[^>]*\\bValue="([^"]*)"[^>]*\\b${nameAttrPattern}="([^"]+)"`, "gi");
  for (const m of content.matchAll(pairRe2)) {
    const v = unescapeXml(m[1].trim()), n = unescapeXml(m[2].trim());
    if (n && v && !isFormula(v)) {
      if (!paramsMap.has(n)) paramsMap.set(n, { name: n, description: "", typical_values: [] });
      const entry = paramsMap.get(n)!;
      if (!entry.typical_values.includes(v)) entry.typical_values.push(v);
    }
  }

  // Child-tag style: <Name>X</Name><Value>5</Value>
  const childRe = /<Name>([^<]+)<\/Name>\s*<Value>([^<]*)<\/Value>/gi;
  for (const m of content.matchAll(childRe)) {
    const n = unescapeXml(m[1].trim()), v = unescapeXml(m[2].trim());
    if (n && v && !isFormula(v)) {
      if (!paramsMap.has(n)) paramsMap.set(n, { name: n, description: "", typical_values: [] });
      const entry = paramsMap.get(n)!;
      if (!entry.typical_values.includes(v)) entry.typical_values.push(v);
    }
  }

  // Deduplicate formulas by formula + parameter + source
  // (same formula string for different parameters should be kept separately)
  const seen = new Set<string>();
  const uniqueFormulas = formulas.filter(f => {
    const key = `${f.formula}||${f.parameter ?? ""}||${f.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Trim typical values
  for (const p of paramsMap.values()) {
    p.typical_values = p.typical_values.slice(0, 10);
  }

  return { formulas: uniqueFormulas, params: Array.from(paramsMap.values()) };
}

// MTSXENC blocks are not real encryption. Each original XML byte is stored as a
// UTF-8 codepoint: codepoint = 0x0E80 + (byte XOR MTSXENC_XOR_KEY).
// Reverse: byte = (codepoint - 0x0E80) XOR MTSXENC_XOR_KEY.
const MTSXENC_MARKER = "MTSXENC";
const MTSXENC_BASE = 0x0e80;
const MTSXENC_XOR_KEY = 0x53;

function decodeMtsxenc(encoded: string): string {
  const bytes: number[] = [];
  for (const ch of encoded) {
    const cp = ch.codePointAt(0)!;
    // Only decode codepoints in the expected encoding range; skip stray chars.
    if (cp < MTSXENC_BASE || cp > MTSXENC_BASE + 0xff) continue;
    bytes.push((cp - MTSXENC_BASE) ^ MTSXENC_XOR_KEY);
  }
  // Decoded XML declares utf-8 and Croatian characters are multi-byte.
  return Buffer.from(bytes).toString("utf8");
}

export function parseMacFile(filePath: string): { formulas: FormulaEntry[]; params: ParamEntry[] } {
  try {
    const raw = fs.readFileSync(filePath);
    const source = path.basename(filePath);

    const encIdx = raw.indexOf(Buffer.from(MTSXENC_MARKER));
    if (encIdx === -1) {
      // No encrypted section — decode whole file as latin-1.
      return parseMacContent(raw.toString("latin1"), source);
    }

    // Plaintext part before the marker (latin-1), then decode the MTSXENC block.
    const plainPart = raw.slice(0, encIdx).toString("latin1");
    const encodedPart = raw.slice(encIdx + MTSXENC_MARKER.length).toString("utf8");
    let decodedPart = "";
    try {
      decodedPart = decodeMtsxenc(encodedPart);
    } catch {
      decodedPart = "";
    }

    return parseMacContent(plainPart + "\n" + decodedPart, source);
  } catch (err) {
    return { formulas: [], params: [] };
  }
}

// ── KB helpers ────────────────────────────────────────────────────────────────

function deriveParamsFromFormulas(kb: KnowledgeBase): void {
  const freq = new Map<string, number>();
  for (const f of kb.formulas) {
    for (const m of f.formula.matchAll(/\[\.{0,4}([A-Za-z0-9_.]+)\]/g)) {
      const ref = m[1];
      const name = ref.split(".").at(-1)?.trim() ?? "";
      if (name && /^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        freq.set(name, (freq.get(name) ?? 0) + 1);
      }
    }
  }
  const existingNames = new Set(kb.parameters.map(p => p.name));
  const derived: ParamEntry[] = [];
  for (const [name, count] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
    if (!existingNames.has(name)) {
      derived.push({ name, description: `koristi se u ${count} formula`, typical_values: [] });
    }
  }
  kb.parameters.push(...derived);
  kb.parameters.sort((a, b) => {
    const aHas = a.typical_values.length > 0 ? 0 : 1;
    const bHas = b.typical_values.length > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return (freq.get(b.name) ?? 0) - (freq.get(a.name) ?? 0);
  });
}

export function mergeInto(existing: KnowledgeBase, newFormulas: FormulaEntry[], newParams: ParamEntry[]): void {
  // Dedup key: formula + parameter + source (same formula for different params stays separate)
  const knownF = new Set(existing.formulas.map(f => `${f.formula}||${f.parameter ?? ""}||${f.source}`));
  for (const f of newFormulas) {
    const key = `${f.formula}||${f.parameter ?? ""}||${f.source}`;
    if (!knownF.has(key)) { existing.formulas.push(f); knownF.add(key); }
  }
  const knownP = new Map(existing.parameters.map(p => [p.name, p]));
  for (const p of newParams) {
    if (!knownP.has(p.name)) {
      knownP.set(p.name, p);
    } else {
      const ep = knownP.get(p.name)!;
      const ev = new Set(ep.typical_values);
      for (const v of p.typical_values) ev.add(v);
      ep.typical_values = [...ev].slice(0, 10);
      if (!ep.description && p.description) ep.description = p.description;
    }
  }
  existing.parameters = Array.from(knownP.values());
}

export function buildKbFromFiles(filePaths: string[]): KnowledgeBase {
  const kb: KnowledgeBase = { formulas: [], parameters: [], syntax_rules: SYNTAX_RULES, _meta: { files_processed: 0 } };
  for (const fp of filePaths) {
    const { formulas, params } = parseMacFile(fp);
    mergeInto(kb, formulas, params);
    kb._meta.files_processed++;
  }
  deriveParamsFromFormulas(kb);
  return kb;
}

export function buildKbFromSingleFile(filePath: string): KnowledgeBase {
  const { formulas, params } = parseMacFile(filePath);
  const kb: KnowledgeBase = { formulas, parameters: params, syntax_rules: SYNTAX_RULES, _meta: { files_processed: 1 } };
  deriveParamsFromFormulas(kb);
  return kb;
}

export function mergeFileIntoKb(filePath: string, existing: KnowledgeBase): void {
  const { formulas, params } = parseMacFile(filePath);
  // Remove previously derived params so they get recomputed
  existing.parameters = existing.parameters.filter(p => !p.description?.startsWith("koristi se u "));
  mergeInto(existing, formulas, params);
  existing._meta.files_processed = (existing._meta.files_processed ?? 0) + 1;
  deriveParamsFromFormulas(existing);
}

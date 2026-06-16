/**
 * MegaTischler .mtsx file parser.
 *
 * .mtsx files are clean UTF-8 XML (unlike .mac, which needs latin-1 + MTSXENC
 * decoding). They describe a node tree: a root <NodeData xsi:type="ComplexNode">
 * containing <Parameters> (ParFloat/ParString/…) and nested *Node children
 * (CuboidNode, OperationNode, SweepNode, ProfilNode, MultiplyComplexNode,
 * DrawerComplexNode, …). Each parameter may carry a <Formula>.
 *
 * The parser walks the tree generically (any tag ending in "Node" plus the
 * root "NodeData") so it does not break when new node types appear, and records
 * each formula together with its element (enclosing node name), parameter name,
 * module (root node name) and optional category (from the zip folder layout).
 *
 * Reuses isFormula / inferFormulaType / unescapeXml / fixMojibake from the .mac
 * parser and produces the same FormulaEntry / ParamEntry shapes so the result
 * merges into the shared knowledge_base.json via mergeInto().
 */

import fs from "fs";
import path from "path";
import {
  fixMojibake,
  inferFormulaType,
  isFormula,
  unescapeXml,
  type FormulaEntry,
  type ParamEntry,
} from "./parse-mac";

// ── Minimal XML tree ──────────────────────────────────────────────────────────

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const TAG_RE =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;

/** Parse well-formed XML into a lightweight tree. Tolerant of minor malformation. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;

  while ((m = TAG_RE.exec(xml))) {
    const between = xml.slice(lastIndex, m.index);
    if (between.trim()) stack[stack.length - 1].text += between;
    lastIndex = TAG_RE.lastIndex;

    const full = m[0];
    if (full.startsWith("<!--") || full.startsWith("<?")) continue;

    if (m[1]) {
      // Closing tag — pop back to the matching open element.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === m[1]) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const tag = m[2];
    const attrs: Record<string, string> = {};
    for (const am of (m[3] ?? "").matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
      attrs[am[1]] = am[2];
    }
    const node: XmlNode = { tag, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node); // not self-closing
  }

  return root;
}

function childByTag(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  return fixMojibake(unescapeXml(node.text.trim()));
}

function isNodeTag(tag: string): boolean {
  return tag === "NodeData" || tag.endsWith("Node");
}

// Reserved structural parameters are universal coordinate/flag slots present on
// every node; their *formulas* are valuable, but listing them as parameters just
// floods the KB. Keep meaningful (non-reserved) parameters in the params list.
const RESERVED_PARAM_NAMES = new Set([
  "Act", "Vis", "X", "Y", "Z", "Rx", "Ry", "Rz", "Ks", "W", "D", "H", "L", "T",
  "Mir1", "Mir2", "Elem", "Mat", "ETyp", "Ref", "Info",
]);

// ── Core walk ───────────────────────────────────────────────────────────────

interface WalkContext {
  source: string;
  module: string;
  category?: string;
  formulas: FormulaEntry[];
  paramsMap: Map<string, ParamEntry>;
}

function walkNode(node: XmlNode, ctx: WalkContext): void {
  const nodeType = node.tag === "NodeData" ? node.attrs["xsi:type"] || "ComplexNode" : node.tag;
  const elementName = textOf(childByTag(node, "Name")) || undefined;

  const paramsEl = childByTag(node, "Parameters");
  if (paramsEl) {
    for (const par of paramsEl.children) {
      if (!par.tag.startsWith("Par")) continue;
      const pname = textOf(childByTag(par, "Name")) || undefined;
      const formula = textOf(childByTag(par, "Formula"));
      const value = textOf(childByTag(par, "Value"));
      const reserved = textOf(childByTag(par, "Reserved")).toLowerCase() === "true";

      if (formula && isFormula(formula)) {
        ctx.formulas.push({
          formula,
          source: ctx.source,
          module: ctx.module,
          parameter: pname,
          element: elementName,
          category: ctx.category,
          type: inferFormulaType(formula),
        });
      }

      // Collect meaningful (non-reserved) named parameters with their values.
      if (pname && !reserved && !RESERVED_PARAM_NAMES.has(pname)) {
        if (!ctx.paramsMap.has(pname)) {
          ctx.paramsMap.set(pname, { name: pname, description: "", typical_values: [] });
        }
        const entry = ctx.paramsMap.get(pname)!;
        if (value && !isFormula(value) && !entry.typical_values.includes(value)) {
          entry.typical_values.push(value);
        }
        const desc = textOf(childByTag(par, "Description"));
        if (desc && !entry.description) entry.description = desc;
      }
    }
  }

  // Recurse into nested node children (siblings of <Parameters>).
  for (const child of node.children) {
    if (isNodeTag(child.tag)) walkNode(child, ctx);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseMtsxContent(
  content: string,
  source: string,
  category?: string,
): { formulas: FormulaEntry[]; params: ParamEntry[] } {
  const tree = parseXml(content);
  const mtsx = childByTag(tree, "Mtsx") ?? tree;
  const rootNode = childByTag(mtsx, "NodeData");

  const fallbackModule = source.replace(/\.mtsx$/i, "");
  const module = (rootNode && textOf(childByTag(rootNode, "Name"))) || fallbackModule;

  const ctx: WalkContext = {
    source,
    module,
    category,
    formulas: [],
    paramsMap: new Map(),
  };

  if (rootNode) {
    walkNode(rootNode, ctx);
  } else {
    // No recognizable root node — walk any node-like elements we can find.
    for (const child of mtsx.children) {
      if (isNodeTag(child.tag)) walkNode(child, ctx);
    }
  }

  // Deduplicate formulas by formula + parameter + element + source.
  const seen = new Set<string>();
  const uniqueFormulas = ctx.formulas.filter((f) => {
    const key = `${f.formula}||${f.parameter ?? ""}||${f.element ?? ""}||${f.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const p of ctx.paramsMap.values()) {
    p.typical_values = p.typical_values.slice(0, 10);
  }

  return { formulas: uniqueFormulas, params: Array.from(ctx.paramsMap.values()) };
}

export function parseMtsxFile(
  filePath: string,
  category?: string,
): { formulas: FormulaEntry[]; params: ParamEntry[] } {
  // Let read/parse errors propagate so callers can report a real failure rather
  // than silently treating an unreadable file as successfully processed.
  const content = fs.readFileSync(filePath, "utf-8");
  const source = path.basename(filePath);
  return parseMtsxContent(content, source, category);
}

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
function selectRelevantFormulas(
  allFormulas: Array<{ formula: string; source: string }>,
  sessionCtx: SessionContext | null | undefined,
  userMessage: string,
  limit = 250,
): Array<{ formula: string; source: string }> {
  const module = sessionCtx?.moduleHint ?? null;

  const screenParams = new Set<string>();
  for (const p of sessionCtx?.parametersSeen ?? []) screenParams.add(p.name);
  for (const f of sessionCtx?.formulasSeen ?? []) {
    for (const name of extractParamNames(f)) screenParams.add(name);
  }

  const questionParams = extractParamNames(userMessage);

  const hasContext = module !== null || screenParams.size > 0 || questionParams.size > 0;

  if (!hasContext) {
    // No context — use previous behaviour: hierarchical first, then rest
    const hierarchical = allFormulas.filter((f) => /\[\.+/.test(f.formula));
    const rest = allFormulas.filter((f) => !/\[\.+/.test(f.formula));
    return [...hierarchical, ...rest].slice(0, limit);
  }

  const scored = allFormulas.map((f) => {
    let score = 0;
    if (module && f.source === module) score += 20;
    for (const p of screenParams) {
      if (new RegExp(`\\[\\.{0,4}(?:[A-Za-z0-9_.]*\\.)?${p}\\]`).test(f.formula)) score += 5;
    }
    for (const p of questionParams) {
      if (new RegExp(`\\[\\.{0,4}(?:[A-Za-z0-9_.]*\\.)?${p}\\]`).test(f.formula)) score += 3;
    }
    if (/\[\.+/.test(f.formula)) score += 1;
    return score;
  });

  return allFormulas
    .map((f, i) => ({ f, score: scored[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ f }) => f);
}

function buildSystemPrompt(
  kb: ReturnType<typeof readKnowledgeBase>,
  userRules: string,
  sessionCtx?: SessionContext | null,
  conceptualGuide?: string,
  userMessage = "",
): string {
  const syntaxRules = (kb.syntax_rules ?? []).join("\n");

  const topParams = (kb.parameters ?? [])
    .slice(0, 80)
    .map((p: { name: string; description: string; typical_values: string[] }) =>
      `${p.name}${p.description ? ` — ${p.description}` : ""}${p.typical_values?.length ? ` (tipično: ${p.typical_values.join(", ")})` : ""}`
    )
    .join("\n");

  const allFormulas: Array<{ formula: string; source: string }> = kb.formulas ?? [];
  const relevantFormulas = selectRelevantFormulas(allFormulas, sessionCtx, userMessage);
  const topFormulas = relevantFormulas
    .map((f: { formula: string; source: string }) => `${f.formula}  [iz: ${f.source}]`)
    .join("\n");

  // Faza D: include learned entries from knowledge base
  const learnedFormulas: Array<{ formula: string; source: string }> = kb.learned?.formulas ?? [];
  const learnedParams: Array<{ name: string; description: string; source: string }> = kb.learned?.parameters ?? [];
  const learnedObs: Array<{ text: string }> = kb.learned?.observations ?? [];

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

  // Faza C: session context from Live screenshots
  if (sessionCtx && (sessionCtx.parametersSeen?.length || sessionCtx.formulasSeen?.length || sessionCtx.summary)) {
    const ctxLines: string[] = [`\nTRENUTNI KONTEKST EKRANA (Live mod):`];
    if (sessionCtx.summary) ctxLines.push(`Ekran: ${sessionCtx.summary}`);
    if (sessionCtx.moduleHint) ctxLines.push(`Modul: ${sessionCtx.moduleHint}`);
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

  if (topFormulas) {
    parts.push(`\nPRIMJERI FORMULA IZ KORISNIKOVIH DATOTEKA:\n${topFormulas}`);
  }

  // Faza D: learned entries from screenshots
  if (learnedFormulas.length > 0) {
    const lf = learnedFormulas.slice(0, 20).map(f => `${f.formula}  [naučeno iz: ${f.source}]`).join("\n");
    parts.push(`\nNAUČENE FORMULE IZ SESSIJA:\n${lf}`);
  }

  if (learnedParams.length > 0) {
    const lp = learnedParams.slice(0, 20).map(p => `${p.name}${p.description ? ` — ${p.description}` : ""}`).join("\n");
    parts.push(`\nNAUČENI PARAMETRI IZ SESSIJA:\n${lp}`);
  }

  if (learnedObs.length > 0) {
    const lo = learnedObs.slice(0, 10).map(o => `- ${o.text}`).join("\n");
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

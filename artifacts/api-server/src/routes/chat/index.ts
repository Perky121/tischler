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

function buildSystemPrompt(kb: ReturnType<typeof readKnowledgeBase>, userRules: string): string {
  const syntaxRules = (kb.syntax_rules ?? []).join("\n");

  const topParams = (kb.parameters ?? [])
    .slice(0, 80)
    .map((p: { name: string; description: string; typical_values: string[] }) =>
      `${p.name}${p.description ? ` — ${p.description}` : ""}${p.typical_values?.length ? ` (tipično: ${p.typical_values.join(", ")})` : ""}`
    )
    .join("\n");

  // Prefer formulas with hierarchical references ([.W], [....H] etc.) for richer examples
  const allFormulas: Array<{ formula: string; source: string }> = kb.formulas ?? [];
  const hierarchical = allFormulas.filter((f) => /\[\.*[A-ZŠĐŽČĆa-z]/.test(f.formula));
  const rest = allFormulas.filter((f) => !/\[\.*[A-ZŠĐŽČĆa-z]/.test(f.formula));
  const sortedFormulas = [...hierarchical, ...rest];
  const topFormulas = sortedFormulas
    .slice(0, 50)
    .map((f: { formula: string; source: string }) => `${f.formula}  [iz: ${f.source}]`)
    .join("\n");

  const parts = [
    `Ti si MegaTischler parametarski asistent za formule.
Korisnik je stručnjak za izradu namještaja koji zna sve o konstrukciji, ali treba pomoć pri pisanju MegaTischler formula.
Uvijek odgovaraj na hrvatskom jeziku.
Budi direktan i konkretan — daj točnu formulu koju treba upisati i objasni gdje je upisati.
Kad vidiš screenshot, pažljivo pročitaj dijaloški okvir parametara — identificiraj imena parametara, trenutne vrijednosti i što korisnik pokušava postići.

KRITIČNO — DECIMALNI SEPARATOR: Decimalni separator je UVIJEK zarez (,), NIKAD točka (.). Primjeri: 0,5 ispravno; 0.5 POGREŠKA. Ako vidiš formulu s točkom kao decimalnim separatorom, to je greška koju treba ispraviti.`,
  ];

  if (syntaxRules) {
    parts.push(`\nPRAVILA SINTAKSE MEGATISCHLER:\n${syntaxRules}`);
  }

  if (topParams) {
    parts.push(`\nKATALOG PARAMETARA:\n${topParams}`);
  }

  if (topFormulas) {
    parts.push(`\nPRIMJERI FORMULA IZ KORISNIKOVIH DATOTEKA:\n${topFormulas}`);
  }

  if (userRules) {
    parts.push(`\nKORISNIKOVA PRAVILA ZA NAMJEŠTAJ:\n${userRules}`);
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

  const kb = readKnowledgeBase();
  const userRules = readRules();
  const systemPrompt = buildSystemPrompt(kb, userRules);

  // Build conversation history (last 10 messages)
  const recentHistory = (history ?? []).slice(-10);

  const chatMessages: MessageParam[] = recentHistory.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // Build the current user message content
  const userContent: Array<TextBlockParam | ImageBlockParam> = [];

  if (screenshot_base64) {
    // Try to detect image media type from base64 prefix
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (screenshot_base64.startsWith("iVBOR")) mediaType = "image/png";
    else if (screenshot_base64.startsWith("R0lGOD")) mediaType = "image/gif";
    else if (screenshot_base64.startsWith("UklGR")) mediaType = "image/webp";

    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: screenshot_base64,
      },
    });
  }

  userContent.push({ type: "text", text: message });

  chatMessages.push({
    role: "user",
    content: userContent,
  });

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
    logger.error({ err }, "Error calling Claude API");
    res.write(`data: ${JSON.stringify({ error: "Greška pri komunikaciji s AI modelom" })}\n\n`);
    res.end();
  }
});

export default router;

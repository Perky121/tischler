import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

type ImageBlockParam = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
};

// Faza C: extended session context structure
interface SessionContext {
  dialogType: "parameter_dialog" | "formula_error" | "mac_editor" | "none";
  parametersSeen: Array<{ name: string; value: string }>;
  formulasSeen: string[];
  moduleHint: string | null;
  summary: string;
}

// Faza B: cost constants (claude-opus-4 pricing)
const COST_PER_INPUT_TOKEN = 0.000015;  // $15 / 1M
const COST_PER_OUTPUT_TOKEN = 0.000075; // $75 / 1M

function calcCostUsd(inputTokens: number, outputTokens: number): number {
  return +(inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN).toFixed(5);
}

// Combined prompt: analyze relevance AND extract session context in one API call
const LIVE_SYSTEM_PROMPT = `Si AI asistent za MegaTischler/MegaCAD parametarski softver za projektiranje namještaja.
Analiziraš screenshot ekrana korisnika koji radi u MegaTischleru.

Tvoj zadatak: u JEDNOM JSON odgovoru vrati i procjenu relevantnosti i kontekst ekrana.

Struktura odgovora (ISKLJUČIVO validan JSON, bez teksta izvan JSON-a):
{
  "relevant": true/false,
  "message": "kratki savjet na hrvatskom (max 2 rečenice) ako je relevant=true, inače null",
  "context": {
    "dialogType": "parameter_dialog" | "formula_error" | "mac_editor" | "none",
    "parametersSeen": [{"name": "IME_PARAM", "value": "VRIJEDNOST"}, ...],
    "formulasSeen": ["formula1", "formula2"],
    "moduleHint": "IME_DATOTEKE.mac ili null",
    "summary": "Kratki opis na hrvatskom što je vidljivo na ekranu"
  }
}

relevant=true kada:
- Otvoren dijalog parametara s vidljivim parametrima i vrijednostima
- Formula ili izraz s greškama (crveni tekst, upozorenje)
- Dijalog s neispravnim vrijednostima

relevant=false kada:
- Prazan ekran, desktop, drugi programi
- MegaTischler bez otvorenih dijalooga

parametersSeen: samo parametri koji su vidljivi na ekranu (max 15).
formulasSeen: formule koje su vidljive (max 10).
moduleHint: ime .mac modula ako je vidljivo u title baru ili dijalogu, inače null.`;

router.post("/analyze-screen", async (req, res): Promise<void> => {
  const { screenshot_base64 } = req.body as { screenshot_base64?: string };

  if (!screenshot_base64) {
    res.status(400).json({ error: "screenshot_base64 is required" });
    return;
  }

  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (screenshot_base64.startsWith("iVBOR")) mediaType = "image/png";
  else if (screenshot_base64.startsWith("R0lGOD")) mediaType = "image/gif";
  else if (screenshot_base64.startsWith("UklGR")) mediaType = "image/webp";

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      system: LIVE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: screenshot_base64 },
            } as ImageBlockParam,
            { type: "text", text: "Analiziraj ovaj screenshot. Vrati samo JSON." },
          ],
        },
      ],
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const costUsd = calcCostUsd(inputTokens, outputTokens);

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ rawText }, "analyze-screen: no JSON found in response");
      res.json({
        relevant: false,
        message: null,
        context: buildEmptyContext(),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
      });
      return;
    }

    let parsed: { relevant?: boolean; message?: string | null; context?: Partial<SessionContext> };
    try {
      parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
    } catch (parseErr) {
      logger.warn({ rawText, parseErr }, "analyze-screen: JSON.parse failed");
      res.json({
        relevant: false,
        message: null,
        context: buildEmptyContext(),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
      });
      return;
    }

    const context = buildContext(parsed.context);

    const result = {
      relevant: parsed.relevant === true,
      message: parsed.relevant === true ? (parsed.message ?? null) : null,
      context,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
    };

    logger.info({ relevant: result.relevant, costUsd }, "analyze-screen response");
    res.json(result);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "analyze-screen error");
    // Always include usage with cost_usd:0 so callers don't charge for failed calls
    res.json({
      relevant: false,
      message: `analyze-screen greška: ${detail}`,
      context: buildEmptyContext(),
      usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    });
  }
});

function buildEmptyContext(): SessionContext {
  return {
    dialogType: "none",
    parametersSeen: [],
    formulasSeen: [],
    moduleHint: null,
    summary: "",
  };
}

function buildContext(raw?: Partial<SessionContext>): SessionContext {
  if (!raw) return buildEmptyContext();
  return {
    dialogType: raw.dialogType ?? "none",
    parametersSeen: Array.isArray(raw.parametersSeen) ? raw.parametersSeen.slice(0, 15) : [],
    formulasSeen: Array.isArray(raw.formulasSeen) ? raw.formulasSeen.slice(0, 10) : [],
    moduleHint: raw.moduleHint ?? null,
    summary: raw.summary ?? "",
  };
}

export default router;

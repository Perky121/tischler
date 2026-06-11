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
const LIVE_SYSTEM_PROMPT_BASE = `Si AI asistent za MegaTischler/MegaCAD parametarski softver za projektiranje namještaja.
Analiziraš screenshot ekrana korisnika koji radi u MegaTischleru.

Tvoj zadatak: u JEDNOM JSON odgovoru vrati i procjenu relevantnosti i kontekst ekrana.

Struktura odgovora (ISKLJUČIVO validan JSON, bez teksta izvan JSON-a):
{
  "relevant": true/false,
  "message": "kratki savjet na hrvatskom (max 2 rečenice) ako je relevant=true, inače null",
  "step": null,
  "context": {
    "dialogType": "parameter_dialog" | "formula_error" | "mac_editor" | "none",
    "parametersSeen": [{"name": "IME_PARAM", "value": "VRIJEDNOST"}, ...],
    "formulasSeen": ["formula1", "formula2"],
    "moduleHint": "IME_DATOTEKE.mac ili null",
    "summary": "Kratki opis na hrvatskom što je vidljivo na ekranu"
  }
}

parametersSeen: samo parametri koji su vidljivi na ekranu (max 15).
formulasSeen: formule koje su vidljive (max 10).
moduleHint: ime .mac modula ako je vidljivo u title baru ili dijalogu, inače null.
step: uvijek null u ovom modu bez zadatka.`;

const LIVE_TASK_PROMPT_APPEND = `
LIVE MOD — ZADATAK ORIENTIRAN RAD:
Korisnik je postavio ZADATAK koji trebaš riješiti praćenjem ekrana. Analiziraj screenshot S CILJEM NAPRETKA prema tom zadatku.
- message mora biti KRATAK (max 1 rečenica) kontekstualni komentar.
- step mora biti JEDAN konkretan sljedeći korak:
  { "title": "kratak naslov", "where": "gdje u MT kliknuti/upisati", "formula": "formula s zarezom ili null", "hint": "kratki hint ili null" }
- relevant=true kada promjena na ekranu ili trenutni sadržaj pomaže riješiti zadatak, ili kad trebaš upozoriti na grešku.
- relevant=false samo ako ekran nema veze s zadatkom (desktop, drugi program, prazan ekran bez MegaTischlera).
KRITIČNO: formule koriste DECIMALNI ZAREZ (0,5), nikad točku.`;

const LIVE_RESUME_PROMPT_APPEND = `
NASTAVAK LIVE MODA (resume_mode):
Korisnik je pauzirao Live mod i sada nastavlja. UVIJEK vrati relevant=true.
U message:
1) Potvrdi cilj zadatka u jednoj rečenici.
2) Reci što trenutno vidiš na ekranu u kontekstu zadatka.
3) Ako zadatak nije dovoljno jasan za nastavak (npr. ekran ne odgovara zadatku), postavi jasno pitanje što korisnik želi da pratiš — NE nastavljaj nagađati.`;

function buildLiveSystemPrompt(liveTask?: string, resumeMode?: boolean): string {
  let prompt = LIVE_SYSTEM_PROMPT_BASE;
  if (liveTask?.trim()) {
    prompt += LIVE_TASK_PROMPT_APPEND;
    prompt += `\n\nZADATAK KORISNIKA (live_task):\n${liveTask.trim()}`;
  } else {
    prompt += `
relevant=true kada:
- Otvoren dijalog parametara s vidljivim parametrima i vrijednostima
- Formula ili izraz s greškama (crveni tekst, upozorenje)
- Dijalog s neispravnim vrijednostima

relevant=false kada:
- Prazan ekran, desktop, drugi programi
- MegaTischler bez otvorenih dijalooga`;
  }
  if (resumeMode) {
    prompt += LIVE_RESUME_PROMPT_APPEND;
  }
  return prompt;
}

router.post("/analyze-screen", async (req, res): Promise<void> => {
  const { screenshot_base64, live_task, resume_mode } = req.body as {
    screenshot_base64?: string;
    live_task?: string;
    resume_mode?: boolean;
  };

  if (!screenshot_base64) {
    res.status(400).json({ error: "screenshot_base64 is required" });
    return;
  }

  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (screenshot_base64.startsWith("iVBOR")) mediaType = "image/png";
  else if (screenshot_base64.startsWith("R0lGOD")) mediaType = "image/gif";
  else if (screenshot_base64.startsWith("UklGR")) mediaType = "image/webp";

  const userTextParts = ["Analiziraj ovaj screenshot. Vrati samo JSON."];
  if (resume_mode) {
    userTextParts.push("resume_mode=true — korisnik nastavlja Live mod nakon pauze.");
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      system: buildLiveSystemPrompt(live_task, resume_mode),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: screenshot_base64 },
            } as ImageBlockParam,
            { type: "text", text: userTextParts.join("\n") },
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
        step: null,
        context: buildEmptyContext(),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
      });
      return;
    }

    let parsed: { relevant?: boolean; message?: string | null; step?: Record<string, string | null> | null; context?: Partial<SessionContext> };
    try {
      parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
    } catch (parseErr) {
      logger.warn({ rawText, parseErr }, "analyze-screen: JSON.parse failed");
      res.json({
        relevant: false,
        message: null,
        step: null,
        context: buildEmptyContext(),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
      });
      return;
    }

    const context = buildContext(parsed.context);

    let relevant = parsed.relevant === true;
    let message = relevant ? (parsed.message ?? null) : null;
    const step = parsed.step ?? null;

    // On resume, always surface a proactive message so user can re-orient
    if (resume_mode) {
      relevant = true;
      if (!message?.trim()) {
        message = live_task?.trim()
          ? `Nastavljam s zadatkom: ${live_task.trim()}. Reci mi na što da se fokusiram ako ekran ne odgovara tom cilju.`
          : "Nastavljam Live mod. Na što da se fokusiram — koji parametar ili dio konstrukcije pratiš?";
      }
    }

    const result = {
      relevant,
      message,
      step,
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

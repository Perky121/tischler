import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

type ImageBlockParam = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
};

const LIVE_SYSTEM_PROMPT = `Si AI asistent za MegaTischler parametarski softver za projektiranje namještaja.
Gledaš screenshot ekrana korisnika koji radi u MegaTischleru.

Tvoj zadatak: analiziraj screenshot i odluči je li vidljivo nešto relevantno za parametarsko programiranje.

Relevantno je (relevant=true):
- Otvoren dijalog parametara s vidljivim parametrima i vrijednostima
- Formula ili izraz s greškama (crveni tekst, upozorenje)
- Dijalog s poljima koja izgleda nedovršena ili imaju neispravne vrijednosti

Nije relevantno (relevant=false):
- Prazan ekran, desktop, drugi programi
- MegaTischler bez otvorenih dijalooga
- Standardni prikaz bez parametarskih dijalooga

Odgovori ISKLJUČIVO s validnim JSON objektom, bez ikakvog teksta prije ili poslije:
{"relevant": true/false, "message": "kratki savjet na hrvatskom (max 2 rečenice)" | null}

Ako je relevant=false, message mora biti null.
Ako je relevant=true, message treba biti konkretan i koristan savjet.`;

router.post("/analyze-screen", async (req, res): Promise<void> => {
  const { screenshot_base64 } = req.body as {
    screenshot_base64?: string;
    call_count?: number;
  };

  if (!screenshot_base64) {
    res.status(400).json({ error: "screenshot_base64 is required" });
    return;
  }

  // Detect image type from base64 prefix (Electron sends PNG)
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (screenshot_base64.startsWith("iVBOR")) mediaType = "image/png";
  else if (screenshot_base64.startsWith("R0lGOD")) mediaType = "image/gif";
  else if (screenshot_base64.startsWith("UklGR")) mediaType = "image/webp";

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 256,
      system: LIVE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: screenshot_base64,
              },
            } as ImageBlockParam,
            {
              type: "text",
              text: "Analiziraj ovaj screenshot. Vrati samo JSON.",
            },
          ],
        },
      ],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Extract JSON — Claude sometimes wraps it in markdown code fences
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ rawText }, "analyze-screen: no JSON found in response");
      res.json({ relevant: false, message: null });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      relevant?: boolean;
      message?: string | null;
    };

    const result = {
      relevant: parsed.relevant === true,
      message: parsed.relevant === true ? (parsed.message ?? null) : null,
    };

    logger.info({ relevant: result.relevant }, "analyze-screen response");
    res.json(result);
  } catch (err: unknown) {
    logger.error({ err }, "analyze-screen error");
    // Return non-relevant on error so live loop continues silently
    res.json({ relevant: false, message: null });
  }
});

export default router;

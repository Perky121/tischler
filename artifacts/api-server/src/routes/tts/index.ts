import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type Voice = (typeof VALID_VOICES)[number];

router.post("/tts", async (req, res): Promise<void> => {
  const { text, voice = "onyx" } = req.body as {
    text?: string;
    voice?: string;
  };

  if (!text || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const apiKey =
    (req.headers["x-openai-key"] as string | undefined) ||
    process.env["OPENAI_API_KEY"];

  if (!apiKey) {
    res.status(400).json({
      error:
        "OpenAI API key not configured. Add OPENAI_API_KEY to Replit Secrets or set it in Electron app settings.",
    });
    return;
  }

  const resolvedVoice: Voice = VALID_VOICES.includes(voice as Voice)
    ? (voice as Voice)
    : "onyx";

  try {
    const openai = new OpenAI({ apiKey });

    // Truncate to 4096 chars (Whisper TTS limit)
    const input = text.trim().slice(0, 4096);

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: resolvedVoice,
      input,
      response_format: "mp3",
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());

    logger.info({ bytes: audioBuffer.length, voice: resolvedVoice }, "TTS generated");

    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(audioBuffer.length));
    res.send(audioBuffer);
  } catch (err: unknown) {
    logger.error({ err }, "TTS error");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;

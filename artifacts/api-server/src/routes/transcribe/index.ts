import { Router, type IRouter } from "express";
import OpenAI, { toFile } from "openai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

router.post("/transcribe", async (req, res): Promise<void> => {
  const { audio_base64, mime_type } = req.body as {
    audio_base64?: string;
    mime_type?: string;
  };

  if (!audio_base64) {
    res.status(400).json({ error: "audio_base64 is required" });
    return;
  }

  // API key: prefer request header (from Electron settings), fallback to env var
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

  try {
    const audioBuffer = Buffer.from(audio_base64, "base64");
    const resolvedMime = (mime_type || "audio/webm") as
      | "audio/webm"
      | "audio/mp4"
      | "audio/ogg"
      | "audio/wav"
      | "audio/mpeg";

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/webm;codecs=opus": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "mp4",
      "audio/wav": "wav",
      "audio/mpeg": "mp3",
    };
    const ext = extMap[resolvedMime] ?? "webm";
    const filename = `recording.${ext}`;

    const openai = new OpenAI({ apiKey });

    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioBuffer, filename, { type: resolvedMime }),
      model: "whisper-1",
      language: "hr",
    });

    logger.info({ chars: transcription.text.length }, "Transcription complete");
    res.json({ text: transcription.text });
  } catch (err: unknown) {
    logger.error({ err }, "Transcription error");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;

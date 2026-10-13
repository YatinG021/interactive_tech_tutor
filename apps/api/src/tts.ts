import { createHash } from "node:crypto";
import { getCachedSpeech, putCachedSpeech, speechCharsSince } from "./db.js";

// Sarvam AI text-to-speech (https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert).
// Every clip is cached by (model, speaker, text), so a sentence is paid for once no matter how many
// learners replay it. A daily character budget protects limited credits.

const ENDPOINT = "https://api.sarvam.ai/text-to-speech";
const MAX_CHARS = 1500;

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function readConfig() {
  return {
    apiKey: process.env.SARVAM_API_KEY?.trim() ?? "",
    model: process.env.SARVAM_TTS_MODEL?.trim() || "bulbul:v4-flash",
    speaker: process.env.SARVAM_TTS_SPEAKER?.trim() || "simran_en_edtech",
    language: process.env.SARVAM_TTS_LANGUAGE?.trim() || "en-IN",
    dailyCharLimit: Number(process.env.TTS_DAILY_CHAR_LIMIT ?? 8000)
  };
}

export function isTtsConfigured(): boolean {
  return Boolean(readConfig().apiKey);
}

export function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
}

const inflight = new Map<string, Promise<Buffer>>();

export async function synthesize(rawText: string): Promise<{ audio: Buffer; cached: boolean }> {
  const config = readConfig();
  if (!config.apiKey) {
    throw new TtsError("Natural voice is not configured.", 503);
  }
  const text = normalizeSpeechText(rawText);
  if (!text) {
    throw new TtsError("Nothing to say.", 400);
  }
  const cacheKey = createHash("sha256").update(`${config.model}|${config.speaker}|${config.language}|${text}`).digest("hex");

  const cached = getCachedSpeech(cacheKey);
  if (cached) {
    return { audio: cached, cached: true };
  }

  const pending = inflight.get(cacheKey);
  if (pending) {
    return { audio: await pending, cached: true };
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  if (speechCharsSince(startOfDay.getTime()) + text.length > config.dailyCharLimit) {
    throw new TtsError("Today's natural-voice budget is used up.", 429);
  }

  const request = (async () => {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "api-subscription-key": config.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: config.language,
        model: config.model,
        speaker: config.speaker,
        pace: 1.0,
        speech_sample_rate: 24000,
        output_audio_codec: "mp3"
      }),
      signal: AbortSignal.timeout(30000)
    });
    const payload = (await response.json().catch(() => ({}))) as { audios?: string[]; error?: { message?: string } };
    if (!response.ok || !payload.audios?.[0]) {
      const message = payload.error?.message ?? `Sarvam TTS failed (${response.status}).`;
      console.error("[TTS]", response.status, message);
      throw new TtsError(message, response.status === 429 ? 429 : 502);
    }
    const audio = Buffer.from(payload.audios[0], "base64");
    putCachedSpeech(cacheKey, audio, text.length);
    console.log(`[TTS] synthesized ${text.length} chars with ${config.model}/${config.speaker}`);
    return audio;
  })();
  inflight.set(cacheKey, request);
  try {
    return { audio: await request, cached: false };
  } finally {
    inflight.delete(cacheKey);
  }
}

"use client";

import { API_BASE_URL, TOKEN_KEY } from "./api";
import { speak, stopSpeaking } from "./speech";

// Narration plays Sarvam's natural voice (synthesised and cached by the API) and falls back to the
// browser's speechSynthesis whenever that isn't available. Speed is applied with playbackRate, so
// changing it never re-synthesises audio.

export type VoiceEngine = "natural" | "browser";
const ENGINE_KEY = "itt_voice_engine";

export function getVoiceEngine(): VoiceEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === "browser" ? "browser" : "natural";
  } catch {
    return "natural";
  }
}

export function setVoiceEngine(engine: VoiceEngine): void {
  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    // ignore
  }
}

const clips = new Map<string, Promise<string>>();
let naturalUnavailable = false;
let current: HTMLAudioElement | null = null;
let generation = 0;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function fetchClip(text: string): Promise<string> {
  const key = normalize(text);
  const existing = clips.get(key);
  if (existing) return existing;
  const promise = (async () => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      token = null;
    }
    const response = await fetch(`${API_BASE_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text: key })
    });
    if (!response.ok) {
      // Budget used up or not configured: stop asking for this session.
      if (response.status === 429 || response.status === 503) naturalUnavailable = true;
      throw new Error(`TTS ${response.status}`);
    }
    return URL.createObjectURL(await response.blob());
  })();
  clips.set(key, promise);
  promise.catch(() => clips.delete(key));
  return promise;
}

/** Warm the cache for a clip that will probably play next. */
export function prefetchNarration(text: string): void {
  if (getVoiceEngine() !== "natural" || naturalUnavailable || !normalize(text)) return;
  void fetchClip(text).catch(() => undefined);
}

export function stopNarration(): void {
  generation += 1;
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  stopSpeaking();
}

export function narrate(text: string, options: { rate?: number; voiceName?: string; onEnd?: () => void } = {}): void {
  stopNarration();
  const mine = generation;
  const done = () => {
    if (mine === generation) options.onEnd?.();
  };
  const fallback = () => {
    if (mine !== generation) return;
    speak(text, { rate: options.rate, voiceName: options.voiceName, onEnd: done });
  };
  if (getVoiceEngine() !== "natural" || naturalUnavailable) {
    fallback();
    return;
  }
  fetchClip(text)
    .then((url) => {
      if (mine !== generation) return;
      const audio = new Audio(url);
      audio.playbackRate = options.rate ?? 1;
      audio.onended = done;
      audio.onerror = fallback;
      current = audio;
      return audio.play().catch(fallback);
    })
    .catch(fallback);
}

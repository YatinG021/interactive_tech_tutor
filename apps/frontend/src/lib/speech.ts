"use client";

// Browser speech APIs. Narration uses speechSynthesis; voice commands use SpeechRecognition
// (Chrome, Edge and Safari; not Firefox). Both degrade to no-ops when unavailable.

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
}

export function speak(
  text: string,
  options: { rate?: number; voiceName?: string; onEnd?: () => void } = {}
): void {
  if (!canSpeak() || !text.trim()) {
    options.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1;
  const voice = options.voiceName ? synth.getVoices().find((item) => item.name === options.voiceName) : undefined;
  if (voice) utterance.voice = voice;
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onEnd?.();
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionCtor() !== null;
}

/** Listens for one utterance. Resolves with the transcript, or "" if nothing was heard. */
export function listenOnce(): { promise: Promise<string>; cancel: () => void } {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    return { promise: Promise.reject(new Error("Voice input isn't supported in this browser.")), cancel: () => {} };
  }
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  let transcript = "";
  const promise = new Promise<string>((resolve, reject) => {
    recognition.onresult = (event) => {
      transcript = event.results[0]?.[0]?.transcript ?? "";
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        resolve("");
        return;
      }
      reject(new Error(event.error === "not-allowed" ? "Microphone access was blocked." : `Voice input failed (${event.error}).`));
    };
    recognition.onend = () => resolve(transcript.trim());
  });
  recognition.start();
  return { promise, cancel: () => recognition.abort() };
}

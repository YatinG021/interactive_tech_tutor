"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bot, Mic, Paperclip, SendHorizonal, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { canListen, listenOnce, speak } from "@/lib/speech";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  topicId: string;
  topicTitle: string;
  voiceRate: number;
  voiceName: string;
  /** Called when the learner starts typing or talking, so playback can pause. */
  onEngage?: () => void;
}

export function ChatPanel({ topicId, topicTitle, voiceRate, voiceName, onEngage }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: `Ask me anything about ${topicTitle}. I'll keep answers short and concrete.`
    }
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = async (text: string, mode: "text" | "voice") => {
    const message = text.trim();
    if (!message || pending) return;
    onEngage?.();
    const context = messages.slice(1).slice(-5);
    setMessages((current) => [...current, { role: "user", text: message, timestamp: new Date().toISOString() }]);
    setDraft("");
    setPending(true);
    try {
      const { response } = await api.chat({ topicId, topicTitle, message, mode, context });
      setMessages((current) => [...current, { role: "assistant", text: response, timestamp: new Date().toISOString() }]);
      if (speakReplies || mode === "voice") speak(response, { rate: voiceRate, voiceName });
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: `Sorry, that didn't go through: ${(error as Error).message}` }]);
    } finally {
      setPending(false);
    }
  };

  const talk = async () => {
    if (listening) return;
    onEngage?.();
    setListening(true);
    try {
      const transcript = await listenOnce().promise;
      if (transcript) await send(transcript, "voice");
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: (error as Error).message }]);
    } finally {
      setListening(false);
    }
  };

  const attach = async (file: File) => {
    try {
      const { response } = await api.visual({
        topicId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        size: file.size
      });
      setMessages((current) => [...current, { role: "assistant", text: response }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: (error as Error).message }]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <AnimatePresence initial={false}>
          {messages.map((message, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}
            >
              {message.role === "assistant" ? (
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-violet/15 ring-1 ring-violet/30">
                  <Bot className="size-3.5 text-violet" />
                </span>
              ) : null}
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  message.role === "user"
                    ? "rounded-br-md bg-cyan/15 text-fg ring-1 ring-cyan/25"
                    : "rounded-bl-md bg-ink-800 text-fg ring-1 ring-line"
                )}
              >
                {message.text}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
        {pending ? (
          <div className="flex items-center gap-1.5 pl-8" aria-label="Tutor is typing">
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="size-1.5 rounded-full bg-violet"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: dot * 0.18 }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft, "text");
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-xl bg-ink-900 p-1.5 ring-1 ring-line-strong focus-within:ring-cyan/50">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={onEngage}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft, "text");
              }
            }}
            rows={1}
            placeholder="Ask the tutor…"
            aria-label="Message the tutor"
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || pending}
            className="grid size-9 place-items-center rounded-lg bg-fg text-ink-950 transition hover:bg-white disabled:opacity-40"
            aria-label="Send"
          >
            <SendHorizonal className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-fg-subtle">
          {canListen() ? (
            <button
              type="button"
              onClick={talk}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/5 hover:text-fg",
                listening && "text-signal"
              )}
            >
              <Mic className="size-3.5" /> {listening ? "Listening…" : "Ask by voice"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSpeakReplies((value) => !value)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/5 hover:text-fg"
            aria-pressed={speakReplies}
          >
            {speakReplies ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            Read replies aloud
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/5 hover:text-fg"
            title="Only the file name, type and size are shared"
          >
            <Paperclip className="size-3.5" /> Attach
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void attach(file);
              event.target.value = "";
            }}
          />
        </div>
      </form>
    </div>
  );
}

"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { Award, Bot, MessageSquareText, Mic, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DemoPlayer } from "./DemoPlayer";
import { cn } from "@/lib/utils";

const CHAPTER_MS = 7000;

const chapters = [
  { id: "simulate", label: "Watch it work", icon: Sparkles, caption: "Every step is drawn and narrated, live." },
  { id: "voice", label: "Talk to it", icon: Mic, caption: "Say “go to step 3” and the player obeys." },
  { id: "tutor", label: "Ask the tutor", icon: MessageSquareText, caption: "Short, concrete answers that stay on topic." },
  { id: "practice", label: "Practise & level up", icon: Award, caption: "Pass the quiz to unlock the next level." }
] as const;

/** A chaptered, auto-advancing reel of motion-graphic scenes. Behaves like a muted looping video. */
export function FeatureReel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [chapter, setChapter] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const active = playing && inView;

  useEffect(() => {
    if (!active) return;
    const started = performance.now() - elapsed;
    const timer = window.setInterval(() => {
      const now = performance.now() - started;
      if (now >= CHAPTER_MS) {
        setChapter((value) => (value + 1) % chapters.length);
        setElapsed(0);
      } else {
        setElapsed(now);
      }
    }, 80);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart the clock per chapter only
  }, [active, chapter]);

  const select = (index: number) => {
    setChapter(index);
    setElapsed(0);
  };

  const Scene = [SimulateScene, VoiceScene, TutorScene, PracticeScene][chapter];

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {chapters.map((item, i) => {
          const Icon = item.icon;
          const isActive = i === chapter;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => select(i)}
              className={cn(
                "relative min-w-[200px] overflow-hidden rounded-xl px-4 py-3.5 text-left ring-1 transition lg:min-w-0",
                isActive ? "bg-ink-800 ring-line-strong" : "bg-transparent ring-line hover:bg-ink-850"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className={cn("size-4", isActive ? "text-cyan" : "text-fg-subtle")} />
                <span className={cn("text-sm font-medium", isActive ? "text-fg" : "text-fg-muted")}>{item.label}</span>
              </span>
              <span className={cn("mt-1 block text-xs leading-relaxed", isActive ? "text-fg-muted" : "text-fg-subtle")}>
                {item.caption}
              </span>
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
                <span
                  className="block h-full bg-gradient-to-r from-cyan to-violet"
                  style={{ width: isActive ? `${(elapsed / CHAPTER_MS) * 100}%` : i < chapter ? "100%" : "0%" }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-line-strong shadow-[0_30px_120px_-50px_rgb(139_92_246/0.5)]">
        <div className="relative aspect-[4/5] bg-blueprint sm:aspect-[16/10]">
          <AnimatePresence mode="wait">
            <motion.div
              key={chapters[chapter].id}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              <Scene />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-ink-850/90 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            className="grid size-7 place-items-center rounded-full bg-white/10 text-fg hover:bg-white/20"
            aria-label={playing ? "Pause reel" : "Play reel"}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
          </button>
          <span className="font-mono text-[11px] text-fg-muted">
            {String(chapter + 1).padStart(2, "0")} · {chapters[chapter].label}
          </span>
          <span className="ml-auto font-mono text-[11px] text-fg-subtle">
            0:{String(Math.floor((chapter * CHAPTER_MS + elapsed) / 1000)).padStart(2, "0")} / 0:
            {String((chapters.length * CHAPTER_MS) / 1000).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}

function SimulateScene() {
  return (
    <div className="absolute inset-0 grid place-items-center p-3 sm:p-6">
      <DemoPlayer demo="tcpHandshake" stepMs={5200} compact className="w-full max-w-[560px]" />
    </div>
  );
}

function VoiceScene() {
  const bars = Array.from({ length: 28 });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="relative grid size-20 place-items-center rounded-full bg-signal/15 ring-1 ring-signal/40"
      >
        <motion.span
          className="absolute inset-0 rounded-full ring-2 ring-signal/40"
          animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <Mic className="size-8 text-signal" />
      </motion.div>

      <div className="flex h-12 items-center gap-1">
        {bars.map((_, i) => (
          <motion.span
            key={i}
            className="w-1.5 rounded-full bg-gradient-to-t from-cyan to-violet"
            animate={{ height: ["18%", `${30 + ((i * 37) % 70)}%`, "18%"] }}
            transition={{ duration: 0.9 + (i % 5) * 0.12, repeat: Infinity, delay: i * 0.03, ease: "easeInOut" }}
            style={{ height: "18%" }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="rounded-2xl bg-ink-800 px-5 py-3 text-lg text-fg ring-1 ring-line-strong"
      >
        “Take me to step 3”
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.4, duration: 0.5 }}
        className="flex items-center gap-2 font-mono text-xs"
      >
        <span className="rounded-md bg-cyan/10 px-2 py-1 text-cyan ring-1 ring-cyan/25">jump_to_step</span>
        <span className="text-fg-subtle">step_number:</span>
        <span className="text-signal">3</span>
      </motion.div>

      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <motion.span
            key={n}
            className="grid size-9 place-items-center rounded-lg text-sm font-medium ring-1"
            initial={{ backgroundColor: "rgba(255,255,255,0.04)", color: "#93a3bd" }}
            animate={
              n === 3
                ? { backgroundColor: "rgba(255,107,53,0.18)", color: "#ff6b35", scale: [1, 1.15, 1] }
                : { backgroundColor: "rgba(255,255,255,0.04)", color: "#93a3bd" }
            }
            transition={{ delay: n === 3 ? 3.4 : 0, duration: 0.6 }}
            style={{ borderColor: "transparent" }}
          >
            {n}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

const chatScript = [
  { role: "user" as const, text: "Why does TCP need a third ACK?" },
  {
    role: "assistant" as const,
    text: "The third ACK proves the client received the server's sequence number. Without it, the server can't tell a live client from an old, delayed SYN. Example: the server sent seq 5000, so the client replies ack 5001."
  },
  { role: "user" as const, text: "So it's about both sides agreeing?" }
];

function TutorScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-[520px] space-y-3">
        {chatScript.map((message, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3 + i * 1.6, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn("flex gap-2.5", message.role === "user" ? "justify-end" : "justify-start")}
          >
            {message.role === "assistant" ? (
              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-violet/15 ring-1 ring-violet/30">
                <Bot className="size-4 text-violet" />
              </span>
            ) : null}
            <span
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
                message.role === "user"
                  ? "rounded-br-md bg-cyan/15 text-fg ring-1 ring-cyan/25"
                  : "rounded-bl-md bg-ink-800 text-fg ring-1 ring-line-strong"
              )}
            >
              {message.text}
            </span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 5.2 }}
          className="flex items-center gap-1.5 pl-10"
        >
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="size-1.5 rounded-full bg-violet"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: dot * 0.18 }}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function PracticeScene() {
  const choices = ["SYN, ACK, FIN", "SYN, SYN-ACK, ACK", "ACK, SYN, SYN-ACK"];
  const circumference = 2 * Math.PI * 34;
  return (
    <div className="absolute inset-0 grid items-center gap-6 p-6 sm:grid-cols-[1.3fr_1fr] sm:p-10">
      <div className="rounded-2xl bg-ink-850 p-5 ring-1 ring-line-strong">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Beginner · Question 3 of 3</p>
        <p className="mt-2 text-sm font-medium text-fg">Which order does the TCP handshake use?</p>
        <div className="mt-4 space-y-2">
          {choices.map((choice, i) => (
            <motion.div
              key={choice}
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm ring-1"
              initial={{ backgroundColor: "rgba(255,255,255,0.03)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.18)" }}
              animate={
                i === 1
                  ? { backgroundColor: "rgba(34,197,94,0.14)", boxShadow: "inset 0 0 0 1px rgba(34,197,94,0.5)" }
                  : {}
              }
              transition={{ delay: 1.4, duration: 0.4 }}
            >
              <span className="text-fg">{choice}</span>
              {i === 1 ? (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.6, type: "spring", stiffness: 300 }}
                  className="text-xs font-semibold text-mint"
                >
                  Correct
                </motion.span>
              ) : null}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative size-36">
          <svg viewBox="0 0 80 80" className="size-full -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="6" />
            <motion.circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="url(#score-g)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * 0.1 }}
              transition={{ delay: 2.2, duration: 1.4, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id="score-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#00d4ff" />
                <stop offset="1" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.4 }}
            className="absolute inset-0 grid place-items-center text-3xl font-semibold text-fg"
          >
            90%
          </motion.span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 4, type: "spring", stiffness: 200, damping: 16 }}
          className="flex items-center gap-2 rounded-full bg-violet/15 px-4 py-2 text-sm font-medium text-fg ring-1 ring-violet/40"
        >
          <Award className="size-4 text-violet" />
          Intermediate unlocked
        </motion.div>
      </div>
    </div>
  );
}

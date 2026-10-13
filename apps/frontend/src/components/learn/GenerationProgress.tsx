"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Mirrors the API's real pipeline: outline, then every step's canvas in parallel, then repairs.
const STAGES = [
  { at: 0, label: "Reading your topic" },
  { at: 3, label: "Storyboarding the steps and a running example" },
  { at: 10, label: "Drawing every step in parallel" },
  { at: 24, label: "Checking each diagram against its narration" }
];

export function GenerationProgress({ topic, level }: { topic: string; level: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds((Date.now() - started) / 1000), 200);
    return () => window.clearInterval(timer);
  }, []);

  const current = STAGES.reduce((index, stage, i) => (seconds >= stage.at ? i : index), 0);
  // Approaches 95% without claiming to be done before the response arrives.
  const percent = 95 * (1 - Math.exp(-seconds / 14));

  return (
    <div className="mx-auto max-w-2xl py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">Generating · {level}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">{topic}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          A new topic takes about 20–40 seconds. Topics someone has already generated open instantly.
        </p>
      </motion.div>

      <div className="mt-10 grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="relative h-16 overflow-hidden rounded-xl bg-ink-850 ring-1 ring-line">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan/25 to-violet/25"
              initial={{ width: "0%" }}
              animate={{ width: current >= 2 ? "100%" : current === 1 ? "12%" : "0%" }}
              transition={{ duration: current >= 2 ? 6 + (i % 4) * 2.2 : 1.2, ease: "easeInOut" }}
            />
            <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-fg-subtle">step {i + 1}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan to-violet"
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <ol className="mt-8 space-y-3">
        {STAGES.map((stage, i) => (
          <li key={stage.label} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full ring-1 transition",
                i < current ? "bg-mint/15 ring-mint/40" : i === current ? "bg-cyan/15 ring-cyan/50" : "ring-line"
              )}
            >
              <AnimatePresence mode="wait">
                {i < current ? (
                  <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Check className="size-3.5 text-mint" />
                  </motion.span>
                ) : i === current ? (
                  <motion.span
                    key="live"
                    className="size-2 rounded-full bg-cyan"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                ) : null}
              </AnimatePresence>
            </span>
            <span className={i <= current ? "text-fg" : "text-fg-subtle"}>{stage.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-center font-mono text-xs text-fg-subtle">{seconds.toFixed(0)}s elapsed</p>
    </div>
  );
}

"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import demos from "@/data/demo-simulations.json";
import { SimulationCanvas } from "@/components/learn/SimulationCanvas";
import type { SimulationStep } from "@/lib/types";
import { usePlayer } from "@/lib/usePlayer";
import { cn } from "@/lib/utils";

export type DemoKey = keyof typeof demos;

interface Props {
  demo: DemoKey;
  stepMs?: number;
  className?: string;
  /** Compact chrome for small frames. */
  compact?: boolean;
}

/**
 * A looping, video-style playback of a simulation our pipeline actually generated
 * (src/data/demo-simulations.json), drawn live by the same renderer the app uses.
 */
export function DemoPlayer({ demo, stepMs = 6500, className, compact = false }: Props) {
  const data = demos[demo];
  const steps = data.steps as unknown as SimulationStep[];
  const frameRef = useRef<HTMLDivElement>(null);
  const inView = useInView(frameRef, { amount: 0.25 });
  const player = usePlayer(steps, { stepMs, loop: true, autoPlay: true });
  const { setPlaying } = player;

  // Pause off-screen so several players on one page do not compete for frames.
  useEffect(() => {
    setPlaying(inView);
  }, [inView, setPlaying]);

  const words = player.step?.subtitle.split(/\s+/) ?? [];
  const revealed = Math.max(1, Math.ceil(words.length * Math.min(1, player.progress * 1.25)));

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-line-strong",
        "shadow-[0_30px_120px_-40px_rgb(0_212_255/0.45)]",
        className
      )}
    >
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-line bg-ink-850/90 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate text-xs font-medium text-fg-muted">{data.title}</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={player.index}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.3 }}
              className="hidden truncate text-xs text-fg-subtle md:inline"
            >
              <span className="mx-1.5 text-line-strong">/</span>
              <span className="font-mono text-cyan">
                {String(player.index + 1).padStart(2, "0")}/{String(steps.length).padStart(2, "0")}
              </span>{" "}
              <span className="text-fg">{player.step?.concept}</span>
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-mint/10 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-mint ring-1 ring-mint/25 sm:inline-flex">
          <span className="size-1.5 animate-pulse rounded-full bg-mint" />
          REAL OUTPUT
        </span>
      </div>

      {/* stage */}
      <div className="relative aspect-[16/10] bg-blueprint-fine">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(0_212_255/0.06),transparent_70%)]" />
        <SimulationCanvas step={player.step} paused={!player.playing} className="absolute inset-0" />

      </div>

      {/* subtitle + controls */}
      <div className={cn("border-t border-line bg-ink-850/90", compact ? "px-3 py-2.5" : "px-4 py-3")}>
        {!compact ? (
          <p className="min-h-[2.75rem] text-[13px] leading-relaxed text-fg">
            {words.map((word, i) => (
              <span
                key={`${player.index}-${i}`}
                className={cn("transition-opacity duration-300", i < revealed ? "opacity-100" : "opacity-20")}
              >
                {word}{" "}
              </span>
            ))}
          </p>
        ) : null}
        <div className={cn("flex items-center gap-3", !compact && "mt-2.5")}>
          <button
            type="button"
            onClick={player.toggle}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-fg transition hover:bg-white/20"
            aria-label={player.playing ? "Pause demo" : "Play demo"}
          >
            {player.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
          </button>
          <div className="flex flex-1 gap-1">
            {steps.map((step, i) => (
              <button
                key={step.step}
                type="button"
                onClick={() => player.goTo(i)}
                className="group relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                aria-label={`Go to step ${i + 1}: ${step.concept}`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan to-violet"
                  style={{ width: i < player.index ? "100%" : i === player.index ? `${player.progress * 100}%` : "0%" }}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={player.restart}
            className="grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-white/10 hover:text-fg"
            aria-label="Restart demo"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

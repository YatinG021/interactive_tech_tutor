"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationStep } from "./types";
import { stepDurationMs } from "./utils";

interface Options {
  /** Fixed time per step (landing demos); otherwise each step's own duration. */
  stepMs?: number;
  loop?: boolean;
  autoPlay?: boolean;
  /** Return false to hold on the current step (e.g. narration still speaking). */
  canAdvance?: () => boolean;
  onStepChange?: (index: number) => void;
  onFinish?: () => void;
}

/** Playback clock for a list of steps: play/pause, next/previous and auto-advance. */
export function usePlayer(steps: SimulationStep[], options: Options = {}) {
  const { stepMs, loop = false, autoPlay = true } = options;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const duration = steps[index] ? (stepMs ?? stepDurationMs(steps[index])) : 0;

  const goTo = useCallback(
    (next: number) => {
      if (steps.length === 0) return;
      const clamped = Math.max(0, Math.min(steps.length - 1, next));
      elapsedRef.current = 0;
      setElapsed(0);
      setIndex(clamped);
      optionsRef.current.onStepChange?.(clamped);
    },
    [steps.length]
  );

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    let last = performance.now();
    let frame = 0;
    let lastPublished = 0;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!document.hidden) {
        elapsedRef.current += delta;
        if (now - lastPublished > 100) {
          lastPublished = now;
          setElapsed(elapsedRef.current);
        }
      }
      const canAdvance = optionsRef.current.canAdvance?.() ?? true;
      if (elapsedRef.current >= duration && canAdvance) {
        if (index < steps.length - 1) {
          goTo(index + 1);
          return;
        }
        if (loop) {
          goTo(0);
          return;
        }
        setPlaying(false);
        optionsRef.current.onFinish?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, index, duration, steps.length, loop, goTo]);

  return {
    index,
    step: steps[index] ?? null,
    playing,
    progress: duration > 0 ? Math.min(1, elapsed / duration) : 0,
    elapsed,
    duration,
    setPlaying,
    toggle: () => setPlaying((value) => !value),
    next: () => goTo(index + 1),
    previous: () => goTo(index - 1),
    restart: () => {
      goTo(0);
      setPlaying(true);
    },
    goTo
  };
}

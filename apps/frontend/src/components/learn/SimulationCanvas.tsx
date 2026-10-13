"use client";

import { useEffect, useRef } from "react";
import { SimulationCanvasRenderer, type SimulationCanvasStepLike } from "@/lib/simulation/renderer";
import type { SimulationStep } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  step: SimulationStep | null;
  paused?: boolean;
  className?: string;
}

/**
 * Draws one simulation step with the shared canvas renderer. The renderer keeps per-element runtime
 * state, so each step is cloned before it is handed over and React state is never mutated.
 */
export function SimulationCanvas({ step, paused = false, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SimulationCanvasRenderer | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new SimulationCanvasRenderer(host);
    rendererRef.current = renderer;
    let frame = 0;
    const tick = (now: number) => {
      renderer.setPaused(pausedRef.current || document.hidden, now);
      renderer.render(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const observer = new ResizeObserver(() => {
      renderer.resize();
      renderer.render(performance.now());
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (step && rendererRef.current) {
      rendererRef.current.setStep(structuredClone(step) as unknown as SimulationCanvasStepLike);
    }
  }, [step]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  return <div ref={hostRef} className={cn("relative h-full w-full", className)} aria-hidden />;
}

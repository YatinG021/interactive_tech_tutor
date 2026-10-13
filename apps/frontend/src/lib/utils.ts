import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SimulationStep } from "./types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** How long a step stays on screen: the API's hint, else ~400 ms per spoken word (12-35 s). */
export function stepDurationMs(step: SimulationStep): number {
  const hinted = Number(step.duration_ms);
  if (Number.isFinite(hinted) && hinted >= 4000) {
    return hinted;
  }
  const words = step.subtitle.split(/\s+/).filter(Boolean).length;
  return Math.min(35000, Math.max(12000, words * 400));
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "";
  }
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function featuredHref(slug: string, level = "beginner"): string {
  return `/learn/?featured=${encodeURIComponent(slug)}&level=${encodeURIComponent(level)}`;
}

export function learnHref(topic: string, level: string): string {
  return `/learn/?topic=${encodeURIComponent(topic)}&level=${encodeURIComponent(level)}`;
}

/** Generated topic ids look like "custom-<ms>-<slug>"; show the readable part. */
export function prettyTopic(topicId: string): string {
  const slug = topicId.replace(/^custom-\d+-/, "");
  return capitalize(slug.replace(/-/g, " "));
}

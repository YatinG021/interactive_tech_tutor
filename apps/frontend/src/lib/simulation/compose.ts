import type { CanvasElement, SimulationStep } from "@/lib/types";

/*
 * A small toolkit for authoring simulations with exact geometry. Coordinates are canvas
 * percentages (0-100). Boxes are positioned by their top-left corner, nodes by their centre.
 * Connectors reference shapes by id, so the renderer attaches them to the shapes' outlines.
 */

export const C = {
  cyan: "#00D4FF",
  violet: "#8B5CF6",
  signal: "#FF6B35",
  mint: "#22C55E",
  amber: "#FACC15",
  muted: "#334155",
  slate: "#64748B",
  ink: "#1E293B",
  sky: "#38BDF8"
} as const;

type Anim = { type?: string; duration?: number; delay?: number; target_x?: number; target_y?: number };

function anim(delay = 0, type = "fade_in", duration = 600, extra: Partial<Anim> = {}): Anim {
  return { type, duration, delay, ...extra };
}

export function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  options: { color?: string; delay?: number; animation?: string; duration?: number } = {}
): CanvasElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: w,
    height: h,
    label,
    color: options.color ?? C.cyan,
    animation: anim(options.delay ?? 0, options.animation ?? "fade_in", options.duration ?? 600)
  };
}

export function node(
  id: string,
  cx: number,
  cy: number,
  r: number,
  label: string,
  options: { color?: string; delay?: number; animation?: string } = {}
): CanvasElement {
  return {
    id,
    type: "circle",
    x: cx,
    y: cy,
    radius: r,
    width: r * 2,
    height: r * 2,
    label,
    color: options.color ?? C.cyan,
    animation: anim(options.delay ?? 0, options.animation ?? "scale_up", 500)
  };
}

export function link(
  from: string,
  to: string,
  options: { label?: string; color?: string; delay?: number; arrow?: boolean; dashed?: boolean; curved?: boolean } = {}
): CanvasElement {
  const type = options.curved ? "curved_arrow" : options.dashed ? "dashed_line" : options.arrow === false ? "line" : "arrow";
  return {
    type,
    from,
    to,
    label: options.label ?? "",
    color: options.color ?? C.slate,
    thickness: 2,
    animation: anim(options.delay ?? 0, "draw", 700)
  };
}

/** A connector placed by coordinates and excluded from anchoring (e.g. sequence-diagram messages). */
export function arrowAt(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: { label?: string; color?: string; delay?: number; dashed?: boolean; plain?: boolean } = {}
): CanvasElement {
  return {
    type: options.dashed ? "dashed_line" : options.plain ? "line" : "arrow",
    anchor: false,
    x1,
    y1,
    x2,
    y2,
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    label: options.label ?? "",
    color: options.color ?? C.slate,
    thickness: 2,
    animation: anim(options.delay ?? 0, "draw", 800)
  };
}

export function caption(text: string, options: { x?: number; y?: number; w?: number; color?: string; delay?: number } = {}): CanvasElement {
  return {
    type: "text",
    x: options.x ?? 5,
    y: options.y ?? 7,
    width: options.w ?? 60,
    height: 6,
    label: text,
    color: options.color ?? C.slate,
    label_position: "right",
    animation: anim(options.delay ?? 0, "fade_in", 500)
  };
}

export function group(x: number, y: number, w: number, h: number, options: { color?: string; delay?: number } = {}): CanvasElement {
  return {
    type: "highlight_box",
    x,
    y,
    width: w,
    height: h,
    color: options.color ?? C.amber,
    animation: anim(options.delay ?? 0, "fade_in", 500)
  };
}

/** A row of equal cells centred horizontally. Returns the elements and each cell's id and centre. */
export function cellRow(
  prefix: string,
  values: Array<string | number>,
  options: { y: number; h?: number; maxW?: number; gap?: number; colors?: (i: number) => string; delay?: (i: number) => number } = { y: 40 }
): { elements: CanvasElement[]; ids: string[]; centers: number[]; width: number } {
  const n = values.length;
  const gap = options.gap ?? 1.5;
  const w = Math.min(options.maxW ?? 9, (86 - gap * (n - 1)) / n);
  const start = (100 - (n * w + (n - 1) * gap)) / 2;
  const ids: string[] = [];
  const centers: number[] = [];
  const elements = values.map((value, i) => {
    const id = `${prefix}${i}`;
    ids.push(id);
    const x = start + i * (w + gap);
    centers.push(x + w / 2);
    return box(id, x, options.y, w, options.h ?? 14, String(value), {
      color: options.colors?.(i) ?? C.cyan,
      delay: options.delay?.(i) ?? i * 80
    });
  });
  return { elements, ids, centers, width: w };
}

export function step(n: number, concept: string, subtitle: string, elements: CanvasElement[]): SimulationStep {
  return { step: n, concept, subtitle, canvas_instructions: { elements } };
}

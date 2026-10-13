import "dotenv/config";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  assertAuthConfigured,
  authMiddleware,
  AuthenticatedRequest,
  createToken,
  hashPassword,
  saveSession,
  verifyPassword
} from "./auth.js";
import {
  addHistory,
  createUser,
  deleteExpiredSessions,
  deleteHistoryByTopic,
  ensurePreferences,
  findUserByEmail,
  getCachedSimulation,
  initDb,
  inTransaction,
  insertProgressIfMissing,
  listHistory,
  listProgress,
  getPreferences,
  pruneSimulationCache,
  putCachedSimulation,
  touchLastLogin,
  upsertPreferences,
  upsertProgress
} from "./db.js";
import { generateJson, generateText, isLlmConfigured } from "./llm.js";
import {
  buildChatPrompt,
  buildChatSystemPrompt,
  buildElementPrompt,
  buildImproveStepPrompt,
  buildOutlinePrompt,
  buildVoiceActionPrompt,
  ELEMENT_SYSTEM_PROMPT,
  OUTLINE_SCHEMA,
  OUTLINE_SYSTEM_PROMPT,
  OutlineStep,
  VOICE_ACTION_SCHEMA,
  VOICE_ACTION_SYSTEM_PROMPT
} from "./prompts.js";
import { LEVELS, PROBLEM_SETS, TOPICS } from "./seed.js";
import {
  DifficultyLevel,
  InteractionRecord,
  ProblemSet,
  ProgressRecord,
  Topic,
  UserPreferences,
  VoiceSettings
} from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() ?? "";
const GEMINI_BASE_URL = (
  process.env.GEMINI_BASE_URL?.trim() ?? "https://generativelanguage.googleapis.com/v1beta"
).replace(/\/$/, "");
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 30000);
const configuredOrigins = [
  process.env.FRONTEND_ORIGINS ?? "",
  process.env.ALLOWED_ORIGINS ?? "",
  process.env.CORS_ORIGIN ?? ""
]
  .join(",")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  "https://interactive-tech-tutor.vercel.app",
  "https://master.d3kfpuqsbfsujm.amplifyapp.com",
  "https://*.amplifyapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  ...configuredOrigins
]);
const wildcardOriginRegexes = Array.from(allowedOrigins)
  .filter((origin) => origin.includes("*"))
  .map((origin) => {
    const escaped = origin.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^.]+");
    return new RegExp(`^${escaped}$`, "i");
  });

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.has(origin)) {
    return true;
  }
  return wildcardOriginRegexes.some((pattern) => pattern.test(origin));
}
const CACHE_VERSION = process.env.CACHE_VERSION?.trim() || "3";
const SIMULATION_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const SIMULATION_CACHE_SCHEMA_VERSION = `canvas-json-v4::v${CACHE_VERSION}`;
// Persistent (SQLite) cache survives restarts and scale-to-zero; the in-memory layer is a hot copy.
const SIMULATION_PERSISTED_TTL_MS = 1000 * 60 * 60 * Number(process.env.SIMULATION_CACHE_TTL_HOURS ?? 168);
const simulationResponseCache = new Map<
  string,
  {
    cachedAt: number;
    payload: {
      topic: Topic;
      problemSets: ProblemSet[];
      openingMessage: string;
      generationSource: "template" | "ai";
      explanation_script: string;
      simulation_steps: unknown[];
    };
  }
>();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS.`));
    }
  })
);
app.use(express.json({ limit: "4mb" }));

function asyncHandler(
  handler: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

async function appendHistorySafely(interaction: InteractionRecord): Promise<void> {
  if (!addHistory(interaction)) {
    console.warn("[History] Skipping write because user no longer exists in database.");
  }
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().email(),
  password: z.string().min(8)
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const progressUpdateSchema = z.object({
  topicId: z.string().min(1),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  status: z.enum(["not-started", "in-progress", "completed"]),
  score: z.number().min(0).max(100).default(0),
  timeSpent: z.number().min(0).default(0)
});

const interactionSchema = z.object({
  topicId: z.string().min(1),
  type: z.enum(["voice", "text", "action", "visual"]),
  input: z.string().min(1),
  output: z.string().min(1),
  meta: z.record(z.unknown()).default({})
});

const voiceSettingsSchema = z.object({
  narrationEnabled: z.boolean(),
  interactionEnabled: z.boolean(),
  navigationEnabled: z.boolean(),
  rate: z.number().min(0.5).max(2),
  voiceName: z.string().default("")
});

const preferenceSchema = z.object({
  interactionMode: z.enum(["voice", "click", "both"]),
  voiceSettings: voiceSettingsSchema
});

const simulationGenerateSchema = z.object({
  topic: z.string().min(2).max(120),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner")
});

const vec3Schema = z.object({
  x: z.number().min(-30).max(30),
  y: z.number().min(-30).max(30),
  z: z.number().min(-30).max(30)
});

const simObjectSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["box", "sphere", "cylinder", "cone", "torus", "plane", "line", "arrow", "text"]),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
  size: vec3Schema,
  position: vec3Schema,
  rotation: vec3Schema.optional(),
  label: z.string().max(80).optional()
});

const simMovementSchema = z.object({
  objectId: z.string().min(1).max(40),
  type: z.enum(["translate", "rotate", "scale", "pulse"]),
  to: vec3Schema.optional(),
  axis: vec3Schema.optional(),
  durationMs: z.number().positive().max(30000).default(2200),
  repeat: z.number().int().min(0).max(20).default(0)
});

const simLabelSchema = z.object({
  text: z.string().min(1).max(180),
  objectId: z.string().min(1).max(40).optional(),
  position: vec3Schema.optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional()
});

const simConnectionSchema = z.object({
  fromId: z.string().min(1).max(40),
  toId: z.string().min(1).max(40),
  type: z.enum(["line", "arrow", "dashed"]).default("line"),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  label: z.string().min(1).max(120).optional()
});

const simMathExpressionSchema = z.object({
  expression: z.string().min(1).max(180),
  variables: z.record(z.number()).default({})
});

const simGraphSchema = z.object({
  type: z.enum(["line", "scatter", "bar"]),
  title: z.string().min(1).max(120),
  x: z.array(z.number()).min(2).max(120),
  y: z.array(z.number()).min(2).max(120)
});

const simStepSchema = z.object({
  step: z.number().int().min(1).max(20),
  concept: z.string().min(3).max(180).optional(),
  objects: z.array(simObjectSchema).min(1).max(24),
  movements: z.array(simMovementSchema).max(40).default([]),
  labels: z.array(simLabelSchema).max(24).default([]),
  connections: z.array(simConnectionSchema).max(40).default([]),
  annotation: z.string().min(8).max(300),
  mathExpressions: z.array(simMathExpressionSchema).max(10).optional(),
  graph: simGraphSchema.optional()
});

const generatedProblemSchema = z.object({
  question: z.string().min(10).max(700),
  choices: z.array(z.string().min(1).max(260)).min(2).max(10),
  answer: z.string().min(1).max(260),
  explanation: z.string().min(10).max(700)
});

const generatedProblemSetSchema = z.object({
  level: z.enum(["beginner", "intermediate", "advanced"]),
  passingScore: z.number().min(60).max(95),
  problems: z.array(generatedProblemSchema).min(1).max(12)
});

const generatedProblemSetsSchema = z.array(generatedProblemSetSchema).min(3).max(12);

const simCanvasAnimationTypeSchema = z.enum([
  "fade_in",
  "fade_out",
  "move",
  "swap",
  "draw",
  "pulse",
  "rotate",
  "scale_up",
  "scale_down",
  "scale",
  "highlight",
  "bounce",
  "follow_path",
  "typewriter",
  "none"
]);

const simCanvasAnimationSchema = z.object({
  type: simCanvasAnimationTypeSchema,
  duration: z.number().int().min(100).max(10000).default(900),
  delay: z.number().int().min(0).max(60000).optional(),
  direction: z.string().min(1).max(80).default("none"),
  represents: z.string().min(3).max(240).default("animation step")
}).passthrough();

const simCanvasElementTypeSchema = z.enum([
  "rectangle",
  "circle",
  "ellipse",
  "triangle",
  "arrow",
  "curved_arrow",
  "curved arrow",
  "line",
  "dashed_line",
  "dashed line",
  "text",
  "path",
  "polygon",
  "grid",
  "axis",
  "plot_point",
  "plot point",
  "wave",
  "pulse",
  "highlight_box",
  "highlight box"
  ,
  "bar",
  "matrix",
  "number_line",
  "table",
  "stack",
  "queue",
  "flowchart_diamond",
  "neural_layer",
  "neural_network",
  "neural network",
  "tree_node"
]);

const simCanvasElementSchema = z.object({
  type: simCanvasElementTypeSchema,
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  x1: z.number().min(0).max(100).optional(),
  y1: z.number().min(0).max(100).optional(),
  x2: z.number().min(0).max(100).optional(),
  y2: z.number().min(0).max(100).optional(),
  cx: z.number().min(0).max(100).optional(),
  cy: z.number().min(0).max(100).optional(),
  width: z.number().min(0).max(100).optional(),
  height: z.number().min(0).max(100).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  label: z.string().min(1).max(180).optional(),
  label_position: z.enum(["above", "below", "left", "right"]).optional(),
  animation: simCanvasAnimationSchema.optional()
}).passthrough();

const simCanvasStepSchema = z.object({
  step: z.number().int().min(1).max(120),
  concept: z.string().min(1).max(220),
  subtitle: z.string().min(1).max(1200),
  duration_ms: z.number().int().min(12000).max(35000).optional(),
  canvas_instructions: z.object({
    elements: z.array(simCanvasElementSchema).min(1).max(240)
  })
});

const llmSimulationSchema = z.object({
  steps: z.array(simCanvasStepSchema).min(1).max(120)
});

type GeminiSimulationPayload = {
  steps: z.infer<typeof simCanvasStepSchema>[];
};

type SimStep = z.infer<typeof simStepSchema>;
type GeminiCanvasStep = z.infer<typeof simCanvasStepSchema>;
type GeminiCanvasElement = z.infer<typeof simCanvasElementSchema>;
type CanvasElementType = z.infer<typeof simCanvasElementTypeSchema>;
type CanvasAnimationType = z.infer<typeof simCanvasAnimationTypeSchema>;
type SimObject = z.infer<typeof simObjectSchema>;
type SimConnection = z.infer<typeof simConnectionSchema>;
type SceneLayout = "pipeline" | "tree" | "layered" | "hub" | "timeline";
type TechDomain =
  | "web"
  | "data"
  | "ml"
  | "network"
  | "systems"
  | "security"
  | "cloud"
  | "algorithms"
  | "hardware"
  | "general";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function detectVisualTheme(input: string): string {
  const topic = input.toLowerCase();
  if (topic.includes("sql") || topic.includes("database") || topic.includes("data")) {
    return "database";
  }
  if (topic.includes("react") || topic.includes("ui") || topic.includes("frontend")) {
    return "ui";
  }
  if (topic.includes("http") || topic.includes("network") || topic.includes("api")) {
    return "network";
  }
  if (topic.includes("ai") || topic.includes("model") || topic.includes("ml")) {
    return "ai";
  }
  return "systems";
}

function narrationDepth(level: DifficultyLevel): string {
  if (level === "beginner") {
    return "fundamental flow";
  }
  if (level === "intermediate") {
    return "key internal mechanisms";
  }
  return "tradeoffs, edge cases, and optimization strategy";
}

function buildGeneratedTopic(rawTopic: string, level: DifficultyLevel): Topic {
  const cleanedTopic = rawTopic.trim();
  const description = `Model-generated simulation for ${cleanedTopic}, focused on ${narrationDepth(level)}.`;
  const narration = [
    `We are simulating ${cleanedTopic} as a step-by-step system.`,
    `First, identify the input and starting state for ${cleanedTopic}.`,
    `Next, observe each transition and how decisions change outcomes in real time.`,
    `Now verify the output, then compare this run against an alternative approach.`,
    `As you drag and scroll, the tutor evaluates your operations and gives corrective feedback.`
  ];
  return {
    id: `custom-${Date.now()}-${slugify(cleanedTopic) || "topic"}`,
    title: cleanedTopic,
    description,
    narration,
    visualTheme: detectVisualTheme(cleanedTopic)
  };
}

function buildGeneratedProblemSets(topic: Topic): ProblemSet[] {
  const title = topic.title;
  return [
    {
      topicId: topic.id,
      level: "beginner",
      passingScore: 70,
      problems: [
        {
          id: `${topic.id}-b-1`,
          question: `Which statement best describes the first step when learning ${title}?`,
          choices: [
            "Define inputs and the initial state",
            "Tune low-level optimizations immediately",
            "Skip system flow and focus only on syntax",
            "Start with final output and ignore transitions"
          ],
          answer: "Define inputs and the initial state",
          explanation: "A clear starting state is required before meaningful simulation analysis."
        }
      ]
    },
    {
      topicId: topic.id,
      level: "intermediate",
      passingScore: 75,
      problems: [
        {
          id: `${topic.id}-i-1`,
          question: `During a simulation of ${title}, what should be tracked at each step?`,
          choices: [
            "Only visual colors",
            "State transitions and decision points",
            "Only execution end time",
            "Unrelated external tools"
          ],
          answer: "State transitions and decision points",
          explanation: "Intermediate understanding depends on seeing why each transition happened."
        }
      ]
    },
    {
      topicId: topic.id,
      level: "advanced",
      passingScore: 80,
      problems: [
        {
          id: `${topic.id}-a-1`,
          question: `What is the best advanced review pattern for ${title}?`,
          choices: [
            "Memorize one path only",
            "Ignore tradeoffs for speed",
            "Compare multiple strategies and justify tradeoffs",
            "Avoid validating outcomes"
          ],
          answer: "Compare multiple strategies and justify tradeoffs",
          explanation: "Advanced mastery requires explicit tradeoff reasoning under different conditions."
        }
      ]
    }
  ];
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (_error) {
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? trimmed;
    const firstBrace = fenced.indexOf("{");
    const lastBrace = fenced.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Model did not return valid JSON.");
    }
    return JSON.parse(fenced.slice(firstBrace, lastBrace + 1)) as unknown;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 100);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", "").trim());
    if (Number.isFinite(parsed)) {
      return clamp(parsed, 0, 100);
    }
  }
  return clamp(fallback, 0, 100);
}

function toDurationMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(Math.round(value), 100, 10000);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return clamp(Math.round(parsed), 100, 10000);
    }
  }
  return clamp(Math.round(fallback), 100, 10000);
}

const NAMED_COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#8b5cf6",
  pink: "#ec4899",
  cyan: "#06b6d4",
  white: "#ffffff",
  black: "#111827",
  gray: "#9ca3af",
  grey: "#9ca3af"
};

function normalizeHexColor(value: unknown, fallback: string): string {
  const text = asText(value).toLowerCase();
  if (!text) {
    return fallback;
  }
  if (/^#[0-9a-f]{6}$/.test(text)) {
    return text;
  }
  if (/^#[0-9a-f]{3}$/.test(text)) {
    const expanded = text
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
    return `#${expanded}`;
  }
  if (text in NAMED_COLOR_MAP) {
    return NAMED_COLOR_MAP[text];
  }
  return fallback;
}

function normalizeLabelPosition(value: unknown): "above" | "below" | "left" | "right" {
  const normalized = asText(value).toLowerCase();
  if (normalized === "below" || normalized === "left" || normalized === "right") {
    return normalized;
  }
  return "above";
}

const ELEMENT_TYPE_ALIASES: Record<string, CanvasElementType> = {
  rectangle: "rectangle",
  rect: "rectangle",
  box: "rectangle",
  square: "rectangle",
  circle: "circle",
  node: "circle",
  ellipse: "ellipse",
  oval: "ellipse",
  triangle: "triangle",
  arrow: "arrow",
  "curved arrow": "curved_arrow",
  "curved-arrow": "curved_arrow",
  curved_arrow: "curved_arrow",
  line: "line",
  "dashed line": "dashed_line",
  "dashed-line": "dashed_line",
  dashed_line: "dashed_line",
  text: "text",
  label: "text",
  path: "path",
  polygon: "polygon",
  grid: "grid",
  axis: "axis",
  axes: "axis",
  "plot point": "plot_point",
  "plot-point": "plot_point",
  plot_point: "plot_point",
  point: "plot_point",
  wave: "wave",
  pulse: "pulse",
  "highlight box": "highlight_box",
  "highlight-box": "highlight_box",
  highlight_box: "highlight_box",
  bar: "bar",
  matrix: "matrix",
  number_line: "number_line",
  "number line": "number_line",
  table: "table",
  stack: "stack",
  queue: "queue",
  flowchart_diamond: "flowchart_diamond",
  "flowchart diamond": "flowchart_diamond",
  neural_layer: "neural_layer",
  "neural layer": "neural_layer",
  tree_node: "tree_node",
  "tree node": "tree_node"
};

function normalizeElementType(value: unknown): CanvasElementType {
  const normalized = asText(value).toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized in ELEMENT_TYPE_ALIASES) {
    return ELEMENT_TYPE_ALIASES[normalized];
  }
  return "rectangle";
}

const ANIMATION_TYPE_ALIASES: Record<string, CanvasAnimationType> = {
  fade_in: "fade_in",
  fade_out: "fade_out",
  fadein: "fade_in",
  move: "move",
  draw: "draw",
  pulse: "pulse",
  rotate: "rotate",
  spin: "rotate",
  scale_up: "scale_up",
  scale_down: "scale_down",
  scale: "scale",
  highlight: "highlight",
  bounce: "bounce",
  follow_path: "follow_path",
  typewriter: "typewriter",
  none: "none"
};

function normalizeAnimationType(value: unknown): CanvasAnimationType {
  const normalized = asText(value).toLowerCase().replace(/\s+/g, "_");
  if (normalized in ANIMATION_TYPE_ALIASES) {
    return ANIMATION_TYPE_ALIASES[normalized];
  }
  return "none";
}

function defaultElementSize(type: CanvasElementType): { width: number; height: number } {
  if (type === "line" || type === "dashed_line" || type === "arrow" || type === "curved_arrow") {
    return { width: 18, height: 2 };
  }
  if (type === "text") {
    return { width: 24, height: 4 };
  }
  if (type === "axis" || type === "path" || type === "wave") {
    return { width: 26, height: 8 };
  }
  if (type === "grid") {
    return { width: 38, height: 28 };
  }
  if (type === "plot point" || type === "pulse") {
    return { width: 4, height: 4 };
  }
  return { width: 12, height: 10 };
}

function parseNumericValueFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = asText(value);
  if (!text) {
    return null;
  }
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericValueToLabel(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(3)));
}

function deriveNumericElementLabel(raw: Record<string, unknown>): string {
  const candidates = [raw.value, raw.val, raw.number, raw.data_value, raw.dataValue, raw.label, raw.text];
  for (const candidate of candidates) {
    const parsed = parseNumericValueFromUnknown(candidate);
    if (parsed !== null) {
      return numericValueToLabel(parsed);
    }
  }
  return "";
}

function normalizeCanvasElement(
  candidate: unknown,
  index: number,
  fallbackText: string
): GeminiCanvasElement | null {
  if (typeof candidate === "string") {
    const label = candidate.trim().slice(0, 180);
    if (!label) {
      return null;
    }
    return {
      type: "text",
      x: 50,
      y: clamp(20 + index * 8, 8, 92),
      width: 30,
      height: 4,
      color: "#00d4ff",
      label,
      label_position: "above",
      animation: {
        type: "fade_in",
        duration: 800,
        direction: "none",
        represents: fallbackText.slice(0, 240)
      }
    };
  }

  const raw = asObject(candidate);
  if (!raw) {
    return null;
  }

  const type = normalizeElementType(raw.type);
  const sizeDefaults = defaultElementSize(type);
  const numericLabel = deriveNumericElementLabel(raw);
  const connectorTypes = new Set<CanvasElementType>(["arrow", "line", "dashed_line", "curved_arrow"]);
  const sourceLabel = asText(raw.label) || asText(raw.text) || asText(raw.name);
  let label = sourceLabel.trim();
  if (!label && (type === "tree_node" || type === "bar")) {
    label = numericLabel;
  }
  if (!label && connectorTypes.has(type)) {
    label = "";
  }
  const safeLabel = label.trim().slice(0, 180);
  const rawAnimation = asObject(raw.animation) ?? {};
  const animationType = normalizeAnimationType(rawAnimation.type);
  const animationDirection = asText(rawAnimation.direction) || "none";
  const animationRepresents =
    asText(rawAnimation.represents) ||
    asText(rawAnimation.description) ||
    `${safeLabel || type.replace(/_/g, " ")} appearing to explain ${fallbackText}`.slice(0, 240);
  const passthrough = { ...raw };
  delete passthrough.type;
  delete passthrough.x;
  delete passthrough.y;
  delete passthrough.width;
  delete passthrough.height;
  delete passthrough.color;
  delete passthrough.label;
  delete passthrough.label_position;
  delete passthrough.animation;

  return {
    ...passthrough,
    type,
    x: toPercent(raw.x ?? raw.cx ?? raw.left, 50),
    y: toPercent(raw.y ?? raw.cy ?? raw.top, 50),
    x1: raw.x1 !== undefined ? toPercent(raw.x1, 50) : undefined,
    y1: raw.y1 !== undefined ? toPercent(raw.y1, 50) : undefined,
    x2: raw.x2 !== undefined ? toPercent(raw.x2, 50) : undefined,
    y2: raw.y2 !== undefined ? toPercent(raw.y2, 50) : undefined,
    cx: raw.cx !== undefined ? toPercent(raw.cx, 50) : undefined,
    cy: raw.cy !== undefined ? toPercent(raw.cy, 50) : undefined,
    width: toPercent(raw.width ?? raw.w, sizeDefaults.width),
    height: toPercent(raw.height ?? raw.h, sizeDefaults.height),
    color: normalizeHexColor(raw.color, "#00d4ff"),
    ...(safeLabel ? { label: safeLabel } : {}),
    label_position: normalizeLabelPosition(raw.label_position ?? raw.labelPosition),
    animation: {
      ...rawAnimation,
      type: animationType,
      duration: toDurationMs(rawAnimation.duration, 1000),
      direction: animationDirection.slice(0, 80),
      represents: animationRepresents.slice(0, 240)
    }
  };
}

function extractStepCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const root = asObject(payload);
  if (!root) {
    return [];
  }
  const direct = root.steps ?? root.simulation_steps ?? root.simulationSteps ?? root.data;
  if (Array.isArray(direct)) {
    return direct;
  }
  const directObject = asObject(direct);
  if (directObject && Array.isArray(directObject.steps)) {
    return directObject.steps;
  }
  if (Array.isArray(root.plan)) {
    return root.plan;
  }
  const planObject = asObject(root.plan);
  if (planObject && Array.isArray(planObject.steps)) {
    return planObject.steps;
  }
  if (typeof root.step === "number") {
    return [root];
  }
  return [];
}

function normalizeCanvasStep(candidate: unknown, index: number): GeminiCanvasStep | null {
  const raw = asObject(candidate);
  if (!raw) {
    return null;
  }

  const stepValue = Number.parseInt(asText(raw.step), 10);
  const step = Number.isFinite(stepValue) ? clamp(stepValue, 1, 120) : clamp(index + 1, 1, 120);
  const concept = (asText(raw.concept) || asText(raw.title) || `Step ${step}`).slice(0, 220);
  const subtitle = (
    asText(raw.subtitle) ||
    asText(raw.annotation) ||
    asText(raw.explanation) ||
    `Explaining ${concept}.`
  ).slice(0, 1200);
  const durationRaw = Number(raw.duration_ms ?? raw.durationMs);
  const duration_ms =
    Number.isFinite(durationRaw) && durationRaw >= 12000 && durationRaw <= 35000
      ? Math.round(durationRaw)
      : undefined;

  const canvasInstructions = asObject(raw.canvas_instructions) ?? asObject(raw.canvasInstructions);
  const elementsSource =
    (canvasInstructions && Array.isArray(canvasInstructions.elements) ? canvasInstructions.elements : null) ??
    (Array.isArray(raw.elements) ? raw.elements : null) ??
    (Array.isArray(raw.objects) ? raw.objects : null) ??
    [];

  const elements = elementsSource
    .map((item, itemIndex) => normalizeCanvasElement(item, itemIndex, subtitle))
    .filter((item): item is GeminiCanvasElement => Boolean(item));

  if (elements.length === 0) {
    const fallback = normalizeCanvasElement(
      {
        type: "text",
        x: 50,
        y: 50,
        width: 34,
        height: 6,
        color: "#8b5cf6",
        label: subtitle.slice(0, 120),
        label_position: "above",
        animation: {
          type: "fade_in",
          duration: 900,
          direction: "none",
          represents: subtitle
        }
      },
      0,
      subtitle
    );
    if (fallback) {
      elements.push(fallback);
    }
  }

  return {
    step,
    concept,
    subtitle,
    ...(duration_ms ? { duration_ms } : {}),
    canvas_instructions: {
      elements
    }
  };
}

function treeNodeNumericValue(element: Record<string, unknown>): number | null {
  const candidates = [element.value, element.label, element.text];
  for (const candidate of candidates) {
    const parsed = Number.parseFloat(asText(candidate));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseTreeHintsFromSubtitle(subtitle: string): {
  explicitChildren: Map<number, Set<number>>;
  parentsClaimingTwoChildren: Set<number>;
} {
  const explicitChildren = new Map<number, Set<number>>();
  const parentsClaimingTwoChildren = new Set<number>();
  const addChildHint = (parent: number, child: number) => {
    if (!Number.isFinite(parent) || !Number.isFinite(child) || parent === child) {
      return;
    }
    if (!explicitChildren.has(parent)) {
      explicitChildren.set(parent, new Set<number>());
    }
    explicitChildren.get(parent)?.add(child);
  };

  let match: RegExpExecArray | null = null;
  const childrenOfPattern = /children\s+of\s+(-?\d+(?:\.\d+)?)\s+are\s+(-?\d+(?:\.\d+)?)\s*(?:,|and)\s*(-?\d+(?:\.\d+)?)/gi;
  while ((match = childrenOfPattern.exec(subtitle)) !== null) {
    const parent = Number.parseFloat(match[1]);
    const left = Number.parseFloat(match[2]);
    const right = Number.parseFloat(match[3]);
    if (Number.isFinite(parent)) {
      parentsClaimingTwoChildren.add(parent);
    }
    addChildHint(parent, left);
    addChildHint(parent, right);
  }

  const twoChildrenPattern = /(?:node\s+)?(-?\d+(?:\.\d+)?)\s+has\s+two\s+children(?:\s*[:\-]?\s*(-?\d+(?:\.\d+)?)\s*(?:,|and)\s*(-?\d+(?:\.\d+)?))?/gi;
  while ((match = twoChildrenPattern.exec(subtitle)) !== null) {
    const parent = Number.parseFloat(match[1]);
    if (Number.isFinite(parent)) {
      parentsClaimingTwoChildren.add(parent);
    }
    if (match[2] && match[3]) {
      addChildHint(parent, Number.parseFloat(match[2]));
      addChildHint(parent, Number.parseFloat(match[3]));
    }
  }

  const sideChildPattern = /(?:left|right)\s+child\s+of\s+(-?\d+(?:\.\d+)?)\s+is\s+(-?\d+(?:\.\d+)?)/gi;
  while ((match = sideChildPattern.exec(subtitle)) !== null) {
    addChildHint(Number.parseFloat(match[1]), Number.parseFloat(match[2]));
  }

  return { explicitChildren, parentsClaimingTwoChildren };
}

function ensureTreeNodeElement(
  treeElements: Array<Record<string, unknown>>,
  value: number,
  parentValue: number | null
): Record<string, unknown> {
  const existing = treeElements.find((element) => treeNodeNumericValue(element) === value);
  if (existing) {
    if (parentValue !== null && parentValue !== value) {
      existing.parent_value = parentValue;
    }
    if (!asText(existing.label)) {
      existing.label = String(value);
    }
    if (treeNodeNumericValue(existing) === null) {
      existing.value = value;
    }
    return existing;
  }

  const node: Record<string, unknown> = {
    type: "tree_node",
    value,
    label: String(value),
    x: 50,
    y: 50,
    width: 10,
    height: 10,
    color: "#4A90E2",
    label_position: "above",
    parent_value: parentValue
  };
  treeElements.push(node);
  return node;
}

function validateBstByParentLinks(treeElements: Array<Record<string, unknown>>): boolean {
  const nodeByValue = new Map<number, { value: number; left: number | null; right: number | null }>();
  for (const element of treeElements) {
    const value = treeNodeNumericValue(element);
    if (value === null || nodeByValue.has(value)) {
      continue;
    }
    nodeByValue.set(value, { value, left: null, right: null });
  }
  if (nodeByValue.size === 0) {
    return true;
  }

  const hasParent = new Set<number>();
  for (const element of treeElements) {
    const value = treeNodeNumericValue(element);
    if (value === null) {
      continue;
    }
    const parentValueParsed = Number.parseFloat(asText(element.parent_value));
    if (!Number.isFinite(parentValueParsed)) {
      continue;
    }
    const parentValue = parentValueParsed;
    const parent = nodeByValue.get(parentValue);
    const node = nodeByValue.get(value);
    if (!parent || !node || value === parentValue) {
      return false;
    }
    if (value < parentValue) {
      if (parent.left !== null && parent.left !== value) {
        return false;
      }
      parent.left = value;
    } else if (value > parentValue) {
      if (parent.right !== null && parent.right !== value) {
        return false;
      }
      parent.right = value;
    } else {
      return false;
    }
    hasParent.add(value);
  }

  const roots = Array.from(nodeByValue.keys()).filter((value) => !hasParent.has(value));
  if (roots.length === 0) {
    return false;
  }

  const visited = new Set<number>();
  const dfs = (value: number, min: number, max: number): boolean => {
    if (!Number.isFinite(value) || value <= min || value >= max) {
      return false;
    }
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    const node = nodeByValue.get(value);
    if (!node) {
      return false;
    }
    if (node.left !== null && !dfs(node.left, min, value)) {
      return false;
    }
    if (node.right !== null && !dfs(node.right, value, max)) {
      return false;
    }
    return true;
  };

  for (const root of roots) {
    if (!dfs(root, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)) {
      return false;
    }
  }
  return true;
}

function rebuildBstParentLinks(treeElements: Array<Record<string, unknown>>): void {
  const orderedValues: number[] = [];
  const elementByValue = new Map<number, Record<string, unknown>>();
  for (const element of treeElements) {
    const value = treeNodeNumericValue(element);
    if (value === null || elementByValue.has(value)) {
      continue;
    }
    orderedValues.push(value);
    elementByValue.set(value, element);
  }
  if (orderedValues.length === 0) {
    return;
  }

  type BstNode = { value: number; left: BstNode | null; right: BstNode | null };
  let root: BstNode | null = null;
  const parentByValue = new Map<number, number | null>();

  for (const value of orderedValues) {
    if (!root) {
      root = { value, left: null, right: null };
      parentByValue.set(value, null);
      continue;
    }

    let current: BstNode | null = root;
    let parent: BstNode | null = null;
    while (current) {
      parent = current;
      if (value < current.value) {
        current = current.left;
      } else if (value > current.value) {
        current = current.right;
      } else {
        parent = null;
        break;
      }
    }

    if (!parent) {
      continue;
    }
    const nextNode: BstNode = { value, left: null, right: null };
    if (value < parent.value) {
      parent.left = nextNode;
    } else {
      parent.right = nextNode;
    }
    parentByValue.set(value, parent.value);
  }

  for (const [value, element] of elementByValue.entries()) {
    element.value = value;
    element.label = asText(element.label) || String(value);
    element.parent_value = parentByValue.get(value) ?? null;
  }
}

function isBstTopic(topic: string): boolean {
  return /(binary search tree|\bbst\b)/i.test(topic);
}

function replaceBstPlaceholderTextWithTreeNodes(step: GeminiCanvasStep): GeminiCanvasStep {
  const elements = step.canvas_instructions.elements.map((element) => ({ ...(element as Record<string, unknown>) }));
  const usedValues = new Set<number>();
  for (const element of elements) {
    const type = asText(element.type).toLowerCase().replace(/\s+/g, "_");
    if (type !== "tree_node") {
      continue;
    }
    const value = treeNodeNumericValue(element);
    if (value !== null) {
      usedValues.add(value);
    }
  }

  let fallbackValue = usedValues.size > 0 ? Math.max(...Array.from(usedValues)) + 1 : 10;
  const nextFallbackValue = (): number => {
    while (usedValues.has(fallbackValue)) {
      fallbackValue += 1;
    }
    const chosen = fallbackValue;
    usedValues.add(chosen);
    fallbackValue += 1;
    return chosen;
  };

  const normalizedElements = elements.map((element) => {
    const type = asText(element.type).toLowerCase().replace(/\s+/g, "_");
    const label = asText(element.label) || asText(element.text);
    if (type !== "text" || !/subtree|left child|right child|root node/i.test(label)) {
      return element;
    }

    const numericMatch = label.match(/-?\d+(?:\.\d+)?/);
    const parsedValue = numericMatch ? Number.parseFloat(numericMatch[0]) : Number.NaN;
    let value = Number.isFinite(parsedValue) ? parsedValue : nextFallbackValue();
    if (!Number.isFinite(value)) {
      value = nextFallbackValue();
    }
    if (usedValues.has(value)) {
      value = nextFallbackValue();
    } else {
      usedValues.add(value);
    }

    const labelLower = label.toLowerCase();
    const xFromElement = Number(element.x);
    const yFromElement = Number(element.y);
    const inferredX = labelLower.includes("left")
      ? 25
      : labelLower.includes("right")
        ? 75
        : labelLower.includes("root")
          ? 50
          : 50;
    const inferredY = labelLower.includes("root") ? 12 : 30;

    return {
      ...element,
      type: "tree_node",
      value,
      label: String(value),
      x: Number.isFinite(xFromElement) ? clamp(xFromElement, 0, 100) : inferredX,
      y: Number.isFinite(yFromElement) ? clamp(yFromElement, 0, 100) : inferredY,
      color: normalizeHexColor(asText(element.color), "#4A90E2"),
      parent_value: labelLower.includes("root") ? null : element.parent_value ?? null
    } as Record<string, unknown>;
  });

  return {
    ...step,
    canvas_instructions: {
      elements: normalizedElements as GeminiCanvasElement[]
    }
  };
}

function repairBstStep(step: GeminiCanvasStep): GeminiCanvasStep {
  const normalizedStep = replaceBstPlaceholderTextWithTreeNodes(step);
  const elements = normalizedStep.canvas_instructions.elements.map((element) => ({ ...(element as Record<string, unknown>) }));
  const treeElements = elements.filter(
    (element) => asText(element.type).toLowerCase().replace(/\s+/g, "_") === "tree_node"
  );
  if (treeElements.length === 0) {
    return step;
  }

  const { explicitChildren, parentsClaimingTwoChildren } = parseTreeHintsFromSubtitle(step.subtitle);
  for (const [parentValue, childValues] of explicitChildren.entries()) {
    ensureTreeNodeElement(treeElements, parentValue, null);
    for (const childValue of childValues) {
      ensureTreeNodeElement(treeElements, childValue, parentValue);
    }
  }

  rebuildBstParentLinks(treeElements);

  for (const [parentValue, childValues] of explicitChildren.entries()) {
    for (const childValue of childValues) {
      const child = treeElements.find((element) => treeNodeNumericValue(element) === childValue);
      if (child) {
        const previousParent = Number.parseFloat(asText(child.parent_value));
        child.parent_value = parentValue;
        if (!validateBstByParentLinks(treeElements)) {
          child.parent_value = Number.isFinite(previousParent) ? previousParent : null;
        }
      }
    }
  }

  for (const parentValue of parentsClaimingTwoChildren.values()) {
    const currentChildren = treeElements.filter(
      (element) => Number.parseFloat(asText(element.parent_value)) === parentValue
    );
    if (currentChildren.length >= 2) {
      continue;
    }
    const candidateValues = treeElements
      .map((element) => treeNodeNumericValue(element))
      .filter((value): value is number => value !== null && value !== parentValue)
      .sort((a, b) => a - b);
    const leftCandidate = [...candidateValues].reverse().find((value) => value < parentValue) ?? null;
    const rightCandidate = candidateValues.find((value) => value > parentValue) ?? null;
    for (const candidate of [leftCandidate, rightCandidate]) {
      if (candidate === null) {
        continue;
      }
      const child = ensureTreeNodeElement(treeElements, candidate, parentValue);
      const previousParent = Number.parseFloat(asText(child.parent_value));
      child.parent_value = parentValue;
      if (!validateBstByParentLinks(treeElements)) {
        child.parent_value = Number.isFinite(previousParent) ? previousParent : null;
      }
    }
  }

  if (!validateBstByParentLinks(treeElements)) {
    rebuildBstParentLinks(treeElements);
  }

  return {
    ...step,
    canvas_instructions: {
      elements: elements as GeminiCanvasElement[]
    }
  };
}

function validateAndRepairBstSteps(steps: GeminiCanvasStep[]): GeminiCanvasStep[] {
  return steps.map((step) => repairBstStep(step));
}

function repairAxisPlotSteps(steps: GeminiCanvasStep[]): GeminiCanvasStep[] {
  return steps.map((step) => {
    const rawElements = step.canvas_instructions?.elements ?? [];
    const hasAxis = rawElements.some(
      (element) => normalizeElementType((element as Record<string, unknown>).type) === "axis"
    );
    const hasPlotPoint = rawElements.some(
      (element) => normalizeElementType((element as Record<string, unknown>).type) === "plot_point"
    );
    if (!hasAxis || !hasPlotPoint) {
      return step;
    }
    const elements = (step.canvas_instructions?.elements ?? []).map((element) => {
      const next = { ...(element as Record<string, unknown>) };
      const type = normalizeElementType(next.type);
      if (type !== "plot_point") {
        return next as GeminiCanvasElement;
      }
      const x = Number(next.x);
      const y = Number(next.y);
      const width = Number(next.width);
      const height = Number(next.height);
      next.x = clamp(Number.isFinite(x) ? x : 50, 25, 90);
      next.y = clamp(Number.isFinite(y) ? y : 45, 20, 65);
      next.width = Number.isFinite(width) && width > 0 ? Math.min(width, 3) : 3;
      next.height = Number.isFinite(height) && height > 0 ? Math.min(height, 3) : 3;
      return next as GeminiCanvasElement;
    }) as GeminiCanvasElement[];
    return {
      ...step,
      canvas_instructions: {
        elements
      }
    };
  });
}

function repairMatrixGridSteps(steps: GeminiCanvasStep[]): GeminiCanvasStep[] {
  const gridPositions = [
    { x: 30, y: 35 },
    { x: 55, y: 35 },
    { x: 30, y: 58 },
    { x: 55, y: 58 }
  ];
  const defaultLabels = ["TP", "FP", "FN", "TN"];
  const HIGHLIGHT_COLOR = "#22c55e";
  const BASE_COLOR = "#1E3A5F";
  const resolveHighlightIndex = (conceptText: string): number | null => {
    const concept = conceptText.toLowerCase();
    if (/\btrue positive\b|\btp\b/i.test(concept)) {
      return 0;
    }
    if (/\bfalse positive\b|\bfp\b/i.test(concept)) {
      return 1;
    }
    if (/\bfalse negative\b|\bfn\b/i.test(concept)) {
      return 2;
    }
    if (/\btrue negative\b|\btn\b/i.test(concept)) {
      return 3;
    }
    return null;
  };
  const parseMatrixLabel = (label: string): string | null => {
    const normalized = label.toLowerCase().trim();
    if (!normalized) {
      return null;
    }
    if (normalized === "tp" || normalized.includes("true positive")) {
      return "TP";
    }
    if (normalized === "fp" || normalized.includes("false positive")) {
      return "FP";
    }
    if (normalized === "fn" || normalized.includes("false negative")) {
      return "FN";
    }
    if (normalized === "tn" || normalized.includes("true negative")) {
      return "TN";
    }
    return null;
  };

  return steps.map((step) => {
    const elements = (step.canvas_instructions?.elements ?? []).map((element) => ({
      ...(element as Record<string, unknown>)
    }));
    const matrixIndexes = elements
      .map((element, index) => ({ type: normalizeElementType(element.type), index }))
      .filter((item) => item.type === "matrix")
      .map((item) => item.index);
    const rectangleIndexes = elements
      .map((element, index) => ({ type: normalizeElementType(element.type), index }))
      .filter((item) => item.type === "rectangle")
      .map((item) => item.index);

    const highlightIndex = resolveHighlightIndex(asText(step.concept));

    if (matrixIndexes.length > 0) {
      const aiLabels = elements
        .map((element) => parseMatrixLabel(asText(element.label)))
        .filter((label): label is string => Boolean(label));
      const uniqueLabels = Array.from(new Set(aiLabels));
      const labels = defaultLabels.map((fallback, index) => uniqueLabels[index] ?? fallback);
      const aiColors = elements
        .map((element) => normalizeHexColor(asText(element.color), ""))
        .filter((color) => /^#[0-9a-f]{6}$/i.test(color));
      const matrixColor =
        matrixIndexes
          .map((index) => normalizeHexColor(asText(elements[index].color), ""))
          .find((color) => /^#[0-9a-f]{6}$/i.test(color)) ?? "#4A90E2";
      const colors = defaultLabels.map((_, index) => {
        if (highlightIndex !== null) {
          return index === highlightIndex ? HIGHLIGHT_COLOR : BASE_COLOR;
        }
        return aiColors[index] ?? matrixColor;
      });

      const retainedElements = elements.filter(
        (_element, index) => !matrixIndexes.includes(index) && !rectangleIndexes.includes(index)
      );
      const injectedRectangles: GeminiCanvasElement[] = gridPositions.map((position, index) => ({
        type: "rectangle",
        x: position.x,
        y: position.y,
        width: 20,
        height: 18,
        color: colors[index],
        label: labels[index],
        label_position: "above",
        animation: {
          type: "fade_in",
          duration: 800 + index * 80,
          direction: "none",
          represents: `shows confusion matrix quadrant ${labels[index]}`
        }
      }));

      return {
        ...step,
        canvas_instructions: {
          elements: [...retainedElements, ...injectedRectangles] as GeminiCanvasElement[]
        }
      };
    }

    if (rectangleIndexes.length === 0) {
      return step;
    }

    const xs = rectangleIndexes
      .map((index) => Number(elements[index].x))
      .filter((value) => Number.isFinite(value));
    const ys = rectangleIndexes
      .map((index) => Number(elements[index].y))
      .filter((value) => Number.isFinite(value));
    const spreadX = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
    const spreadY = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;
    const scattered = spreadX > 50 || spreadY > 50;

    if (!scattered) {
      return step;
    }

    rectangleIndexes.forEach((elementIndex, idx) => {
      const target = gridPositions[idx % gridPositions.length];
      elements[elementIndex] = {
        ...elements[elementIndex],
        x: target.x,
        y: target.y,
        width: 20,
        height: 18,
        ...(highlightIndex !== null
          ? { color: idx % gridPositions.length === highlightIndex ? HIGHLIGHT_COLOR : BASE_COLOR }
          : {})
      };
    });

    return {
      ...step,
      canvas_instructions: {
        elements: elements as GeminiCanvasElement[]
      }
    };
  });
}

function applyTopicRepairs(topic: string, steps: GeminiCanvasStep[]): GeminiCanvasStep[] {
  const axisPlotRepairedSteps = repairAxisPlotSteps(steps);
  // The 2x2 TP/FP/FN/TN layout is only valid for a confusion matrix. Applying it to any other topic
  // snaps every row of boxes into a 2x2 grid and stacks the fifth box on the first.
  return /confusion\s+matrix/i.test(topic) ? repairMatrixGridSteps(axisPlotRepairedSteps) : axisPlotRepairedSteps;
}

const SUBTITLE_ALIGNMENT_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "by",
  "from",
  "into",
  "through",
  "during",
  "this",
  "that",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
  "as",
  "it",
  "its",
  "at",
  "we",
  "you",
  "your",
  "our",
  "they",
  "their",
  "then",
  "than",
  "also",
  "can",
  "will",
  "step",
  "topic",
  "concept",
  "shows",
  "explains"
]);

function extractSubtitleKeywords(subtitle: string): string[] {
  const words = subtitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !SUBTITLE_ALIGNMENT_STOP_WORDS.has(word));
  return Array.from(new Set(words)).slice(0, 16);
}

function extractSubtitlePhrases(subtitle: string): string[] {
  const chunks = subtitle
    .split(/[.!?;:]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  const phrases: string[] = [];
  for (const chunk of chunks) {
    const words = chunk
      .split(/\s+/)
      .map((word) => word.replace(/[^a-zA-Z0-9_-]/g, ""))
      .filter((word) => word.length > 0);
    if (words.length === 0) {
      continue;
    }
    const meaningful = words.filter((word) => !SUBTITLE_ALIGNMENT_STOP_WORDS.has(word.toLowerCase()));
    const source = meaningful.length >= 2 ? meaningful : words;
    const phrase = source.slice(0, 6).join(" ");
    if (phrase.length > 0) {
      phrases.push(phrase);
    }
  }
  return Array.from(new Set(phrases)).slice(0, 6);
}

function extractSubtitleNumbers(subtitle: string): string[] {
  const matches = subtitle.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return Array.from(new Set(matches));
}

function numericElementLabel(element: Record<string, unknown>): string | null {
  const numeric = deriveNumericElementLabel(element);
  if (numeric) {
    return numeric;
  }
  const parsed = treeNodeNumericValue(element);
  if (parsed === null) {
    return null;
  }
  return numericValueToLabel(parsed);
}

function stepElementCorpus(step: GeminiCanvasStep): string {
  const elements = step.canvas_instructions?.elements ?? [];
  const fragments: string[] = [];
  for (const element of elements) {
    const raw = element as Record<string, unknown>;
    const type = normalizeElementType(raw.type);
    const label = asText(raw.label);
    const animationRepresents = asText(asObject(raw.animation)?.represents);
    const numeric = numericElementLabel(raw);
    if (type) {
      fragments.push(type.replace(/_/g, " "));
    }
    if (label) {
      fragments.push(label.toLowerCase());
    }
    if (numeric) {
      fragments.push(numeric.toLowerCase());
    }
    if (animationRepresents) {
      fragments.push(animationRepresents.toLowerCase());
    }
  }
  return fragments.join(" ");
}

function scoreSubtitleVisualAlignment(step: GeminiCanvasStep): number {
  const elements = step.canvas_instructions?.elements ?? [];
  if (elements.length === 0) {
    return 0;
  }

  const subtitle = asText(step.subtitle).toLowerCase();
  const keywords = extractSubtitleKeywords(subtitle);
  const numbers = extractSubtitleNumbers(subtitle);
  const corpus = stepElementCorpus(step);

  const keywordHits = keywords.filter((keyword) => corpus.includes(keyword)).length;
  const keywordCoverage = keywords.length > 0 ? keywordHits / keywords.length : 1;

  const numericHits = numbers.filter((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^0-9.-])${escaped}([^0-9.-]|$)`);
    return regex.test(corpus);
  }).length;
  const numericCoverage = numbers.length > 0 ? numericHits / numbers.length : 1;

  const types = new Set(
    elements.map((element) => normalizeElementType((element as Record<string, unknown>).type))
  );
  const hasHighlight = elements.some((element) => {
    const raw = element as Record<string, unknown>;
    const color = normalizeHexColor(asText(raw.color), "").toLowerCase();
    const animationType = normalizeAnimationType(asObject(raw.animation)?.type);
    return color === "#ff6b35" || animationType === "highlight";
  });
  const hasMotion = elements.some((element) => {
    const animationType = normalizeAnimationType(asObject((element as Record<string, unknown>).animation)?.type);
    return animationType !== "none" && animationType !== "fade_in";
  });

  let cueScore = 1;
  if (/(compare|comparison|between|versus|\bvs\b|swap)/i.test(subtitle)) {
    cueScore *= hasHighlight ? 1 : 0.6;
  }
  if (/(insert|enqueue|push|add|move|shift|transition)/i.test(subtitle)) {
    cueScore *= hasMotion ? 1 : 0.7;
  }
  if (/(tree|root|left|right|child|bst)/i.test(subtitle)) {
    cueScore *= types.has("tree_node") ? 1 : 0.5;
  }
  if (/(sort|array|ascending|descending)/i.test(subtitle)) {
    cueScore *= types.has("bar") ? 1 : 0.55;
  }
  if (/(regression|axis|plot|slope|intercept|point)/i.test(subtitle)) {
    cueScore *= types.has("axis") && types.has("plot_point") ? 1 : 0.5;
  }
  if (/(matrix|confusion|true positive|false negative|tp|fp|fn|tn)/i.test(subtitle)) {
    cueScore *= types.has("matrix") || types.has("rectangle") ? 1 : 0.6;
  }
  if (/(state|running|waiting|ready|terminated|transition|scheduler)/i.test(subtitle)) {
    cueScore *= types.has("arrow") || types.has("line") ? 1 : 0.7;
  }

  const rawScore = keywordCoverage * 45 + numericCoverage * 35 + cueScore * 20;
  return clamp(Math.round(rawScore), 0, 100);
}

function enforceSubtitleVisualAlignment(step: GeminiCanvasStep): GeminiCanvasStep {
  const elements = (step.canvas_instructions?.elements ?? []).map((element) => ({
    ...(element as Record<string, unknown>)
  }));
  if (elements.length === 0) {
    return step;
  }

  const subtitle = asText(step.subtitle);
  const focusPattern =
    /(?:highlight|focus(?:ing)? on|consider|target|pivot|insert(?:ing)?|current(?:ly)?(?: value| node)?)[^\d-]*(-?\d+(?:\.\d+)?)/i;
  const comparePattern =
    /(?:compare|between|swap|versus|\bvs\b)[^\d-]*(-?\d+(?:\.\d+)?)[^\d-]+(-?\d+(?:\.\d+)?)/i;
  const focusMatch = subtitle.match(focusPattern);
  const compareMatch = subtitle.match(comparePattern);

  const paintElement = (value: string, color: string) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^0-9.-])${escaped}([^0-9.-]|$)`);
    for (const element of elements) {
      const label = asText(element.label);
      const numeric = numericElementLabel(element);
      if (regex.test(label) || (numeric ? regex.test(numeric) : false)) {
        element.color = color;
      }
    }
  };

  if (focusMatch?.[1]) {
    paintElement(focusMatch[1], "#FF6B35");
  }
  if (compareMatch?.[1] && compareMatch?.[2]) {
    paintElement(compareMatch[1], "#FF6B35");
    paintElement(compareMatch[2], "#00D4FF");
  }

  return {
    ...step,
    canvas_instructions: {
      elements: elements as GeminiCanvasElement[]
    }
  };
}

// Connectors and decorative shapes are expected to be unlabeled.
function isDecorativeElementType(type: string): boolean {
  return (
    type === "arrow" ||
    type === "line" ||
    type === "dashed_line" ||
    type === "curved_arrow" ||
    type === "highlight_box" ||
    type === "grid" ||
    type === "polygon" ||
    type === "path" ||
    type === "wave"
  );
}

function countStepPlaceholderLabels(step: GeminiCanvasStep): number {
  const placeholderLabelPattern =
    /^(text|rectangle|circle|ellipse|triangle|bar|matrix|axis|plot[_ ]?point|arrow|line|element|tree[_ ]?node)\s*\d*$/i;
  return (step.canvas_instructions?.elements ?? []).reduce((count, element) => {
    if (isDecorativeElementType(normalizeElementType((element as Record<string, unknown>).type))) {
      return count;
    }
    const label = asText((element as Record<string, unknown>).label);
    if (!label || placeholderLabelPattern.test(label)) {
      return count + 1;
    }
    return count;
  }, 0);
}

function scoreStepQuality(step: GeminiCanvasStep): number {
  const elements = step.canvas_instructions?.elements ?? [];
  const elementCount = elements.length;
  const uniqueTypes = new Set(
    elements.map((element) => normalizeElementType((element as Record<string, unknown>).type))
  ).size;
  const placeholderCount = countStepPlaceholderLabels(step);
  const subtitleWords = asText(step.subtitle)
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  let score = 0;
  score += Math.min(40, elementCount * 6);
  score += Math.min(20, uniqueTypes * 5);
  score += Math.min(20, Math.floor(subtitleWords / 3));
  score -= Math.min(25, placeholderCount * 6);
  const lowSignalLabels = elements.reduce((count, element) => {
    const type = normalizeElementType((element as Record<string, unknown>).type);
    if (isDecorativeElementType(type)) {
      return count;
    }
    const label = asText((element as Record<string, unknown>).label).trim();
    if (!label) {
      return count + 1;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(label)) {
      return count;
    }
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      return count + 1;
    }
    return count;
  }, 0);
  score -= Math.min(20, lowSignalLabels * 4);

  return clamp(score, 0, 100);
}

function isConnectorElementType(type: string): boolean {
  return type === "arrow" || type === "line" || type === "dashed_line" || type === "curved_arrow";
}

function compressElementLabel(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-zA-Z0-9+\-_/().%\s]/g, "");
  if (!cleaned) {
    return fallback;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return cleaned;
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return cleaned.slice(0, 42);
  }
  return words.slice(0, 4).join(" ").slice(0, 42);
}

function inferStepVisualFamily(topic: string, step: GeminiCanvasStep): "activation" | "plot" | "matrix" | "tree" | "sorting" | "flow" {
  const text = `${topic} ${step.concept} ${step.subtitle}`.toLowerCase();
  if (/(softmax|sigmoid|relu|activation|probability|logit|normalize|normalization)/.test(text)) {
    return "activation";
  }
  if (/(regression|plot|slope|intercept|axis|curve|function|distribution)/.test(text)) {
    return "plot";
  }
  if (/(matrix|confusion|grid|table|tp|fp|fn|tn)/.test(text)) {
    return "matrix";
  }
  if (/(tree|bst|binary search tree|root|child|left subtree|right subtree)/.test(text)) {
    return "tree";
  }
  if (/(sort|array|swap|bubble|quick|merge|insertion sort|selection sort)/.test(text)) {
    return "sorting";
  }
  return "flow";
}

function buildFamilyFallbackElements(topic: string, step: GeminiCanvasStep): GeminiCanvasElement[] {
  const family = inferStepVisualFamily(topic, step);
  const nums = extractSubtitleNumbers(step.subtitle).map((n) => Number.parseFloat(n)).filter((n) => Number.isFinite(n));
  const numbers = nums.length >= 3 ? nums.slice(0, 6) : [2, 1, 0];
  if (family === "activation") {
    const maxValue = Math.max(...numbers.map((n) => Math.abs(n)), 1);
    return [
      { type: "rectangle", x: 12, y: 18, width: 20, height: 10, color: "#4A90E2", label: "Input logits", label_position: "above" },
      { type: "rectangle", x: 40, y: 18, width: 20, height: 10, color: "#8B5CF6", label: "Exponential", label_position: "above" },
      { type: "rectangle", x: 68, y: 18, width: 20, height: 10, color: "#00D4FF", label: "Normalize sum", label_position: "above" },
      { type: "arrow", x1: 32, y1: 23, x2: 40, y2: 23, width: 1, height: 1, color: "#9db2ce", label: "", label_position: "above" },
      { type: "arrow", x1: 60, y1: 23, x2: 68, y2: 23, width: 1, height: 1, color: "#9db2ce", label: "", label_position: "above" },
      ...numbers.slice(0, 3).map((value, index) => ({
        type: "bar" as const,
        x: 18 + index * 12,
        y: 85,
        width: 8,
        height: Math.max(10, (Math.abs(value) / maxValue) * 60),
        color: index === 0 ? "#FF6B35" : "#4A90E2",
        label: String(value),
        label_position: "above",
        animation: {
          type: "fade_in" as const,
          duration: 700 + index * 120,
          direction: "none",
          represents: "shows logit contribution"
        }
      }))
    ] as GeminiCanvasElement[];
  }
  if (family === "plot") {
    const points = numbers.length >= 4 ? numbers : [1, 2, 3, 4];
    return [
      { type: "axis", x: 16, y: 20, width: 68, height: 58, color: "#9dc3ff", label: "x-y axes", label_position: "above" },
      ...points.slice(0, 4).map((_, index) => ({
        type: "plot_point" as const,
        x: 26 + index * 14,
        y: clamp(62 - points[index] * 4, 24, 70),
        width: 3,
        height: 3,
        color: index === 1 ? "#FF6B35" : "#00D4FF",
        label: `P${index + 1}`,
        label_position: "above"
      })),
      { type: "line", x1: 24, y1: 62, x2: 78, y2: 38, width: 1, height: 1, color: "#8B5CF6", label: "", label_position: "above" }
    ] as GeminiCanvasElement[];
  }
  if (family === "matrix") {
    return [
      { type: "rectangle", x: 30, y: 35, width: 20, height: 18, color: "#22c55e", label: "TP", label_position: "above" },
      { type: "rectangle", x: 55, y: 35, width: 20, height: 18, color: "#1E3A5F", label: "FP", label_position: "above" },
      { type: "rectangle", x: 30, y: 58, width: 20, height: 18, color: "#1E3A5F", label: "FN", label_position: "above" },
      { type: "rectangle", x: 55, y: 58, width: 20, height: 18, color: "#1E3A5F", label: "TN", label_position: "above" },
      { type: "text", x: 12, y: 10, width: 32, height: 6, color: "#d9e6ff", label: "Confusion matrix", label_position: "right" }
    ] as GeminiCanvasElement[];
  }
  if (family === "tree") {
    return [
      { type: "tree_node", x: 50, y: 12, width: 10, height: 10, color: "#4A90E2", label: "50", value: 50, parent_value: null, label_position: "below" },
      { type: "tree_node", x: 25, y: 30, width: 10, height: 10, color: "#4A90E2", label: "30", value: 30, parent_value: 50, label_position: "below" },
      { type: "tree_node", x: 75, y: 30, width: 10, height: 10, color: "#4A90E2", label: "70", value: 70, parent_value: 50, label_position: "below" },
      { type: "tree_node", x: 12, y: 50, width: 10, height: 10, color: "#FF6B35", label: "20", value: 20, parent_value: 30, label_position: "below" },
      { type: "tree_node", x: 38, y: 50, width: 10, height: 10, color: "#4A90E2", label: "40", value: 40, parent_value: 30, label_position: "below" }
    ] as GeminiCanvasElement[];
  }
  if (family === "sorting") {
    const arr = numbers.length >= 5 ? numbers.slice(0, 5) : [5, 3, 8, 1, 4];
    const maxValue = Math.max(...arr.map((n) => Math.abs(n)), 1);
    return arr.map((value, index) => ({
      type: "bar",
      x: 12 + index * 14,
      y: 85,
      width: 10,
      height: Math.max(8, (Math.abs(value) / maxValue) * 60),
      color: index < 2 ? "#FF6B35" : "#4A90E2",
      label: String(value),
      label_position: "above",
      animation: index < 2
        ? {
            type: "swap",
            duration: 900,
            direction: "none",
            represents: "swap compared values",
            with: { x: 12 + (1 - index) * 14, y: 85 }
          }
        : {
            type: "fade_in",
            duration: 700,
            direction: "none",
            represents: "value in array"
          }
    })) as GeminiCanvasElement[];
  }
  const phrases = extractSubtitlePhrases(step.subtitle);
  const labels = (phrases.length > 0 ? phrases : [step.concept, "Key relation", "Outcome"])
    .map((label) => compressElementLabel(label, "Concept"))
    .slice(0, 4);
  return [
    { type: "rectangle", x: 14, y: 26, width: 24, height: 12, color: "#4A90E2", label: labels[0] || "Input", label_position: "above" },
    { type: "rectangle", x: 44, y: 26, width: 24, height: 12, color: "#00D4FF", label: labels[1] || "Process", label_position: "above" },
    { type: "rectangle", x: 74, y: 26, width: 18, height: 12, color: "#8B5CF6", label: labels[2] || "Output", label_position: "above" },
    { type: "arrow", x1: 38, y1: 32, x2: 44, y2: 32, width: 1, height: 1, color: "#9db2ce", label: "", label_position: "above" },
    { type: "arrow", x1: 68, y1: 32, x2: 74, y2: 32, width: 1, height: 1, color: "#9db2ce", label: "", label_position: "above" },
    { type: "text", x: 16, y: 12, width: 28, height: 6, color: "#d9e6ff", label: labels[3] || "Main idea", label_position: "right" }
  ] as GeminiCanvasElement[];
}

function ensureRenderableElementsForStep(topic: string, step: GeminiCanvasStep): GeminiCanvasStep {
  const currentElements = (step.canvas_instructions?.elements ?? []).map((element) => ({
    ...(element as Record<string, unknown>)
  })) as GeminiCanvasElement[];

  const sanitized = currentElements
    .flatMap((element, index) => {
      const next = { ...(element as Record<string, unknown>) };
      const type = normalizeElementType(next.type);
      const rawLabel = asText(next.label);

      if (type === "text" && rawLabel.length > 180) {
        return [];
      }

      if (isConnectorElementType(type)) {
        next.label = "";
      } else {
        // An unlabeled shape stays unlabeled; inventing "circle 7" captions only adds noise.
        next.label = rawLabel.trim() ? compressElementLabel(rawLabel, "Concept") : "";
      }

      if (type === "plot_point") {
        next.width = Math.min(4, Math.max(2, Number(next.width) || 3));
        next.height = Math.min(4, Math.max(2, Number(next.height) || 3));
      }

      return [next as GeminiCanvasElement];
    })
    .slice(0, 30);

  const informativeVisualCount = sanitized.filter((element) => {
    const type = normalizeElementType((element as Record<string, unknown>).type);
    return type !== "text" && !isConnectorElementType(type);
  }).length;

  if (sanitized.length >= 5 && informativeVisualCount >= 3) {
    return {
      ...step,
      canvas_instructions: {
        elements: sanitized
      }
    };
  }

  const fallbackElements = buildFamilyFallbackElements(topic, step);
  return {
    ...step,
    canvas_instructions: {
      elements: fallbackElements
    }
  };
}

function ensureRenderableElementsFromSubtitle(topic: string, steps: GeminiCanvasStep[]): GeminiCanvasStep[] {
  return steps.map((step) => ensureRenderableElementsForStep(topic, step));
}

function shouldRegenerateStep(step: GeminiCanvasStep, score: number, alignmentScore: number): boolean {
  const elements = step.canvas_instructions?.elements ?? [];
  const subtitleWords = asText(step.subtitle)
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  const subtitleNumbers = extractSubtitleNumbers(asText(step.subtitle));
  const unlabeledShapes = elements.reduce((count, element) => {
    const type = normalizeElementType((element as Record<string, unknown>).type);
    if (isDecorativeElementType(type)) {
      return count;
    }
    return asText((element as Record<string, unknown>).label).trim() ? count : count + 1;
  }, 0);
  const lowNumericCoverage = subtitleNumbers.length > 0 && alignmentScore < 70;
  // Thresholds flag real defects only. A healthy step scores about 50-70 on scoreStepQuality, so the
  // score is a severe-floor check here and is otherwise used to compare a draft with its repair.
  return (
    score < 40 ||
    alignmentScore < 75 ||
    elements.length < 5 ||
    subtitleWords < 18 ||
    lowNumericCoverage ||
    unlabeledShapes > 1 ||
    countStepPlaceholderLabels(step) > 0
  );
}

// Bounds repair latency and cost: only the weakest steps get a second pass.
const MAX_STEP_REPAIRS = 3;

function computeStepDurationMs(subtitle: string): number {
  const words = subtitle.split(/\s+/).filter(Boolean).length;
  return Math.min(35000, Math.max(12000, words * 400));
}

function parseGeneratedStep(
  rawStep: { step: number; concept: string; subtitle: string; elements: unknown },
  index: number
): GeminiCanvasStep | null {
  const normalized = normalizeCanvasStep(
    {
      step: rawStep.step,
      concept: rawStep.concept,
      subtitle: rawStep.subtitle,
      duration_ms: computeStepDurationMs(rawStep.subtitle),
      canvas_instructions: { elements: Array.isArray(rawStep.elements) ? rawStep.elements : [] }
    },
    index
  );
  const parsed = simCanvasStepSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

// Low-quality steps are repaired concurrently: each repair is independent, so wall time is the
// slowest single repair instead of the sum of all of them.
async function regenerateLowQualitySteps(
  topic: string,
  level: DifficultyLevel,
  steps: GeminiCanvasStep[],
  plans: Map<number, string>
): Promise<GeminiCanvasStep[]> {
  const targets = steps
    .map((step, index) => ({
      index,
      step,
      score: scoreStepQuality(step),
      alignmentScore: scoreSubtitleVisualAlignment(step)
    }))
    .filter((item) => shouldRegenerateStep(item.step, item.score, item.alignmentScore))
    .sort((a, b) => a.alignmentScore + a.score - (b.alignmentScore + b.score))
    .slice(0, MAX_STEP_REPAIRS);

  if (targets.length === 0) {
    return steps;
  }
  console.log(
    `[Simulation] Repairing ${targets.length}/${steps.length} steps: ` +
      targets
        .map((item) => {
          const elements = item.step.canvas_instructions?.elements ?? [];
          const words = asText(item.step.subtitle).split(/\s+/).filter(Boolean).length;
          return `#${item.step.step}(q${item.score}/a${item.alignmentScore}/e${elements.length}/w${words}/p${countStepPlaceholderLabels(item.step)})`;
        })
        .join(" ")
  );

  const nextSteps = [...steps];
  await Promise.all(
    targets.map(async (target) => {
      const current = steps[target.index];
      try {
        const payload = asObject(
          await generateJson(
            buildImproveStepPrompt({
              topic,
              level,
              step: { step: current.step, concept: current.concept, subtitle: current.subtitle },
              visualPlan: plans.get(current.step) ?? "",
              currentElements: current.canvas_instructions?.elements ?? []
            }),
            { system: ELEMENT_SYSTEM_PROMPT, maxTokens: 1800, temperature: 0.1, tag: `improve-${current.step}` }
          )
        );
        const rewrittenSubtitle = asText(payload?.subtitle).trim();
        const subtitle =
          rewrittenSubtitle.length >= 60 && rewrittenSubtitle.length <= 1200 ? rewrittenSubtitle : current.subtitle;
        const improved = parseGeneratedStep(
          { step: current.step, concept: current.concept, subtitle, elements: payload?.elements },
          target.index
        );
        if (improved && scoreStepQuality(improved) > target.score) {
          nextSteps[target.index] = improved;
        }
      } catch (_error) {
        // Keep the original step if targeted regeneration fails.
      }
    })
  );

  return nextSteps;
}

function enforceMeaningfulElementLabels(topic: string, steps: GeminiCanvasStep[]): GeminiCanvasStep[] {
  const placeholderLabelPattern =
    /^(text|rectangle|circle|ellipse|triangle|bar|matrix|axis|plot[_ ]?point|arrow|line|element|tree[_ ]?node)\s*\d*$/i;
  const skipPlaceholderLabelTypes = new Set(["arrow", "line", "dashed_line", "curved_arrow"]);
  // Decorative shapes are meant to be unlabeled; do not invent captions for them.
  const unlabeledOkTypes = new Set(["highlight_box", "grid", "polygon", "path", "wave"]);
  const isConfusionMatrixTopic = /confusion matrix/i.test(topic);
  const confusionLabels = ["True Positive", "False Positive", "False Negative", "True Negative"];
  const topicWords = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3);
  const primaryTopicWord = topicWords[0] || "Concept";

  return steps.map((step) => {
    let confusionCursor = 0;
    const elements = (step.canvas_instructions?.elements ?? []).flatMap((element, index) => {
      const nextElement = { ...(element as Record<string, unknown>) };
      const rawLabel = asText(nextElement.label);
      const type = asText(nextElement.type).toLowerCase().replace(/\s+/g, "_");
      const isPlaceholder = !rawLabel || placeholderLabelPattern.test(rawLabel);
      if (!isPlaceholder) {
        return [nextElement as GeminiCanvasElement];
      }
      if (unlabeledOkTypes.has(type)) {
        return [nextElement as GeminiCanvasElement];
      }
      if (skipPlaceholderLabelTypes.has(type)) {
        return [];
      }
      if (type === "tree_node") {
        const nodeValue = treeNodeNumericValue(nextElement);
        if (nodeValue !== null) {
          nextElement.label = numericValueToLabel(nodeValue);
        } else {
          nextElement.label = `Node ${index + 1}`;
        }
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "bar") {
        const numericLabel = deriveNumericElementLabel(nextElement);
        nextElement.label = numericLabel || `Value ${index + 1}`;
        return [nextElement as GeminiCanvasElement];
      }
      if (isConfusionMatrixTopic) {
        nextElement.label = confusionLabels[confusionCursor % confusionLabels.length];
        confusionCursor += 1;
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "text") {
        return [];
      }
      if (type === "matrix") {
        nextElement.label = `${primaryTopicWord} matrix`.slice(0, 180);
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "axis") {
        nextElement.label = "Axis";
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "plot_point") {
        nextElement.label = `Point ${index + 1}`;
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "flowchart_diamond") {
        nextElement.label = "Decision";
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "circle") {
        nextElement.label = `${primaryTopicWord} node ${index + 1}`.slice(0, 180);
        return [nextElement as GeminiCanvasElement];
      }
      if (type === "rectangle") {
        nextElement.label = `${primaryTopicWord} block ${index + 1}`.slice(0, 180);
        return [nextElement as GeminiCanvasElement];
      }
      nextElement.label = `${primaryTopicWord} ${index + 1}`.slice(0, 180);
      return [nextElement as GeminiCanvasElement];
    });
    if (elements.length === 0) {
      elements.push({
        type: "text",
        x: 50,
        y: 50,
        width: 30,
        height: 6,
        color: "#00d4ff",
        label: step.concept.slice(0, 180),
        label_position: "above",
        animation: {
          type: "fade_in",
          duration: 800,
          direction: "none",
          represents: step.subtitle.slice(0, 240)
        }
      } as GeminiCanvasElement);
    }
    return {
      ...step,
      canvas_instructions: {
        elements
      }
    };
  });
}

function normalizeNarration(lines: string[]): string[] {
  return lines
    .map((line) => line.trim().slice(0, 260))
    .filter((line) => line.length > 0)
    .slice(0, 8);
}

function textHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const DOMAIN_TERMS: Record<TechDomain, string[]> = {
  web: ["browser", "request", "router", "api", "state", "render", "component", "response"],
  data: ["dataset", "table", "query", "index", "join", "transaction", "schema", "warehouse"],
  ml: ["feature", "model", "loss", "gradient", "training", "inference", "evaluation", "prediction"],
  network: ["packet", "latency", "protocol", "tcp", "dns", "gateway", "routing", "bandwidth"],
  systems: ["process", "thread", "memory", "queue", "scheduler", "throughput", "state", "resource"],
  security: ["encryption", "auth", "token", "key", "certificate", "integrity", "threat", "policy"],
  cloud: ["container", "cluster", "deployment", "scaling", "pipeline", "observability", "service", "node"],
  algorithms: ["input", "loop", "branch", "complexity", "optimize", "state", "output", "invariant"],
  hardware: ["cpu", "cache", "register", "bus", "clock", "instruction", "memory", "pipeline"],
  general: ["input", "process", "state", "decision", "feedback", "output", "validation", "result"]
};

function detectTechDomain(topicTitle: string): TechDomain {
  const title = topicTitle.toLowerCase();
  if (/(react|frontend|backend|api|http|javascript|typescript|html|css|web|dom)/.test(title)) {
    return "web";
  }
  if (/(database|sql|nosql|etl|warehouse|analytics|regression|statistics|query|data)/.test(title)) {
    return "data";
  }
  if (/(machine learning|deep learning|neural|llm|model training|classification|clustering|ai)/.test(title)) {
    return "ml";
  }
  if (/(network|tcp|udp|dns|routing|switch|firewall|protocol|latency)/.test(title)) {
    return "network";
  }
  if (/(operating system|os |kernel|process|thread|scheduling|concurrency|distributed)/.test(title)) {
    return "systems";
  }
  if (/(security|encryption|oauth|jwt|authentication|authorization|cryptography|xss|csrf)/.test(title)) {
    return "security";
  }
  if (/(cloud|kubernetes|docker|devops|cicd|deployment|autoscaling|microservice)/.test(title)) {
    return "cloud";
  }
  if (/(algorithm|graph algorithm|sorting|dynamic programming|tree|hash|search|complexity)/.test(title)) {
    return "algorithms";
  }
  if (/(cpu|gpu|computer architecture|cache|assembly|register|instruction|hardware)/.test(title)) {
    return "hardware";
  }
  return "general";
}

function topicKeywords(topic: Topic, domain?: TechDomain): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "along",
    "among",
    "because",
    "between",
    "build",
    "from",
    "into",
    "that",
    "this",
    "with",
    "using",
    "what",
    "where",
    "when",
    "which",
    "while",
    "would",
    "could",
    "should"
  ]);

  const raw = `${topic.title} ${topic.description}`
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  const unique = Array.from(new Set(raw)).slice(0, 10);
  const domainHints = domain ? DOMAIN_TERMS[domain].slice(0, 4) : [];
  const withHints = Array.from(new Set([...unique, ...domainHints]));
  if (withHints.length >= 4) {
    return withHints.slice(0, 10);
  }
  return [...withHints, "input", "process", "validate", "output"].slice(0, 8);
}

function objectIdFromLabel(label: string, index: number): string {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return id || `node-${index + 1}`;
}

function layoutPositions(layout: SceneLayout, count: number): Array<{ x: number; y: number; z: number }> {
  const safeCount = Math.max(2, count);
  if (layout === "pipeline" || layout === "timeline") {
    const startX = -6;
    const endX = 6;
    return Array.from({ length: safeCount }).map((_, index) => ({
      x: Number((startX + ((endX - startX) * index) / Math.max(1, safeCount - 1)).toFixed(2)),
      y: layout === "timeline" ? -0.3 : Number((Math.sin(index * 0.7) * 0.8).toFixed(2)),
      z: Number((((index % 2) - 0.5) * 0.45).toFixed(2))
    }));
  }

  if (layout === "layered") {
    return Array.from({ length: safeCount }).map((_, index) => ({
      x: Number((((index % 2 === 0 ? -1 : 1) * (1.5 + (index % 3) * 0.9))).toFixed(2)),
      y: Number((3.5 - index * 1.2).toFixed(2)),
      z: Number((((index % 3) - 1) * 0.4).toFixed(2))
    }));
  }

  if (layout === "hub") {
    return Array.from({ length: safeCount }).map((_, index) => {
      if (index === 0) {
        return { x: 0, y: 0, z: 0 };
      }
      const angle = ((index - 1) / Math.max(1, safeCount - 1)) * Math.PI * 2;
      return {
        x: Number((Math.cos(angle) * 4.2).toFixed(2)),
        y: Number((Math.sin(angle) * 2.5).toFixed(2)),
        z: Number((((index % 2) - 0.5) * 0.55).toFixed(2))
      };
    });
  }

  const root = [{ x: 0, y: 3.6, z: 0 }];
  const remaining = safeCount - 1;
  const midCount = Math.max(2, Math.ceil(remaining / 2));
  const lastCount = Math.max(1, remaining - midCount);
  const middle = Array.from({ length: midCount }).map((_, index) => ({
    x: Number((-3.8 + (7.6 * index) / Math.max(1, midCount - 1)).toFixed(2)),
    y: 1.1,
    z: Number((((index % 2) - 0.5) * 0.35).toFixed(2))
  }));
  const bottom = Array.from({ length: lastCount }).map((_, index) => ({
    x: Number((-4.8 + (9.6 * index) / Math.max(1, lastCount - 1)).toFixed(2)),
    y: -1.7,
    z: Number((((index % 2) - 0.5) * 0.35).toFixed(2))
  }));
  return [...root, ...middle, ...bottom].slice(0, safeCount);
}

function pickObjectType(label: string, index: number): SimObject["type"] {
  const value = label.toLowerCase();
  if (/(queue|table|cache|database|index|memory|registry|store)/.test(value)) {
    return "box";
  }
  if (/(request|response|packet|token|event|message|signal|sample)/.test(value)) {
    return "sphere";
  }
  if (/(service|server|model|agent|process|node|worker|controller)/.test(value)) {
    return "cylinder";
  }
  if (/(decision|branch|classifier|router)/.test(value)) {
    return "cone";
  }
  if (/(loop|cycle|feedback)/.test(value)) {
    return "torus";
  }
  if (/(rule|policy|equation|formula|constraint)/.test(value)) {
    return "plane";
  }
  const rotation = ["box", "sphere", "cylinder", "cone", "torus"] as const;
  return rotation[index % rotation.length];
}

function buildConnectionsFromLayout(layout: SceneLayout, objects: SimObject[]): SimConnection[] {
  if (objects.length < 2) {
    return [];
  }

  if (layout === "hub") {
    const center = objects[0].id;
    return objects.slice(1).map((item) => ({
      fromId: center,
      toId: item.id,
      type: "line",
      color: "#5ca9ff"
    }));
  }

  if (layout === "tree") {
    const links: SimConnection[] = [];
    for (let index = 0; index < objects.length - 1; index += 1) {
      const parentIndex = Math.floor(index / 2);
      if (parentIndex < index) {
        links.push({
          fromId: objects[parentIndex].id,
          toId: objects[index + 1].id,
          type: "line",
          color: "#7cb8ff"
        });
      }
    }
    return links;
  }

  return objects.slice(0, -1).map((item, index) => ({
    fromId: item.id,
    toId: objects[index + 1].id,
    type: layout === "timeline" ? "arrow" : "line",
    color: "#6fb6ff"
  }));
}

function stageBlueprints(
  domain: TechDomain,
  topicTitle: string,
  keywords: string[],
  mathTopic: boolean,
  graphTopic: boolean
): Array<{
  concept: string;
  annotation: string;
  labels: string[];
  layout: SceneLayout;
  graph?: z.infer<typeof simGraphSchema>;
  mathExpressions?: z.infer<typeof simMathExpressionSchema>[];
}> {
  const key = (index: number, fallback: string) => keywords[index] ?? fallback;
  const topicShort = topicTitle.slice(0, 42);
  const regressionLike = /(regression|forecast|trend|signal|statistics)/i.test(topicTitle);

  if (domain === "ml") {
    return [
      {
        concept: "Problem framing and dataset",
        annotation: `Establish ${topicShort} objective, data source, and target variable.`,
        labels: ["Use Case", "Dataset", "Features", "Target"],
        layout: "pipeline"
      },
      {
        concept: "Data preparation",
        annotation: "Clean, normalize, and split data into training and validation subsets.",
        labels: ["Raw Data", "Cleaning", "Normalization", "Train Split", "Validation Split"],
        layout: "pipeline"
      },
      {
        concept: "Model mapping",
        annotation: "Map features to predictions through the model hypothesis.",
        labels: ["Feature Vector", "Model", "Prediction", "Residual"],
        layout: "hub",
        graph: graphTopic || regressionLike
          ? {
              type: "scatter",
              title: `${topicShort} data fit`,
              x: [1, 2, 3, 4, 5, 6],
              y: [1.2, 2.1, 2.9, 4.2, 5.1, 5.8]
            }
          : undefined
      },
      {
        concept: "Optimization loop",
        annotation: "Reduce loss by updating parameters over iterative optimization steps.",
        labels: ["Prediction", "Loss", "Gradient", "Optimizer", "Updated Weights"],
        layout: "timeline",
        mathExpressions: mathTopic
          ? [
              {
                expression: "y_hat = b0 + b1 * x",
                variables: { b0: 0.8, b1: 1.05, x: 4 } as Record<string, number>
              },
              {
                expression: "loss = (y - y_hat)^2",
                variables: { y: 5.1, y_hat: 5.0 } as Record<string, number>
              }
            ]
          : undefined
      },
      {
        concept: "Evaluation",
        annotation: "Measure quality using validation metrics and error diagnostics.",
        labels: ["Validation Data", "Metric Engine", "Error Analysis", "Model Report"],
        layout: "layered",
        graph: graphTopic
          ? {
              type: "line",
              title: `${topicShort} metric trend`,
              x: [1, 2, 3, 4, 5, 6],
              y: [0.92, 0.89, 0.84, 0.79, 0.75, 0.72]
            }
          : undefined
      },
      {
        concept: "Inference and deployment",
        annotation: "Serve predictions in production with monitoring and feedback loops.",
        labels: ["New Input", "Inference API", "Prediction Output", "Monitoring", "Feedback Store"],
        layout: "pipeline"
      }
    ];
  }

  if (domain === "data") {
    return [
      {
        concept: "Data model and entities",
        annotation: `Define core entities and relations required for ${topicShort}.`,
        labels: ["Source", "Schema", "Entity", "Relation"],
        layout: "tree"
      },
      {
        concept: "Ingestion and transformation",
        annotation: "Ingest data and transform it into analysis-ready structure.",
        labels: ["Extractor", "Transformer", "Validator", "Warehouse"],
        layout: "pipeline"
      },
      {
        concept: "Query execution",
        annotation: "Parse, optimize, and execute queries across data structures.",
        labels: ["Query", "Planner", "Index", "Executor", "Result Set"],
        layout: "timeline",
        mathExpressions: mathTopic
          ? [
              {
                expression: "latency = rows / throughput",
                variables: { rows: 120000, throughput: 6000 } as Record<string, number>
              }
            ]
          : undefined
      },
      {
        concept: "Aggregation and insight",
        annotation: "Aggregate dimensions and metrics to surface actionable signals.",
        labels: ["Dimension", "Metric", "Aggregation", "Insight"],
        layout: "hub",
        graph: graphTopic
          ? {
              type: "bar",
              title: `${topicShort} grouped metric`,
              x: [1, 2, 3, 4],
              y: [16, 22, 19, 31]
            }
          : undefined
      },
      {
        concept: "Quality and consistency",
        annotation: "Validate constraints, null handling, and consistency guarantees.",
        labels: ["Rules", "Quality Checks", "Anomaly Flag", "Approved Output"],
        layout: "layered"
      },
      {
        concept: "Decision support",
        annotation: "Deliver a final data product with interpretation-ready output.",
        labels: ["Dashboard", "Decision Node", "Recommendation", "Action"],
        layout: "pipeline"
      }
    ];
  }

  const common = [
    {
      concept: `Foundations of ${topicShort}`,
      annotation: `Establish the baseline components and assumptions for ${topicShort}.`,
      labels: [key(0, "input"), key(1, "state"), key(2, "component"), key(3, "goal")],
      layout: "tree" as SceneLayout
    },
    {
      concept: "Input and signal flow",
      annotation: "Trace how signals move through the system and trigger transformations.",
      labels: [key(0, "source"), key(4, "router"), key(5, "processor"), key(6, "output")],
      layout: "pipeline" as SceneLayout
    },
    {
      concept: "Core mechanism",
      annotation: "Show the central mechanism that drives behavior in this topic.",
      labels: [key(1, "control"), key(2, "engine"), key(6, "state"), key(7, "feedback")],
      layout: "hub" as SceneLayout,
      graph: graphTopic
        ? {
            type: "line" as const,
            title: `${topicShort} behavior trend`,
            x: [1, 2, 3, 4, 5, 6],
            y: [1.1, 1.8, 2.6, 3.0, 3.9, 4.5]
          }
        : undefined
    },
    {
      concept: "Decision logic",
      annotation: "Represent decision points and branching outcomes explicitly.",
      labels: [key(3, "condition"), "Decision", "Path A", "Path B", "Path C"],
      layout: "tree" as SceneLayout
    },
    {
      concept: "Validation and constraints",
      annotation: "Check constraints, error handling, and stability boundaries.",
      labels: ["Constraint", "Verifier", "Exception Path", "Stable Output"],
      layout: "layered" as SceneLayout,
      mathExpressions: mathTopic
        ? [
            {
              expression: "throughput = work / time",
              variables: { work: 320, time: 8 } as Record<string, number>
            },
            {
              expression: "efficiency = output / input",
              variables: { output: 240, input: 300 } as Record<string, number>
            }
          ]
        : undefined
    },
    {
      concept: "End-to-end synthesis",
      annotation: "Combine all components into an end-to-end execution view.",
      labels: ["User Trigger", "Execution Flow", "Result", "Feedback Loop"],
      layout: "timeline" as SceneLayout
    }
  ];

  return common;
}

function buildTemplateSimulationSteps(topic: Topic): SimStep[] {
  const titleLower = topic.title.toLowerCase();
  const domain = detectTechDomain(topic.title);
  const keywords = topicKeywords(topic, domain);
  const seed = textHash(topic.title.toLowerCase());
  const mathTopic = /(math|calculus|matrix|equation|algebra|physics|signal|probability|statistics|regression)/.test(
    titleLower
  );
  const graphTopic = /(graph|plot|chart|signal|trend|statistics|regression|probability|distribution)/.test(
    titleLower
  );

  const paletteByDomain: Record<TechDomain, string[]> = {
    web: ["#4aa8ff", "#20c997", "#7d8bff", "#f4a261", "#a0c4ff", "#b8f2e6"],
    data: ["#6b8dff", "#36cfc9", "#4dabf7", "#74c0fc", "#4ecdc4", "#91a7ff"],
    ml: ["#58a6ff", "#8b5cf6", "#3ddc97", "#34b1eb", "#9d7dff", "#50c878"],
    network: ["#4ea8de", "#48bfe3", "#5e60ce", "#64dfdf", "#80ffdb", "#72ddf7"],
    systems: ["#6d9dc5", "#80ed99", "#4ea8de", "#b8c0ff", "#90dbf4", "#72efdd"],
    security: ["#00a8e8", "#4f5d75", "#4361ee", "#4cc9f0", "#3a86ff", "#4895ef"],
    cloud: ["#3a86ff", "#4cc9f0", "#4895ef", "#4ea8de", "#56cfe1", "#72efdd"],
    algorithms: ["#4f46e5", "#06b6d4", "#22c55e", "#0ea5e9", "#84cc16", "#38bdf8"],
    hardware: ["#5c7cfa", "#15aabf", "#4dabf7", "#748ffc", "#66d9e8", "#91a7ff"],
    general: ["#4ea8de", "#80ed99", "#5e60ce", "#64dfdf", "#7b9acc", "#4cc9f0"]
  };
  const palette = paletteByDomain[domain];

  const blueprints = stageBlueprints(domain, topic.title, keywords, mathTopic, graphTopic).slice(0, 8);
  while (blueprints.length < 8) {
    const nextIndex = blueprints.length + 1;
    blueprints.push({
      concept: `Advanced insight ${nextIndex}`,
      annotation: `Step ${nextIndex} deepens ${topic.title} with an advanced practical perspective.`,
      labels: [
        keywords[(nextIndex + 1) % keywords.length] ?? "signal",
        keywords[(nextIndex + 2) % keywords.length] ?? "control",
        keywords[(nextIndex + 3) % keywords.length] ?? "output",
        `insight-${nextIndex}`
      ],
      layout: nextIndex % 2 === 0 ? "layered" : "pipeline"
    });
  }

  return blueprints.slice(0, 8).map((stage, stageIndex) => {
    const positions = layoutPositions(stage.layout, stage.labels.length);
    const objects: SimObject[] = stage.labels.map((label, index) => {
      const type = pickObjectType(label, stageIndex + index + seed);
      const thickness = type === "plane" ? 0.25 : 1;
      return {
        id: objectIdFromLabel(label, index),
        type,
        color: palette[(stageIndex + index + seed) % palette.length],
        size: {
          x: type === "plane" ? 1.8 : 1 + ((seed + index + stageIndex) % 3) * 0.22,
          y: type === "plane" ? 1.1 : 1 + ((seed + index * 3) % 3) * 0.24,
          z: thickness
        },
        position: positions[index] ?? { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        label: label.slice(0, 80)
      };
    });

    const connections = buildConnectionsFromLayout(stage.layout, objects);
    const movements = objects
      .slice(0, Math.min(8, objects.length))
      .map((object, index) => {
        const targetIndex = Math.min(objects.length - 1, index + 1);
        const target = objects[targetIndex];
        if ((stage.layout === "pipeline" || stage.layout === "timeline") && index < targetIndex) {
          return {
            objectId: object.id,
            type: "translate" as const,
            to: {
              x: Number((object.position.x + (target.position.x - object.position.x) * 0.28).toFixed(2)),
              y: Number((object.position.y + (target.position.y - object.position.y) * 0.28).toFixed(2)),
              z: object.position.z
            },
            durationMs: 1650 + index * 160,
            repeat: 1
          };
        }
        if (index % 2 === 0) {
          return {
            objectId: object.id,
            type: "pulse" as const,
            durationMs: 1500 + index * 130,
            repeat: 1
          };
        }
        return {
          objectId: object.id,
          type: "rotate" as const,
          axis: { x: 0.2, y: 1, z: 0.15 },
          durationMs: 1700 + index * 120,
          repeat: 0
        };
      });

    return {
      step: stageIndex + 1,
      concept: stage.concept.slice(0, 180),
      objects,
      movements,
      labels: [
        {
          text: `${topic.title}: ${stage.concept}`.slice(0, 180),
          position: { x: 0, y: 4.7, z: 0 },
          color: "#dbeafe"
        }
      ],
      connections,
      annotation: stage.annotation.slice(0, 300),
      graph: stage.graph,
      mathExpressions: stage.mathExpressions
    };
  });
}

function stepSpecificityScore(step: SimStep, topicTerms: string[], domainTerms: string[]): number {
  const objectLabels = step.objects.map((item) => (item.label ?? item.id).toLowerCase());
  const labelTexts = step.labels.map((item) => item.text.toLowerCase());
  const bag = [step.annotation.toLowerCase(), (step.concept ?? "").toLowerCase(), ...objectLabels, ...labelTexts].join(
    " "
  );

  const topicHits = topicTerms.filter((term) => bag.includes(term)).length;
  const domainHits = domainTerms.filter((term) => bag.includes(term)).length;
  const unlabeledObjects = step.objects.filter((item) => !(item.label ?? "").trim()).length;
  const genericIds = step.objects.filter((item) => /^obj[-_ ]?\d+$/i.test(item.id)).length;

  let score = 0;
  score += Math.min(3, topicHits);
  score += Math.min(2, domainHits);
  score += step.connections?.length ? 1 : 0;
  score += step.objects.length >= 4 ? 1 : 0;
  score -= unlabeledObjects >= Math.ceil(step.objects.length * 0.7) ? 2 : 0;
  score -= genericIds >= Math.ceil(step.objects.length * 0.7) ? 1 : 0;
  return score;
}

function normalizeSimulationSteps(rawSteps: SimStep[], fallback: SimStep[], topicTitle: string): SimStep[] {
  const domain = detectTechDomain(topicTitle);
  const topicTerms = topicKeywords(
    {
      id: "tmp",
      title: topicTitle,
      description: topicTitle,
      narration: [],
      visualTheme: "systems"
    },
    domain
  );
  const domainTerms = DOMAIN_TERMS[domain];

  const base = rawSteps.length > 0 ? rawSteps.slice(0, 8) : fallback.slice(0, 8);
  const expanded = [...base];
  while (expanded.length < 8) {
    expanded.push(fallback[expanded.length % fallback.length]);
  }

  return expanded.slice(0, 8).map((step, index) => {
    const fallbackStep = fallback[index % fallback.length];
    const chosen = stepSpecificityScore(step, topicTerms, domainTerms) >= 3 ? step : fallbackStep;
    const objectIds = new Set(chosen.objects.map((item) => item.id));
    const movements = chosen.movements
      .filter((move) => objectIds.has(move.objectId))
      .map((move) => ({
        ...move,
        durationMs: Math.max(300, Math.min(10000, Math.round(move.durationMs))),
        repeat: Math.max(0, Math.min(8, Math.round(move.repeat ?? 0)))
      }))
      .slice(0, 40);
    const labels = chosen.labels.slice(0, 24);
    const connections = (chosen.connections ?? [])
      .filter((link) => objectIds.has(link.fromId) && objectIds.has(link.toId) && link.fromId !== link.toId)
      .slice(0, 40);
    const graph =
      chosen.graph && chosen.graph.x.length === chosen.graph.y.length && chosen.graph.x.length > 1
        ? chosen.graph
        : undefined;
    const safeConnections =
      connections.length > 0
        ? connections
        : Array.from(objectIds)
            .slice(0, -1)
            .map((fromId, linkIndex) => ({
              fromId,
              toId: Array.from(objectIds)[linkIndex + 1],
              type: "line" as const,
              color: "#6fb6ff"
            }));
    return {
      step: index + 1,
      concept: chosen.concept?.trim().slice(0, 180) || fallbackStep.concept,
      objects: chosen.objects.slice(0, 24),
      movements,
      labels,
      connections: safeConnections,
      annotation: chosen.annotation.trim().slice(0, 300) || fallbackStep.annotation,
      mathExpressions: chosen.mathExpressions?.slice(0, 10),
      graph
    };
  });
}

function normalizeProblemSets(
  topic: Topic,
  generatedProblemSets?: z.infer<typeof generatedProblemSetsSchema>
): ProblemSet[] {
  const fallbackByLevel = new Map(buildGeneratedProblemSets(topic).map((set) => [set.level, set]));
  const generatedByLevel = new Map((generatedProblemSets ?? []).map((set) => [set.level, set]));

  return LEVELS.map((level) => {
    const fallback = fallbackByLevel.get(level)!;
    const generated = generatedByLevel.get(level);
    if (!generated) {
      return fallback;
    }

    const problems = generated.problems
      .map((problem, index) => {
        const uniqueChoices = Array.from(
          new Set(problem.choices.map((choice) => choice.trim().slice(0, 140)))
        ).filter(Boolean);
        if (!uniqueChoices.includes(problem.answer.trim())) {
          uniqueChoices.push(problem.answer.trim().slice(0, 140));
        }
        if (uniqueChoices.length < 2) {
          return null;
        }
        return {
          id: `${topic.id}-${level}-${index + 1}`,
          question: problem.question.trim().slice(0, 300),
          choices: uniqueChoices.slice(0, 6),
          answer: problem.answer.trim().slice(0, 140),
          explanation: problem.explanation.trim().slice(0, 320)
        };
      })
      .filter((problem): problem is NonNullable<typeof problem> => Boolean(problem));

    return {
      topicId: topic.id,
      level,
      passingScore: Math.round(generated.passingScore),
      problems: problems.length > 0 ? problems : fallback.problems
    };
  });
}

async function generateSimulationOutline(topic: string, level: DifficultyLevel): Promise<OutlineStep[]> {
  const payload = asObject(
    await generateJson(buildOutlinePrompt(topic, level, narrationDepth(level)), {
      system: OUTLINE_SYSTEM_PROMPT,
      jsonSchema: OUTLINE_SCHEMA,
      maxTokens: 2000,
      temperature: 0.2,
      tag: "outline"
    })
  );
  const rawSteps = payload && Array.isArray(payload.steps) ? payload.steps : [];
  const outline: OutlineStep[] = [];
  for (const raw of rawSteps) {
    const item = asObject(raw);
    const subtitle = asText(item?.subtitle).trim();
    if (!item || subtitle.length < 20) {
      continue;
    }
    outline.push({
      step: outline.length + 1,
      concept: (asText(item.concept).trim() || `Step ${outline.length + 1}`).slice(0, 120),
      subtitle: subtitle.slice(0, 1200),
      visual_plan: asText(item.visual_plan).trim().slice(0, 600)
    });
    if (outline.length === 8) {
      break;
    }
  }
  if (outline.length === 0) {
    throw new Error("Simulation generation failed: the model did not return a usable outline.");
  }
  return outline;
}

async function generateStepCanvas(
  topic: string,
  level: DifficultyLevel,
  outline: OutlineStep[],
  target: OutlineStep
): Promise<GeminiCanvasStep | null> {
  const prompt = buildElementPrompt({ topic, level, outline, target });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const root = asObject(
        await generateJson(prompt, {
          system: ELEMENT_SYSTEM_PROMPT,
          maxTokens: 1800,
          temperature: attempt === 1 ? 0.2 : 0.4,
          tag: `step-${target.step}`
        })
      );
      const elements = root?.elements ?? asObject(root?.canvas_instructions)?.elements;
      const step = parseGeneratedStep(
        { step: target.step, concept: target.concept, subtitle: target.subtitle, elements },
        target.step - 1
      );
      if (step && Array.isArray(elements) && elements.length > 0) {
        return step;
      }
    } catch (error) {
      console.warn(`[Simulation] Step ${target.step} canvas attempt ${attempt} failed:`, (error as Error).message);
    }
  }
  return null;
}

async function generateSimulationFromGemini(
  topic: string,
  level: DifficultyLevel
): Promise<GeminiSimulationPayload> {
  if (!isLlmConfigured()) {
    throw new Error(
      "Azure OpenAI is not configured. Missing AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY or AZURE_OPENAI_DEPLOYMENT."
    );
  }

  const startedAt = Date.now();
  // Phase 1: one small structured call fixes the story, the running example and a visual plan per step.
  const outline = await generateSimulationOutline(topic, level);
  const plans = new Map(outline.map((item) => [item.step, item.visual_plan] as const));

  // Phase 2: every step's canvas is generated concurrently. The outline carries the shared data, so
  // steps stay consistent even though they are produced independently.
  const drafted = await Promise.all(
    outline.map(async (item) => {
      const step = await generateStepCanvas(topic, level, outline, item);
      return (
        step ??
        parseGeneratedStep(
          { step: item.step, concept: item.concept, subtitle: item.subtitle, elements: [] },
          item.step - 1
        )
      );
    })
  );
  const generatedSteps = drafted.filter((step): step is GeminiCanvasStep => step !== null);
  if (generatedSteps.length === 0) {
    throw new Error("Simulation generation failed: the model did not return valid steps.");
  }

  const hasTreeNodes = generatedSteps.some((step) =>
    (step.canvas_instructions?.elements ?? []).some(
      (element) => normalizeElementType((element as Record<string, unknown>).type) === "tree_node"
    )
  );
  const validatedSteps = hasTreeNodes ? validateAndRepairBstSteps(generatedSteps) : generatedSteps;
  const labeledSteps = enforceMeaningfulElementLabels(topic, validatedSteps);
  const repairedSteps = applyTopicRepairs(topic, labeledSteps);
  const alignedSteps = repairedSteps.map((step) => enforceSubtitleVisualAlignment(step));

  // Phase 3: concurrent repair of the weak steps only.
  const qualityImprovedSteps = await regenerateLowQualitySteps(topic, level, alignedSteps, plans);
  const finalLabeledSteps = enforceMeaningfulElementLabels(topic, qualityImprovedSteps);
  const finalRepairedSteps = applyTopicRepairs(topic, finalLabeledSteps);
  const finalAlignedSteps = finalRepairedSteps.map((step) => enforceSubtitleVisualAlignment(step));
  const finalRenderableSteps = ensureRenderableElementsFromSubtitle(topic, finalAlignedSteps);

  console.log(
    `[Simulation] "${topic}" (${level}) generated ${finalRenderableSteps.length} steps in ` +
      `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  );
  return { steps: finalRenderableSteps };
}

function toCanvasPercentX(x: number): number {
  return clamp(((x + 8) / 16) * 100, 6, 94);
}

function toCanvasPercentY(y: number): number {
  return clamp(((5 - y) / 10) * 100, 8, 92);
}

function mapObjectTypeToCanvasType(type: SimObject["type"]): CanvasElementType {
  if (type === "box" || type === "plane") {
    return "rectangle";
  }
  if (type === "sphere") {
    return "circle";
  }
  if (type === "cylinder") {
    return "ellipse";
  }
  if (type === "cone") {
    return "triangle";
  }
  if (type === "line") {
    return "line";
  }
  if (type === "arrow") {
    return "arrow";
  }
  if (type === "text") {
    return "text";
  }
  return "pulse";
}

function mapMovementToAnimation(movement: SimStep["movements"][number] | undefined): GeminiCanvasElement["animation"] {
  if (!movement) {
    return {
      type: "fade_in",
      duration: 900,
      direction: "none",
      represents: "introduces this concept element"
    };
  }
  if (movement.type === "translate") {
    return {
      type: "move",
      duration: clamp(Math.round(movement.durationMs ?? 1100), 200, 10000),
      direction: "left_to_right",
      represents: "shows state progression through the process"
    };
  }
  if (movement.type === "rotate") {
    return {
      type: "rotate",
      duration: clamp(Math.round(movement.durationMs ?? 1300), 200, 10000),
      direction: "clockwise",
      represents: "shows iterative transformation"
    };
  }
  if (movement.type === "scale") {
    return {
      type: "scale",
      duration: clamp(Math.round(movement.durationMs ?? 1000), 200, 10000),
      direction: "outward",
      represents: "shows magnitude change"
    };
  }
  if (movement.type === "pulse") {
    return {
      type: "pulse",
      duration: clamp(Math.round(movement.durationMs ?? 900), 200, 10000),
      direction: "none",
      represents: "highlights an active step"
    };
  }
  return {
    type: "fade_in",
    duration: 900,
    direction: "none",
    represents: "introduces this concept element"
  };
}

function convertTemplateToCanvasSteps(topic: Topic): GeminiCanvasStep[] {
  const templateBase = buildTemplateSimulationSteps(topic);
  const templateSteps = normalizeSimulationSteps(templateBase, templateBase, topic.title);

  return templateSteps.map((step, stepIndex) => {
    const movementByObject = new Map(step.movements.map((movement) => [movement.objectId, movement]));
    const objectById = new Map(step.objects.map((item) => [item.id, item]));

    const elements: GeminiCanvasElement[] = step.objects.map((object, objectIndex) => {
      const movement = movementByObject.get(object.id);
      return {
        type: mapObjectTypeToCanvasType(object.type),
        x: toCanvasPercentX(object.position.x),
        y: toCanvasPercentY(object.position.y),
        width: clamp(Math.round(object.size.x * 8), 4, 24),
        height: clamp(Math.round(object.size.y * 8), 3, 24),
        color: normalizeHexColor(object.color, "#00d4ff"),
        label: (object.label || object.id || `Element ${objectIndex + 1}`).slice(0, 180),
        label_position: "above",
        animation: mapMovementToAnimation(movement)
      };
    });

    step.connections.forEach((connection, connectionIndex) => {
      const from = objectById.get(connection.fromId);
      const to = objectById.get(connection.toId);
      if (!from || !to) {
        return;
      }
      const x1 = toCanvasPercentX(from.position.x);
      const y1 = toCanvasPercentY(from.position.y);
      const x2 = toCanvasPercentX(to.position.x);
      const y2 = toCanvasPercentY(to.position.y);
      elements.push({
        type: connection.type === "dashed" ? "dashed line" : connection.type === "arrow" ? "arrow" : "line",
        x: Number(((x1 + x2) / 2).toFixed(2)),
        y: Number(((y1 + y2) / 2).toFixed(2)),
        width: clamp(Math.abs(x2 - x1), 4, 50),
        height: clamp(Math.abs(y2 - y1) || 1.4, 1, 24),
        color: normalizeHexColor(connection.color, "#93c5fd"),
        label: (connection.label || `Flow ${connectionIndex + 1}`).slice(0, 180),
        label_position: "above",
        animation: {
          type: "draw",
          duration: 900 + connectionIndex * 110,
          direction: "left_to_right",
          represents: "shows relation between connected elements"
        }
      });
    });

    const normalizedStep = simCanvasStepSchema.safeParse({
      step: stepIndex + 1,
      concept: step.concept || `Step ${stepIndex + 1}`,
      subtitle: step.annotation,
      canvas_instructions: {
        elements: elements.slice(0, 220)
      }
    });

    if (normalizedStep.success) {
      return normalizedStep.data;
    }

    return {
      step: stepIndex + 1,
      concept: (step.concept || `Step ${stepIndex + 1}`).slice(0, 220),
      subtitle: step.annotation.slice(0, 1200),
      canvas_instructions: {
        elements: [
          {
            type: "text",
            x: 50,
            y: 50,
            width: 30,
            height: 6,
            color: "#00d4ff",
            label: step.annotation.slice(0, 160),
            label_position: "above",
            animation: {
              type: "fade_in",
              duration: 900,
              direction: "none",
              represents: "fallback annotation display"
            }
          }
        ]
      }
    };
  });
}

async function generateChatReply(
  topicTitle: string,
  message: string,
  mode: "voice" | "text",
  context: Array<{ role: "user" | "assistant"; text: string; timestamp?: string }>
): Promise<string | null> {
  const text = await generateText(buildChatPrompt(message, context), {
    system: buildChatSystemPrompt(topicTitle, mode),
    maxTokens: 400,
    temperature: 0.3,
    tag: "chat"
  });
  return text ? text.slice(0, 900) : null;
}

async function analyzeVoiceAction(
  topicTitle: string,
  userSpeech: string,
  stepConcept: string,
  stepNumber: number
): Promise<{
  action_type: string;
  action_params: Record<string, unknown>;
  spoken_response: string;
  feedback: string;
  requires_animation: boolean;
}> {
  const parsed = (await generateJson(
    buildVoiceActionPrompt({ topicTitle, userSpeech, stepConcept, stepNumber }),
    {
      system: VOICE_ACTION_SYSTEM_PROMPT,
      jsonSchema: VOICE_ACTION_SCHEMA,
      maxTokens: 300,
      temperature: 0.1,
      tag: "voice-action"
    }
  )) as Record<string, unknown>;

  // Structured Outputs requires every parameter key; drop the ones the model left null.
  const rawParams =
    parsed.action_params && typeof parsed.action_params === "object" && !Array.isArray(parsed.action_params)
      ? (parsed.action_params as Record<string, unknown>)
      : {};
  const actionParams = Object.fromEntries(
    Object.entries(rawParams).filter(([, value]) => value !== null && value !== undefined)
  );

  return {
    action_type: typeof parsed.action_type === "string" ? parsed.action_type : "general_answer",
    action_params: actionParams,
    spoken_response:
      typeof parsed.spoken_response === "string" && parsed.spoken_response.trim().length > 0
        ? parsed.spoken_response.trim()
        : "I heard you. I will adjust the simulation accordingly.",
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    requires_animation: Boolean(parsed.requires_animation)
  };
}

function defaultVoiceSettings(): VoiceSettings {
  return {
    narrationEnabled: true,
    interactionEnabled: true,
    navigationEnabled: true,
    rate: 1,
    voiceName: ""
  };
}

function getNextLevel(level: DifficultyLevel): DifficultyLevel | null {
  const index = LEVELS.indexOf(level);
  if (index === -1 || index === LEVELS.length - 1) {
    return null;
  }
  return LEVELS[index + 1];
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "interactive-tech-tutor-api", commit: process.env.DEPLOYED_COMMIT ?? "dev" });
});

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid registration payload." });
    return;
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPassword = password.trim();
  if (normalizedPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters after trimming." });
    return;
  }
  const normalizedName = (name?.trim() || normalizedEmail.split("@")[0] || "Learner").slice(0, 80);
  const now = new Date().toISOString();
  if (findUserByEmail(normalizedEmail)) {
    res.status(409).json({ error: "User already exists." });
    return;
  }

  const userId = randomUUID();
  const created = createUser({
    id: userId,
    name: normalizedName,
    email: normalizedEmail,
    passwordHash: await hashPassword(normalizedPassword),
    createdAt: now,
    lastLoginAt: now
  });
  if (!created) {
    res.status(409).json({ error: "User already exists." });
    return;
  }

  ensurePreferences({ userId, interactionMode: "both", voiceSettings: defaultVoiceSettings() });

  const token = createToken({ userId, email: normalizedEmail });
  saveSession(token, userId);
  res.status(201).json({
    token,
    user: { id: userId, name: normalizedName, email: normalizedEmail, lastLoginAt: now }
  });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login payload." });
    return;
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPassword = password.trim();
  if (normalizedPassword.length < 8) {
    res.status(400).json({ error: "Invalid email or password." });
    return;
  }
  const now = new Date().toISOString();

  const user = findUserByEmail(normalizedEmail);
  if (!user || !(await verifyPassword(normalizedPassword, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  touchLastLogin(user.id, now);
  ensurePreferences({ userId: user.id, interactionMode: "both", voiceSettings: defaultVoiceSettings() });

  const token = createToken({ userId: user.id, email: user.email });
  saveSession(token, user.id);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, lastLoginAt: now } });
  })
);

app.get("/api/topics", authMiddleware, (_req, res) => {
  res.json({ topics: TOPICS });
});

app.get("/api/topics/:topicId/problem-sets", authMiddleware, (req, res) => {
  const topicId = req.params.topicId;
  const sets = PROBLEM_SETS.filter((set) => set.topicId === topicId);
  if (!sets.length) {
    res.status(404).json({ error: "No problem sets found for topic." });
    return;
  }
  res.json({ problemSets: sets });
});

app.get(
  "/api/progress",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({ progress: listProgress(req.auth!.userId) });
  })
);

app.post(
  "/api/progress/update",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = progressUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid progress payload." });
    return;
  }

  const userId = req.auth!.userId;
  const payload = parsed.data;
  const now = new Date().toISOString();

  const result = inTransaction(() => {
    const updatedRecord: ProgressRecord = {
      userId,
      topicId: payload.topicId,
      level: payload.level,
      status: payload.status,
      score: payload.score,
      timeSpent: payload.timeSpent,
      updatedAt: now
    };
    upsertProgress(updatedRecord);

    const matchingProblemSet = PROBLEM_SETS.find(
      (problemSet) => problemSet.topicId === payload.topicId && problemSet.level === payload.level
    );
    const passingScore = matchingProblemSet?.passingScore ?? 70;
    const unlockedLevel =
      payload.status === "completed" && payload.score >= passingScore ? getNextLevel(payload.level) : null;

    if (unlockedLevel) {
      insertProgressIfMissing({
        userId,
        topicId: payload.topicId,
        level: unlockedLevel,
        status: "not-started",
        score: 0,
        timeSpent: 0,
        updatedAt: now
      });
    }

    return { progress: updatedRecord, unlockedLevel };
  });

  res.json(result);
  })
);

app.get(
  "/api/preferences",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const preferences = getPreferences(req.auth!.userId);
  if (!preferences) {
    res.status(404).json({ error: "Preferences not found." });
    return;
  }
  res.json({ preferences });
  })
);

app.put(
  "/api/preferences",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid preference payload." });
    return;
  }

  const preferences: UserPreferences = {
    userId: req.auth!.userId,
    interactionMode: parsed.data.interactionMode,
    voiceSettings: parsed.data.voiceSettings
  };
  upsertPreferences(preferences);

  res.json({ preferences });
  })
);

app.get(
  "/api/history",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const topicId = typeof req.query.topicId === "string" ? req.query.topicId : undefined;
  res.json({ history: listHistory(req.auth!.userId, topicId) });
  })
);

app.delete(
  "/api/history/topic/:topicId",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const topicId = req.params.topicId;
  const removedCount = deleteHistoryByTopic(req.auth!.userId, topicId);
  res.json({ removedCount, topicId });
  })
);

app.post(
  "/api/interactions",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid interaction payload." });
    return;
  }

  const userId = req.auth!.userId;
  const payload = parsed.data;
  const interaction: InteractionRecord = {
    id: randomUUID(),
    userId,
    topicId: payload.topicId,
    type: payload.type,
    input: payload.input,
    output: payload.output,
    timestamp: new Date().toISOString(),
    meta: payload.meta
  };

  await appendHistorySafely(interaction);

  res.status(201).json({ interaction });
  })
);

type SimulationResponsePayload = {
  topic: Topic;
  problemSets: ProblemSet[];
  openingMessage: string;
  generationSource: "template" | "ai";
  explanation_script: string;
  simulation_steps: unknown[];
};

// Concurrent requests for the same topic share one generation instead of paying for it twice.
const inflightSimulations = new Map<string, Promise<SimulationResponsePayload>>();

async function buildSimulationResponse(
  requestedTopic: string,
  level: DifficultyLevel
): Promise<SimulationResponsePayload> {
  const topic = buildGeneratedTopic(requestedTopic, level);
  let simulationSteps: GeminiCanvasStep[] = [];
  let openingMessage = `Generated a live simulation plan for ${topic.title}.`;
  let generationSource: "template" | "ai" = "ai";
  let generationError = "";
  try {
    const generated = await generateSimulationFromGemini(requestedTopic, level);
    simulationSteps = generated.steps;
  } catch (error) {
    generationError = (error as Error).message;
    console.error("[Simulation] AI generation failed, falling back to template:", generationError);
  }
  if (simulationSteps.length === 0) {
    generationSource = "template";
    simulationSteps = convertTemplateToCanvasSteps(topic);
    openingMessage = generationError
      ? `Generated with template fallback because the AI model failed: ${generationError.slice(0, 120)}`
      : `Generated with template fallback for ${topic.title}.`;
  }
  const narration = normalizeNarration(simulationSteps.map((step) => step.subtitle));
  if (narration.length > 0) {
    topic.narration = narration;
  }
  if (simulationSteps[0]?.subtitle) {
    openingMessage = simulationSteps[0].subtitle.slice(0, 700);
  }
  const explanationScript = simulationSteps
    .map((step, index) => `Step ${index + 1} (${step.concept}): ${step.subtitle}`)
    .join(" ")
    .slice(0, 2800);
  topic.description = explanationScript.slice(0, 1400);

  return {
    topic,
    problemSets: normalizeProblemSets(topic),
    openingMessage,
    generationSource,
    explanation_script: explanationScript,
    simulation_steps: simulationSteps
  };
}

app.post(
  "/api/ai/simulation",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = simulationGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid simulation generation payload." });
    return;
  }

  const { topic: requestedTopic, level } = parsed.data;
  const cacheKey = `${SIMULATION_CACHE_SCHEMA_VERSION}::${level}::${requestedTopic.trim().toLowerCase()}`;

  const hot = simulationResponseCache.get(cacheKey);
  if (hot && Date.now() - hot.cachedAt <= SIMULATION_CACHE_TTL_MS) {
    res.json(JSON.parse(JSON.stringify(hot.payload)) as SimulationResponsePayload);
    return;
  }

  const persisted = getCachedSimulation<SimulationResponsePayload>(cacheKey, SIMULATION_PERSISTED_TTL_MS);
  if (persisted) {
    simulationResponseCache.set(cacheKey, { cachedAt: Date.now(), payload: persisted });
    res.json(persisted);
    return;
  }

  let pending = inflightSimulations.get(cacheKey);
  const isOwner = !pending;
  if (!pending) {
    pending = buildSimulationResponse(requestedTopic, level).finally(() => {
      inflightSimulations.delete(cacheKey);
    });
    inflightSimulations.set(cacheKey, pending);
  }
  const responsePayload = await pending;

  if (isOwner) {
    await appendHistorySafely({
      id: randomUUID(),
      userId: req.auth!.userId,
      topicId: responsePayload.topic.id,
      type: "text",
      input: requestedTopic,
      output: responsePayload.openingMessage,
      timestamp: new Date().toISOString(),
      meta: { source: "simulation-generator", level, generationSource: responsePayload.generationSource }
    });
    // Template fallbacks are never cached, so one transient model failure cannot stick.
    if (responsePayload.generationSource === "ai") {
      simulationResponseCache.set(cacheKey, {
        cachedAt: Date.now(),
        payload: JSON.parse(JSON.stringify(responsePayload)) as SimulationResponsePayload
      });
      try {
        putCachedSimulation(cacheKey, responsePayload);
      } catch (error) {
        console.warn("[Simulation] Unable to persist simulation cache. Continuing without it.", error);
      }
    }
  }

  res.json(responsePayload);
  })
);

app.post(
  "/api/ai/chat",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    topicId: z.string().min(1),
    message: z.string().min(1),
    mode: z.enum(["voice", "text"]).default("text"),
    context: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string().min(1),
          timestamp: z.string().optional()
        })
      )
      .default([])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chat payload." });
    return;
  }

  const { topicId, message, mode, context } = parsed.data;
  const topic = TOPICS.find((item) => item.id === topicId);
  const topicTitle = topic?.title ?? topicId;
  let responseText = topic
    ? `In ${topic.title}, focus on this next: ${message.slice(0, 120)}. Try the current ${mode} prompt, then validate with the active problem set.`
    : `I can help with that question. Start by clarifying the current topic and desired difficulty level.`;

  try {
    const geminiReply = await generateChatReply(topicTitle, message, mode, context);
    if (geminiReply) {
      responseText = geminiReply;
    }
  } catch (error) {
    console.error("Chat fallback to template:", error);
  }

  const interaction: InteractionRecord = {
    id: randomUUID(),
    userId: req.auth!.userId,
    topicId,
    type: mode,
    input: message,
    output: responseText,
    timestamp: new Date().toISOString(),
    meta: { source: "chat" }
  };

  await appendHistorySafely(interaction);

  res.json({ response: responseText });
  })
);

app.post(
  "/api/ai/voice-action",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    topicId: z.string().min(1),
    userSpeech: z.string().min(1),
    stepConcept: z.string().min(1).default("Current step"),
    stepNumber: z.number().int().min(1).default(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid voice action payload." });
    return;
  }

  const { topicId, userSpeech, stepConcept, stepNumber } = parsed.data;
  const topic = TOPICS.find((item) => item.id === topicId);
  const topicTitle = topic?.title ?? topicId;

  try {
    const action = await analyzeVoiceAction(topicTitle, userSpeech, stepConcept, stepNumber);
    res.json(action);
  } catch (error) {
    console.error("Voice action fallback:", error);
    res.json({
      action_type: "general_answer",
      action_params: {},
      spoken_response: "I heard you. Please try again in a moment.",
      feedback: "",
      requires_animation: false
    });
  }
  })
);

app.post(
  "/api/ai/feedback/action",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    topicId: z.string().min(1),
    actionType: z.enum(["drag", "scroll", "back", "voice-command", "navigation"]),
    detail: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid action payload." });
    return;
  }

  const { topicId, actionType, detail } = parsed.data;
  const actionMap: Record<string, string> = {
    drag: "Drag action analyzed. Keep aligning moving elements with the highlighted zone.",
    scroll: "Scroll pattern captured. Pace your review so each concept is fully processed.",
    back: "Backward navigation detected. Revisiting this step reinforces retention.",
    "voice-command":
      "Voice command processed. Your instruction was interpreted and applied to the active learning flow.",
    navigation:
      "Navigation action evaluated. Maintain clear step sequencing so the simulation context stays coherent."
  };
  const responseText = `${actionMap[actionType]} Detail: ${detail.slice(0, 120)}`;

  const interaction: InteractionRecord = {
    id: randomUUID(),
    userId: req.auth!.userId,
    topicId,
    type: "action",
    input: `${actionType}:${detail}`,
    output: responseText,
    timestamp: new Date().toISOString(),
    meta: { source: "feedback" }
  };

  await appendHistorySafely(interaction);

  res.json({ response: responseText });
  })
);

app.post(
  "/api/ai/visual",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    topicId: z.string().min(1),
    fileName: z.string().min(1),
    fileType: z.string().min(1),
    size: z.number().min(0)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visual payload." });
    return;
  }

  const { topicId, fileName, fileType, size } = parsed.data;
  const summary = `Visual input received: ${fileName} (${fileType}, ${Math.round(size / 1024)} KB). Analysis suggests mapping this material to the active topic workflow before solving advanced problems.`;

  const interaction: InteractionRecord = {
    id: randomUUID(),
    userId: req.auth!.userId,
    topicId,
    type: "visual",
    input: fileName,
    output: summary,
    timestamp: new Date().toISOString(),
    meta: { fileType, size }
  };

  await appendHistorySafely(interaction);

  res.json({ response: summary });
  })
);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) {
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error.";
  const status = message.includes("not allowed by CORS") ? 403 : 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: message });
});

async function startServer(): Promise<void> {
  assertAuthConfigured();
  initDb();
  const expiredSessions = deleteExpiredSessions();
  const prunedCache = pruneSimulationCache(SIMULATION_PERSISTED_TTL_MS);
  console.log(`[DB] Removed ${expiredSessions} expired sessions and ${prunedCache} stale cache entries.`);
  if (!isLlmConfigured()) {
    console.warn("[LLM] Azure OpenAI is not configured; simulations will use the template fallback.");
  }
  app.listen(port, () => {
    console.log(`Interactive Tech Tutor API running on http://localhost:${port}`);
  });
}

void startServer().catch((error) => {
  console.error("Failed to start Interactive Tech Tutor API:", error);
  process.exit(1);
});


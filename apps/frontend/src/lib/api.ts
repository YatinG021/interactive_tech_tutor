"use client";

import type {
  AuthResponse,
  ChatMessage,
  DifficultyLevel,
  InteractionRecord,
  ProblemSet,
  ProgressRecord,
  ProgressStatus,
  SimulationResponse,
  Topic,
  UserPreferences,
  VoiceActionResponse
} from "./types";

// Base URL including /api, e.g. https://itt-api.<id>.koreacentral.azurecontainerapps.io/api
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
const HEALTH_URL = API_BASE_URL.replace(/\/api$/, "/health");

export const TOKEN_KEY = "itt_token";
export const USER_KEY = "itt_user";
export const FORCE_LOGOUT_EVENT = "itt:force-logout";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: { timeoutMs?: number; auth?: boolean } = {}
): Promise<T> {
  const { timeoutMs = 20000, auth = true } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = auth ? readToken() : null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.", 408);
    }
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { error: raw };
    }
  }

  if (!response.ok) {
    const message = String(payload.error ?? `Request failed (${response.status}).`);
    if (response.status === 401 && auth) {
      window.dispatchEvent(new CustomEvent(FORCE_LOGOUT_EVENT, { detail: message }));
    }
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

/** Wakes the API (it scales to zero when idle). Never throws. */
export async function wakeApi(): Promise<void> {
  try {
    await fetch(HEALTH_URL, { method: "GET" });
  } catch {
    // ignore
  }
}

export const api = {
  register: (body: { name?: string; email: string; password: string }) =>
    request<AuthResponse>("POST", "/auth/register", body, { auth: false }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("POST", "/auth/login", body, { auth: false }),

  topics: () => request<{ topics: Topic[] }>("GET", "/topics"),
  problemSets: (topicId: string) =>
    request<{ problemSets: ProblemSet[] }>("GET", `/topics/${encodeURIComponent(topicId)}/problem-sets`),

  progress: () => request<{ progress: ProgressRecord[] }>("GET", "/progress"),
  updateProgress: (body: {
    topicId: string;
    level: DifficultyLevel;
    status: ProgressStatus;
    score: number;
    timeSpent: number;
    passingScore?: number;
  }) => request<{ progress: ProgressRecord; unlockedLevel: DifficultyLevel | null }>("POST", "/progress/update", body),

  preferences: () => request<{ preferences: UserPreferences }>("GET", "/preferences"),
  savePreferences: (body: Omit<UserPreferences, "userId">) =>
    request<{ preferences: UserPreferences }>("PUT", "/preferences", body),

  history: (topicId?: string) =>
    request<{ history: InteractionRecord[] }>(
      "GET",
      `/history${topicId ? `?topicId=${encodeURIComponent(topicId)}` : ""}`
    ),
  deleteHistory: (topicId: string) =>
    request<{ removedCount: number; topicId: string }>("DELETE", `/history/topic/${encodeURIComponent(topicId)}`),

  // A fresh topic takes 20-40 s to generate; cached topics return in under a second.
  simulation: (body: { topic: string; level: DifficultyLevel }) =>
    request<SimulationResponse>("POST", "/ai/simulation", body, { timeoutMs: 150000 }),
  chat: (body: {
    topicId: string;
    topicTitle: string;
    message: string;
    mode: "text" | "voice";
    context: ChatMessage[];
  }) => request<{ response: string }>("POST", "/ai/chat", body, { timeoutMs: 45000 }),
  voiceAction: (body: {
    topicId: string;
    topicTitle: string;
    userSpeech: string;
    stepConcept: string;
    stepNumber: number;
  }) => request<VoiceActionResponse>("POST", "/ai/voice-action", body, { timeoutMs: 30000 }),
  recordInteraction: (body: {
    topicId: string;
    type: "voice" | "text" | "action" | "visual";
    input: string;
    output: string;
    meta?: Record<string, unknown>;
  }) => request<{ interaction: InteractionRecord }>("POST", "/interactions", body),
  actionFeedback: (body: {
    topicId: string;
    actionType: "drag" | "scroll" | "back" | "voice-command" | "navigation";
    detail: string;
  }) => request<{ response: string }>("POST", "/ai/feedback/action", body),
  visual: (body: { topicId: string; fileName: string; fileType: string; size: number }) =>
    request<{ response: string }>("POST", "/ai/visual", body)
};

// Mirrors docs/API_REFERENCE.md. Keep in sync with apps/api/src.

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";
export const LEVELS: DifficultyLevel[] = ["beginner", "intermediate", "advanced"];

export interface User {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  narration: string[];
  visualTheme: string;
}

export interface Problem {
  id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
}

export interface ProblemSet {
  topicId: string;
  level: DifficultyLevel;
  passingScore: number;
  problems: Problem[];
}

export type ProgressStatus = "not-started" | "in-progress" | "completed";

export interface ProgressRecord {
  userId: string;
  topicId: string;
  level: DifficultyLevel;
  status: ProgressStatus;
  score: number;
  timeSpent: number;
  updatedAt: string;
}

export interface VoiceSettings {
  narrationEnabled: boolean;
  interactionEnabled: boolean;
  navigationEnabled: boolean;
  rate: number;
  voiceName: string;
}

export interface UserPreferences {
  userId: string;
  interactionMode: "voice" | "click" | "both";
  voiceSettings: VoiceSettings;
}

export interface InteractionRecord {
  id: string;
  userId: string;
  topicId: string;
  type: "voice" | "text" | "action" | "visual";
  input: string;
  output: string;
  timestamp: string;
  meta: Record<string, unknown>;
}

export interface CanvasElement {
  type: string;
  label?: string;
  [key: string]: unknown;
}

export interface SimulationStep {
  step: number;
  concept: string;
  subtitle: string;
  duration_ms?: number | null;
  canvas_instructions: { elements: CanvasElement[] };
}

export interface SimulationResponse {
  topic: Topic;
  problemSets: ProblemSet[];
  openingMessage: string;
  generationSource: "ai" | "template" | "featured";
  explanation_script: string;
  simulation_steps: SimulationStep[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
}

export const VOICE_ACTIONS = [
  "answer_question",
  "move_element",
  "modify_element",
  "play",
  "pause",
  "next_step",
  "previous_step",
  "jump_to_step",
  "restart",
  "open_menu",
  "close_menu",
  "toggle_subtitles",
  "toggle_voice",
  "not_possible",
  "general_answer"
] as const;

export interface VoiceActionResponse {
  action_type: (typeof VOICE_ACTIONS)[number] | string;
  action_params: {
    element_label?: string;
    target_x?: number;
    target_y?: number;
    property?: string;
    new_value?: string;
    step_number?: number;
  };
  spoken_response: string;
  feedback: string;
  requires_animation: boolean;
}

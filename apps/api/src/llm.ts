import { AzureOpenAI } from "openai";

export interface JsonSchemaFormat {
  name: string;
  /** JSON Schema used for Structured Outputs (strict mode: every property required, no extras). */
  schema: Record<string, unknown>;
}

export interface LlmOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** When set, the reply is constrained to this schema. Otherwise JSON mode is used. */
  jsonSchema?: JsonSchemaFormat;
  /** Label used in logs. */
  tag?: string;
}

interface CompletionResult {
  text: string;
  truncated: boolean;
  finishReason: string;
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_API_VERSION = "2024-10-21";
const DEFAULT_MAX_CONCURRENCY = 6;
// The overflow deployment may be a reasoning model, whose hidden reasoning counts against
// max_completion_tokens. Give it extra room so the visible answer is not starved.
const OVERFLOW_TOKEN_MULTIPLIER = 3;

let cachedClient: AzureOpenAI | null = null;
// Parameters a deployment has rejected (e.g. reasoning models reject `temperature`), per deployment.
const unsupportedParams = new Map<string, Set<string>>();

// Environment is read lazily so that dotenv has loaded before first use.
function readConfig() {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT?.trim() ?? "",
    apiKey: process.env.AZURE_OPENAI_API_KEY?.trim() ?? "",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ?? "",
    // Optional second deployment used when the primary is rate-limited or failing.
    overflowDeployment: process.env.AZURE_OPENAI_OVERFLOW_DEPLOYMENT?.trim() ?? "",
    apiVersion: process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_API_VERSION,
    timeoutMs: Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    maxConcurrency: Math.max(1, Number(process.env.LLM_MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENCY))
  };
}

export function isLlmConfigured(): boolean {
  const { endpoint, apiKey, deployment } = readConfig();
  return Boolean(endpoint && apiKey && deployment);
}

function getClient(): AzureOpenAI {
  if (cachedClient) {
    return cachedClient;
  }
  if (!isLlmConfigured()) {
    throw new Error(
      "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT."
    );
  }
  const { endpoint, apiKey, apiVersion, timeoutMs } = readConfig();
  // No fixed deployment: each request names its deployment through `model`.
  cachedClient = new AzureOpenAI({ endpoint, apiKey, apiVersion, timeout: timeoutMs, maxRetries: 4 });
  return cachedClient;
}

// Process-wide cap on in-flight requests. Parallel fan-out stays fast without blowing the
// deployment's tokens-per-minute budget when several users generate at once.
let inFlight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  const { maxConcurrency } = readConfig();
  if (inFlight < maxConcurrency) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    next();
    return;
  }
  inFlight -= 1;
}

function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}

/** Rate limits, server errors and timeouts are worth sending to another deployment; 4xx are not. */
function isTransient(error: unknown): boolean {
  const status = errorStatus(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

async function callDeployment(
  deployment: string,
  request: {
    messages: Array<{ role: "system" | "user"; content: string }>;
    maxTokens: number;
    temperature: number;
    responseFormat: Record<string, unknown>;
    tag: string;
  },
  options: { maxRetries: number; overflow: boolean }
): Promise<CompletionResult> {
  const client = getClient();
  const { timeoutMs } = readConfig();
  const rejected = unsupportedParams.get(deployment) ?? new Set<string>();
  unsupportedParams.set(deployment, rejected);
  let maxTokens = options.overflow ? request.maxTokens * OVERFLOW_TOKEN_MULTIPLIER : request.maxTokens;
  let budgetRaised = false;
  const startedAt = Date.now();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await client.chat.completions.create(
        {
          model: deployment,
          messages: request.messages,
          max_completion_tokens: maxTokens,
          ...(rejected.has("temperature") ? {} : { temperature: request.temperature }),
          ...request.responseFormat
        },
        { maxRetries: options.maxRetries, timeout: options.overflow ? timeoutMs * 2 : timeoutMs }
      );
      const choice = response.choices[0];
      const usage = response.usage;
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      console.log(
        `[LLM] ${request.tag} ${deployment} ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
          `in=${usage?.prompt_tokens ?? "?"} (cached ${usage?.prompt_tokens_details?.cached_tokens ?? 0}) ` +
          `out=${usage?.completion_tokens ?? "?"} (reasoning ${reasoningTokens}) finish=${choice?.finish_reason}`
      );
      // A reasoning model can spend the whole budget thinking and return nothing. Retry once with room.
      if (choice?.finish_reason === "length" && reasoningTokens > 0 && !budgetRaised) {
        maxTokens *= 2;
        budgetRaised = true;
        continue;
      }
      return {
        text: choice?.message?.content?.trim() ?? "",
        truncated: choice?.finish_reason === "length",
        finishReason: choice?.finish_reason ?? "unknown"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Sampling parameters differ by model family. Remember a rejection and retry without it.
      if (errorStatus(error) === 400 && message.includes("temperature") && !rejected.has("temperature")) {
        rejected.add("temperature");
        console.warn(`[LLM] ${deployment} rejected "temperature"; retrying without it.`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`LLM request to ${deployment} did not complete.`);
}

async function complete(prompt: string, options: LlmOptions, mode: "text" | "json"): Promise<CompletionResult> {
  const { system, maxTokens = 1200, temperature = 0.2, jsonSchema, tag = "llm" } = options;
  const { deployment, overflowDeployment } = readConfig();
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  const responseFormat =
    mode === "json"
      ? jsonSchema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema }
            }
          }
        : { response_format: { type: "json_object" as const } }
      : {};
  const request = { messages, maxTokens, temperature, responseFormat, tag };

  getClient();
  await acquireSlot();
  try {
    if (!overflowDeployment) {
      return await callDeployment(deployment, request, { maxRetries: 4, overflow: false });
    }
    // Primary first without waiting on retries. If it is rate-limited or failing, use the overflow
    // deployment; if that fails too, go back to the primary and wait out its limit.
    try {
      return await callDeployment(deployment, request, { maxRetries: 0, overflow: false });
    } catch (error) {
      if (!isTransient(error)) {
        throw error;
      }
      console.warn(`[LLM] ${tag}: ${deployment} unavailable (${errorStatus(error) ?? "network"}), using ${overflowDeployment}.`);
    }
    try {
      return await callDeployment(overflowDeployment, request, { maxRetries: 1, overflow: true });
    } catch (error) {
      console.warn(`[LLM] ${tag}: ${overflowDeployment} failed (${errorStatus(error) ?? "network"}), retrying ${deployment}.`);
    }
    return await callDeployment(deployment, request, { maxRetries: 4, overflow: false });
  } catch (error) {
    console.error(`[LLM] ${tag} failed:`, error instanceof Error ? error.message : error);
    throw error;
  } finally {
    releaseSlot();
  }
}

export async function generateText(prompt: string, options: LlmOptions = {}): Promise<string> {
  const { text } = await complete(prompt, options, "text");
  return text;
}

export async function generateJson(prompt: string, options: LlmOptions = {}): Promise<unknown> {
  const { text, truncated, finishReason } = await complete(prompt, options, "json");
  if (!text) {
    throw new Error(`LLM returned an empty response (finish_reason=${finishReason}).`);
  }
  if (truncated) {
    throw new Error(
      `LLM response was cut off at the token limit (${options.maxTokens ?? "default"}); JSON is incomplete.`
    );
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    // JSON mode should prevent this; tolerate stray code fences defensively.
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  }
}

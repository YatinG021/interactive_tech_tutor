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

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_API_VERSION = "2024-10-21";
const DEFAULT_MAX_CONCURRENCY = 6;

let cachedClient: AzureOpenAI | null = null;
const unsupportedParams = new Set<string>();

// Environment is read lazily so that dotenv has loaded before first use.
function readConfig() {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT?.trim() ?? "",
    apiKey: process.env.AZURE_OPENAI_API_KEY?.trim() ?? "",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ?? "",
    apiVersion: process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_API_VERSION,
    timeoutMs: Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    // Set for reasoning deployments (gpt-5 / o-series): they reject `temperature` and take an effort level.
    reasoningEffort: process.env.AZURE_OPENAI_REASONING_EFFORT?.trim().toLowerCase() ?? "",
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
  const { endpoint, apiKey, deployment, apiVersion, timeoutMs } = readConfig();
  cachedClient = new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion,
    timeout: timeoutMs,
    maxRetries: 4
  });
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

async function complete(
  prompt: string,
  options: LlmOptions,
  mode: "text" | "json"
): Promise<{ text: string; truncated: boolean; finishReason: string }> {
  const { system, maxTokens = 1200, temperature = 0.2, jsonSchema, tag = "llm" } = options;
  const client = getClient();
  const { deployment, reasoningEffort } = readConfig();
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

  await acquireSlot();
  const startedAt = Date.now();
  try {
    // Sampling parameters differ by model family. If the service rejects one, remember that and retry
    // without it, so swapping the deployment never needs a code change.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await client.chat.completions.create({
          model: deployment,
          messages,
          max_completion_tokens: maxTokens,
          ...(reasoningEffort && !unsupportedParams.has("reasoning_effort")
            ? { reasoning_effort: reasoningEffort as "minimal" | "low" | "medium" | "high" }
            : {}),
          ...(!reasoningEffort && !unsupportedParams.has("temperature") ? { temperature } : {}),
          ...responseFormat
        });
        const choice = response.choices[0];
        const usage = response.usage;
        console.log(
          `[LLM] ${tag} ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
            `in=${usage?.prompt_tokens ?? "?"} (cached ${usage?.prompt_tokens_details?.cached_tokens ?? 0}) ` +
            `out=${usage?.completion_tokens ?? "?"} (reasoning ${usage?.completion_tokens_details?.reasoning_tokens ?? 0}) ` +
            `finish=${choice?.finish_reason}`
        );
        return {
          text: choice?.message?.content?.trim() ?? "",
          truncated: choice?.finish_reason === "length",
          finishReason: choice?.finish_reason ?? "unknown"
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const status = (error as { status?: number }).status;
        const rejected = (["reasoning_effort", "temperature"] as const).find(
          (param) => status === 400 && message.includes(param) && !unsupportedParams.has(param)
        );
        if (!rejected) {
          throw error;
        }
        unsupportedParams.add(rejected);
        console.warn(`[LLM] Deployment rejected "${rejected}"; retrying without it.`);
      }
    }
    throw new Error("LLM request failed after removing unsupported parameters.");
  } catch (error) {
    console.error(`[LLM] ${tag} failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s:`, {
      deployment,
      error: error instanceof Error ? error.message : error
    });
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

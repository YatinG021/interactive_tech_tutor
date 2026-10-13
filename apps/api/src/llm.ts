import { AzureOpenAI } from "openai";

export interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_API_VERSION = "2024-10-21";

let cachedClient: AzureOpenAI | null = null;

// Environment is read lazily so that dotenv has loaded before first use.
function readConfig() {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT?.trim() ?? "",
    apiKey: process.env.AZURE_OPENAI_API_KEY?.trim() ?? "",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ?? "",
    apiVersion: process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_API_VERSION,
    timeoutMs: Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  };
}

export function isLlmConfigured(): boolean {
  const { endpoint, apiKey, deployment } = readConfig();
  return Boolean(endpoint && apiKey && deployment);
}

function assertLlmConfigured(): void {
  if (!isLlmConfigured()) {
    throw new Error(
      "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT."
    );
  }
}

function getClient(): AzureOpenAI {
  if (cachedClient) {
    return cachedClient;
  }
  assertLlmConfigured();
  const { endpoint, apiKey, deployment, apiVersion, timeoutMs } = readConfig();
  cachedClient = new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion,
    timeout: timeoutMs,
    maxRetries: 1
  });
  return cachedClient;
}

async function complete(
  prompt: string,
  options: LlmOptions,
  json: boolean
): Promise<{ text: string; truncated: boolean }> {
  const { maxTokens = 1200, temperature = 0.2 } = options;
  const client = getClient();
  const { deployment } = readConfig();
  try {
    const response = await client.chat.completions.create({
      model: deployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: maxTokens,
      temperature,
      ...(json ? { response_format: { type: "json_object" as const } } : {})
    });
    const choice = response.choices[0];
    return {
      text: choice?.message?.content?.trim() ?? "",
      truncated: choice?.finish_reason === "length"
    };
  } catch (error) {
    console.error("[LLM invoke failed]", {
      deployment,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

export async function generateText(prompt: string, options: LlmOptions = {}): Promise<string> {
  const { text } = await complete(prompt, options, false);
  return text;
}

export async function generateJson(prompt: string, options: LlmOptions = {}): Promise<unknown> {
  const { text, truncated } = await complete(prompt, options, true);
  if (!text) {
    throw new Error("LLM returned an empty response.");
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

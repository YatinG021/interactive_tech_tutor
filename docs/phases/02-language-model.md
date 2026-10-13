# Phase 2: Language model (Bedrock → Azure OpenAI)

## Changes
- New `apps/api/src/services/llm.ts`: an `AzureOpenAI` client with `generateText()` and `generateJson()` (JSON mode, explicit error when output is truncated at the token limit).
- All five model calls (outline, step improvement, step alignment, chat, voice action) routed through it; `@aws-sdk/client-bedrock-runtime` removed.
- `generationSource: "bedrock"` renamed to `"ai"` in the API and the frontend together.
- `dotenv` loaded with a side-effect import, so modules that read the environment at load time see `.env`.

## Results (single calls, gpt-4.1-mini)
| Call | Time |
|---|---|
| Voice action | 1.9 s |
| Chat reply | 1.7 s |
| 10-step simulation in one call | 42 s |

The 42-second single call motivated the parallel pipeline in Phase 3–4.

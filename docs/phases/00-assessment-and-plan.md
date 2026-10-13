# Phase 0: Assessment and plan

## Starting point

The project was an AWS application: a React + Vite frontend and an Express + TypeScript API.

| Service | Used for |
|---|---|
| AWS Bedrock (Nova Pro) | Simulation generation, chat, voice-command interpretation |
| AWS DynamoDB | `itt-users`, `itt-sessions`, `itt-simulation-history` (the last was created but never used) |
| AWS S3 | Simulation cache (written but never read back) |
| AWS Amplify | Frontend hosting |
| Render / Vercel | API hosting / alternate frontend config |
| Google Gemini | Configured but unused |
| Local `store.json` | Progress, preferences and history, on an ephemeral disk, so it was lost on every redeploy |

Other findings: unsalted SHA-256 passwords, AWS access keys required just to start the server, and an API contract that leaked the provider name (`generationSource: "bedrock"`).

## Requirements (from [product/requirements.md](../product/requirements.md))

1. Visual simulations with moving elements
2. English narration with synchronised subtitles
3. Real-time voice or text interaction
4. Feedback on learner actions
5. Problem sets at beginner, intermediate and advanced levels
6. Authentication and progress tracking
7. Voice or click navigation
8. Camera and file input
9. Interaction history with per-topic deletion
10. Independent control of voice interaction and narration

## Target and mapping

| AWS / other | Replacement |
|---|---|
| Bedrock | Azure OpenAI (Microsoft Foundry) |
| DynamoDB + S3 + `store.json` | One SQLite database on an Azure Files share |
| Render | Azure Container Apps |
| Amplify / Vercel | GitHub Pages |
| IAM access keys | Container App secrets |

## Phase plan

| Phase | Scope |
|---|---|
| 0 | Prerequisites and decisions |
| 1 | Azure infrastructure |
| 2 | Replace the LLM layer |
| 3–4 | Replace the cache and the database |
| 5 | Containerise and deploy the backend |
| 6 | Frontend hosting and wiring |
| 7 | Cutover and cleanup |

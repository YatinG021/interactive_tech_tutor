# Backend Setup Guide

Startup requirements, configuration, data layout and test steps for the API in `apps/api`.

The backend runs on **Azure OpenAI** (Microsoft Foundry) for the AI features and a single **SQLite** file for all data. There are no AWS dependencies.

## 1. Environment variables

Copy `apps/api/.env.example` to `apps/api/.env`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Yes | none | `https://<resource>.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Yes | none | Key for the Foundry resource (keep out of git) |
| `AZURE_OPENAI_DEPLOYMENT` | Yes | none | Deployment name, e.g. `itt-llm` |
| `AZURE_OPENAI_API_VERSION` | No | `2024-10-21` | Azure OpenAI API version |
| `AZURE_OPENAI_TIMEOUT_MS` | No | `60000` | Per-request timeout |
| `LLM_MAX_CONCURRENCY` | No | `6` | Max in-flight model calls for the whole process |
| `AZURE_OPENAI_OVERFLOW_DEPLOYMENT` | No | unset | Second deployment used when the primary returns 429 or 5xx |
| `SARVAM_API_KEY` | No | unset | Sarvam AI key for natural narration (`/api/tts`); without it the browser voice is used |
| `SARVAM_TTS_MODEL` / `SARVAM_TTS_SPEAKER` | No | `bulbul:v4-flash` / `simran_en_edtech` | Voice model and persona |
| `TTS_DAILY_CHAR_LIMIT` | No | `8000` | Characters sent to Sarvam per UTC day; cached clips don't count |
| `JWT_SECRET` | Yes in production | dev value | Signs session tokens. The server refuses to start without it when `NODE_ENV=production` |
| `DATA_DIR` | No | `./data` | Directory holding `app.db`. In Azure, the mounted Azure Files share (`/data`) |
| `CACHE_VERSION` | No | `3` | Bump to invalidate every cached simulation |
| `SIMULATION_CACHE_TTL_HOURS` | No | `168` | Lifetime of a cached simulation |
| `PORT` | No | `4000` | HTTP port |
| `FRONTEND_ORIGINS`, `ALLOWED_ORIGINS`, `CORS_ORIGIN` | No | empty | Allowed browser origins (exact match) |
| `DEPLOYED_COMMIT` | No | `dev` | Reported by `/health`; set by CI |

If the Azure OpenAI variables are missing the server still starts and falls back to template simulations.

## 2. Data

Everything lives in `${DATA_DIR}/app.db`:

| Table | Contents |
|---|---|
| `users` | Accounts. Passwords are salted scrypt hashes. |
| `sessions` | Active sessions, keyed by a SHA-256 of the token. Expired rows are removed at startup. |
| `preferences` | Interaction mode and voice settings per user |
| `progress` | Completion status per user, topic and level |
| `history` | Interaction history, deleted per topic on request |
| `simulation_cache` | Generated simulations, shared across users and restarts |
| `tts_cache` | Narration audio (MP3) by model, voice and text |

The schema is created automatically at startup. There is nothing to provision.

Notes for hosting on Azure Files:
- Run **exactly one replica**. SQLite on SMB has no safe multi-writer mode.
- Mount the share with the `nobrl` option.
- WAL mode is not used on purpose (it does not work on SMB). The default rollback journal is used.

Backups:
```bash
npm run backup:export                      # writes apps/api/backups/store-<timestamp>.json
npm run backup:import -- <snapshot.json>   # replaces users, preferences, progress, history
```

## 3. How simulation generation works

1. **Outline** (one small call): 6-8 steps, each with a concept, subtitle and a visual plan that fixes the running example.
2. **Canvas** (one call per step, run in parallel): the drawable elements for each step.
3. **Repair** (parallel, at most 3 steps): only steps with real defects get a second pass.
4. Results are cached in memory and in SQLite. Concurrent requests for the same topic share one generation.

A cold 6-step simulation takes about 20 seconds; a cached one returns in milliseconds.

## 4. API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | no | Liveness and deployed commit |
| POST | `/api/auth/register` | no | Create an account, returns a token |
| POST | `/api/auth/login` | no | Returns a token |
| GET | `/api/topics`, `/api/topics/:topicId/problem-sets` | yes | Seed content |
| GET | `/api/progress` | yes | Progress records |
| POST | `/api/progress/update` | yes | Update progress; unlocks the next level when passed |
| GET, PUT | `/api/preferences` | yes | Interaction and voice preferences |
| GET | `/api/history` | yes | Interaction history (`?topicId=`) |
| DELETE | `/api/history/topic/:topicId` | yes | Delete history for one topic |
| POST | `/api/interactions` | yes | Record an interaction |
| POST | `/api/ai/simulation` | yes | Generate or fetch a simulation |
| POST | `/api/ai/chat` | yes | Tutor reply |
| POST | `/api/ai/voice-action` | yes | Map speech to a simulation command |
| POST | `/api/tts` | yes | Natural-voice narration audio (cached) |

## 5. Run locally

```bash
npm install
cp apps/api/.env.example apps/api/.env   # fill in the Azure OpenAI values
npm run dev:api                          # http://localhost:4000
npm run dev:frontend                     # http://localhost:3000
curl localhost:4000/health
```

## 6. Production checklist

- `JWT_SECRET` and `AZURE_OPENAI_API_KEY` come from Container App secrets, never from the repo.
- `DATA_DIR=/data` on the Azure Files mount, one replica.
- `FRONTEND_ORIGINS` lists the exact site origins.
- Keep the Azure OpenAI deployment's rate limits in mind: check the `x-ratelimit-limit-tokens` response header, because the enforced limit can be lower than the configured capacity on student subscriptions.

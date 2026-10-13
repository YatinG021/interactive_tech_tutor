# Interactive Tech Tutor

Type any technical topic and watch it explained as a narrated, animated, step-by-step simulation. Steer it by voice, ask a tutor follow-up questions, and pass a quiz at each of three levels.

- **Live site:** https://yating021.github.io/interactive_tech_tutor/
- **API:** https://itt-api.orangefield-ee93915e.koreacentral.azurecontainerapps.io (`/health`)

## What it does

- **Generated simulations.** Any topic becomes 6–8 animated diagram steps with narration and subtitles (about 20–40 s the first time, instant afterwards).
- **Curated simulations.** Five hand-built lessons with exact diagrams and topic-specific quizzes: binary search, binary search trees, Dijkstra's shortest path, the TLS 1.3 handshake, and virtual memory.
- **Natural narration.** Steps are read aloud with a Sarvam Bulbul voice; each clip is generated once and cached. The browser voice is the fallback.
- **Voice control.** "Next", "go to step 3", "pause", "move the resolver to the right".
- **Tutor chat.** Short, on-topic answers in text or voice.
- **Practice and progress.** Three levels per topic; passing one unlocks the next.

## Architecture

```
GitHub Pages (Next.js static export)  ──HTTPS──▶  Azure Container Apps (Express API, scales to zero)
                                                    ├─ Azure OpenAI: gpt-4.1-mini (primary), gpt-5-mini (overflow)
                                                    ├─ Sarvam AI: bulbul:v4-flash text-to-speech
                                                    └─ SQLite on an Azure Files share (/data)
```

| Part | Where | Notes |
|---|---|---|
| `apps/frontend` | GitHub Pages | Next.js 16, React 19, Tailwind 4, Motion. Has its own `node_modules` and lockfile. |
| `apps/api` | Azure Container Apps (Korea Central) | Express + TypeScript, image in GHCR |
| Data | Azure Files | One SQLite file: users, sessions, preferences, progress, history, simulation and audio caches |

Every push to `main` deploys automatically: `.github/workflows/deploy-backend.yml` (build image → roll out → smoke-test `/health` for the new commit) and `.github/workflows/deploy-frontend.yml` (static build → Pages).

## Run locally

```bash
npm install                              # API dependencies (root workspace)
npm --prefix apps/frontend install       # frontend dependencies (separate)

cp apps/api/.env.example apps/api/.env   # add Azure OpenAI and (optionally) Sarvam keys
echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > apps/frontend/.env.local

npm run dev:api                          # http://localhost:4000
npm run dev:frontend                     # http://localhost:3000
```

## Documentation

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md): every endpoint with request and response shapes
- [docs/UI_UX_PROMPT.md](docs/UI_UX_PROMPT.md): the design and product spec for the frontend
- [BACKEND_SETUP_GUIDE.md](BACKEND_SETUP_GUIDE.md): configuration, data layout and production checklist

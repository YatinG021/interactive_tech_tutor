# Interactive Tech Tutor: the beginner's guide

This guide explains the whole project to someone who has never seen it and is new to web development or the cloud. Read it top to bottom once. Then use the other documents in [docs/](README.md) for detail.

- **Live site:** https://yating021.github.io/interactive_tech_tutor/
- **Live API (backend):** https://itt-api.orangefield-ee93915e.koreacentral.azurecontainerapps.io/health
- **Repository:** https://github.com/YatinG021/interactive_tech_tutor

---

## Contents

1. [What the product does](#1-what-the-product-does)
2. [The big picture in one diagram](#2-the-big-picture-in-one-diagram)
3. [Words you need to know](#3-words-you-need-to-know)
4. [The tech stack and why each piece was chosen](#4-the-tech-stack-and-why-each-piece-was-chosen)
5. [Development tools](#5-development-tools)
6. [A tour of the folders](#6-a-tour-of-the-folders)
7. [What happens when you generate a lesson, step by step](#7-what-happens-when-you-generate-a-lesson-step-by-step)
8. [The backend, file by file](#8-the-backend-file-by-file)
9. [The frontend, file by file](#9-the-frontend-file-by-file)
10. [The data: what is stored and where](#10-the-data-what-is-stored-and-where)
11. [The cloud: what runs where](#11-the-cloud-what-runs-where)
12. [How code gets from your laptop to the live site](#12-how-code-gets-from-your-laptop-to-the-live-site)
13. [Running it on your own computer](#13-running-it-on-your-own-computer)
14. [Configuration and secrets](#14-configuration-and-secrets)
15. [How the project was built: phases and stages](#15-how-the-project-was-built-phases-and-stages)
16. [Problems we hit and what they teach](#16-problems-we-hit-and-what-they-teach)
17. [Where to change things](#17-where-to-change-things)
18. [What the project does not do (yet)](#18-what-the-project-does-not-do-yet)
19. [FAQ](#19-faq)

---

## 1. What the product does

Interactive Tech Tutor turns a technical topic into a **narrated, animated lesson**.

1. You sign up and sign in.
2. You type a topic, for example "How DNS resolution works", and pick a level: beginner, intermediate or advanced.
3. About 20 seconds later you get a lesson of 6–8 **steps**. Each step is:
   - a **diagram** drawn on the screen (boxes, nodes, arrows, bars, trees, tables) that animates;
   - a **subtitle**, read aloud by a natural-sounding voice.
4. While you watch, you can:
   - play, pause and jump between steps;
   - speak commands ("next step", "pause", "move the server to the right");
   - ask an AI **tutor** questions by typing or speaking;
   - take a **quiz** at each level. Passing unlocks the next level.
5. Your progress and history are saved to your account.

There are also **five curated lessons**, hand-built with exact diagrams, that open instantly:

| Lesson | Subject | Difficulty |
|---|---|---|
| Binary search | Data structures and algorithms | Easy |
| Binary search trees | Data structures and algorithms | Medium |
| Dijkstra's shortest path | Data structures and algorithms | Hard |
| The TLS 1.3 handshake | Networking and security | Medium |
| Virtual memory and address translation | Operating systems | Hard |

**Why it exists:** technical ideas are *processes* (a pointer moves, a message is sent, a value updates). Text describes the end state. An animated diagram with narration shows the process happening.

---

## 2. The big picture in one diagram

```
        YOUR BROWSER
   ┌───────────────────────────┐
   │  The website (frontend)   │   Next.js + React + Tailwind
   │  - pages, buttons, player │
   │  - draws diagrams on a    │
   │    <canvas>               │
   └──────┬──────────────┬─────┘
          │ downloads    │ asks for data (HTTPS + login token)
          │ the pages    │
          ▼              ▼
   GitHub Pages     Azure Container Apps  ← the backend (API), Node.js + Express
   (free static      │
    hosting)         ├──► Azure OpenAI    ← the AI model that writes lessons and answers
                     ├──► Sarvam AI       ← turns subtitles into a human voice
                     └──► Azure Files     ← a network drive holding the SQLite database
```

There are **two programs**:

- **The frontend** is the website. It is just files (HTML, JavaScript, CSS) that your browser downloads and runs. It has no secret keys and stores nothing permanent of its own.
- **The backend** (also called "the API") is a server program. It checks who you are, talks to the AI and voice services using secret keys, and saves your data.

They talk over HTTP using **JSON**. For example, the frontend sends `POST /api/ai/simulation {"topic": "DNS", "level": "beginner"}` and the backend replies with the steps.

---

## 3. Words you need to know

| Term | Meaning in this project |
|---|---|
| **Frontend** | The website code that runs in the browser (`apps/frontend`). |
| **Backend / API** | The server program the website calls (`apps/api`). |
| **Endpoint / route** | One URL the API answers, such as `POST /api/auth/login`. |
| **JSON** | The text format used to send data, e.g. `{"name": "Ana"}`. |
| **Simulation** | A generated lesson: a list of steps. |
| **Step** | One scene: a subtitle plus a list of diagram **elements**. |
| **Element** | One drawable thing: a rectangle, circle, arrow, text and so on, with a position and an animation. |
| **Connector** | An element that joins two others: an arrow or line. Connectors name the shapes they join (`from` / `to`). |
| **LLM** | Large language model: the AI (here GPT-4.1 mini) that writes the lesson. |
| **Prompt** | The instructions we send to the LLM. |
| **Structured Outputs** | An Azure OpenAI feature that forces the LLM to answer in an exact JSON shape. |
| **Deployment (Azure OpenAI)** | A named, rate-limited copy of a model inside our Azure account, e.g. `gpt41mini-v1`. |
| **TPM** | Tokens per minute: how much text a deployment may process each minute. |
| **TTS** | Text-to-speech: turning text into audio (we use Sarvam AI). |
| **Cache** | A saved copy of a result, so it doesn't have to be made again. |
| **SQLite** | A database that lives in a single file. No database server needed. |
| **JWT** | JSON Web Token: the signed "login ticket" the browser sends with every request. |
| **CORS** | A browser rule. The API lists which websites may call it. |
| **Container / Docker image** | A packaged copy of the backend with everything it needs, runnable anywhere. |
| **Registry (GHCR)** | Where container images are stored (GitHub Container Registry). |
| **CI/CD** | Continuous integration / delivery: robots (GitHub Actions) that build and deploy on every push. |
| **Static site / static export** | A website made only of files, with no server code. GitHub Pages can only host this kind. |
| **Environment variable / `.env`** | Settings, such as keys and URLs, given to a program from outside its code. |
| **Secret** | A setting that must never be public (API keys, the JWT signing secret). |
| **Scale to zero** | The backend shuts down when nobody uses it and starts again on the next request. |
| **Cold start** | The few seconds' wait while a scaled-to-zero backend starts up. |

---

## 4. The tech stack and why each piece was chosen

### 4.1 Frontend (the website)

| Technology | Version | What it is | Why we use it |
|---|---|---|---|
| **TypeScript** | 5 | JavaScript with types | Catches mistakes before the code runs. |
| **React** | 19.3 | A library for building UIs from components | The industry standard; every page is made of components. |
| **Next.js** | 16.4 (App Router) | A framework on top of React | File-based pages (`app/dashboard/page.tsx` is `/dashboard`), and it can **export a static site** for GitHub Pages. |
| **Tailwind CSS** | 4 | Styling with small class names (`px-4 text-cyan`) | Fast, consistent styling; colours are defined once as design tokens. |
| **Motion** (`motion/react`) | 14 | An animation library | Page transitions, the landing-page "videos", springy toggles. |
| **lucide-react** | 1.x | An icon set | Clean, consistent icons. |
| **clsx + tailwind-merge** | — | Small helpers | Combine class names safely. |
| **HTML `<canvas>`** | built in | A drawing surface | Draws every simulation step, frame by frame (our own renderer). |
| **Web Speech API** | built in | The browser's speech recognition and voice | Voice commands, and the fallback voice when Sarvam is unavailable. |
| **ESLint** | 9 | A linter | Enforces React 19's rules and Next.js best practices. |

### 4.2 Backend (the API)

| Technology | Version | What it is | Why we use it |
|---|---|---|---|
| **Node.js** | 22 | Runs JavaScript on a server | Same language as the frontend. |
| **TypeScript** | 5.7 | — | Same reason as above. |
| **Express** | 4 | A minimal web server framework | Simple routing: `app.post("/api/auth/login", ...)`. |
| **zod** | 3 | Validates incoming data | Rejects bad requests (topic too long, wrong level) with a clear 400 error. |
| **openai** (SDK) | 7 | The official client library | Talks to **Azure OpenAI** (the `AzureOpenAI` class). |
| **better-sqlite3** | 13 | A fast SQLite driver | The whole database, in one file. |
| **jsonwebtoken** | 9 | Creates and checks JWTs | Login tokens. |
| **Node `crypto`** | built in | Hashing | `scrypt` password hashing and SHA-256 token hashing. |
| **cors** | 2 | Express middleware | Lets only our website call the API. |
| **dotenv** | 17 | Loads `.env` files | Local configuration. |
| **tsx** | 4 | Runs TypeScript directly | `npm run dev` restarts the server on every save. |

### 4.3 AI and voice services

| Service | Model / name | Role |
|---|---|---|
| **Azure OpenAI** (inside Microsoft Foundry) | `gpt41mini-v1` = **gpt-4.1-mini**, 150K TPM | Primary model: writes outlines, diagrams, tutor answers and voice-command parsing. |
| | `itt-llm-burst` = **gpt-5-mini**, 100K TPM | **Overflow** model, used only if the primary is busy or failing. |
| **Sarvam AI** | **bulbul:v4-flash**, voice `simran_en_edtech` | Natural, human-sounding narration (MP3). |

### 4.4 Cloud and hosting

| Service | Role |
|---|---|
| **GitHub Pages** | Hosts the static website, free. |
| **Azure Container Apps** | Runs the backend container, scaling between 0 and 1 copies. |
| **Azure Files** | A network drive mounted into the container at `/data`; holds `app.db`. |
| **GitHub Container Registry (GHCR)** | Stores the backend's Docker image. |
| **GitHub Actions** | Builds and deploys both halves automatically. |
| **Log Analytics** | Collects the backend's logs. |

Everything on Azure is in one **resource group** (a folder for cloud resources) called `itt-rg`, in the **Korea Central** region.

---

## 5. Development tools

These are the tools used to build, test and operate the project.

| Tool | Used for |
|---|---|
| **VS Code** | The code editor. |
| **Claude Code** (VS Code extension) | AI pair programmer: migration, code, debugging, documentation. |
| **Git** | Version control. Every change is a commit. |
| **GitHub** | Hosts the repository, Actions, Pages and GHCR. |
| **GitHub CLI (`gh`)** | Watching workflow runs and setting repository variables and secrets from the terminal. |
| **Node.js 22 + npm** | Running both apps and installing packages. npm **workspaces** link the API to the root. |
| **tsx / tsc** | Run TypeScript in development / compile it for production. |
| **Azure CLI (`az`)** + the `containerapp` extension | Creating and inspecting every Azure resource: resource group, model deployments, storage, Container Apps, service principal. |
| **Azure Portal / Microsoft Foundry portal** | Viewing resources and model deployments in a browser. |
| **Docker** (the Dockerfile, built by GitHub Actions) | Packaging the backend into an image. |
| **curl** | Calling the API by hand and reading response headers (how the stale-deployment bug was found). |
| **openssl** | Generating `JWT_SECRET` (`openssl rand -hex 32`). |
| **Playwright + Chrome** | Opening the real site in a browser automatically, taking screenshots, checking for console errors, and rendering every curated step for review. |
| **Mermaid** | The flowcharts in the README and architecture document. |
| **SQLite** | The database; inspect it with any SQLite viewer. |
| **Sarvam dashboard** | Creating and deleting the voice API key (the only place you can). |

---

## 6. A tour of the folders

```
interactive-tech-tutor/
├── apps/
│   ├── api/                      THE BACKEND
│   │   ├── src/
│   │   │   ├── index.ts          all HTTP routes + the lesson-generation pipeline
│   │   │   ├── auth.ts           passwords, login tokens, sessions
│   │   │   ├── types.ts          shared TypeScript types
│   │   │   ├── db/
│   │   │   │   ├── db.ts         database tables and every read/write function
│   │   │   │   └── seed.ts       three built-in topics
│   │   │   ├── services/
│   │   │   │   ├── llm.ts        the Azure OpenAI client (limits, failover)
│   │   │   │   ├── prompts.ts    every instruction we give the AI
│   │   │   │   └── tts.ts        Sarvam voice: cache + daily budget
│   │   │   └── scripts/          backup export / import
│   │   ├── data/                 the local SQLite file appears here (gitignored)
│   │   ├── Dockerfile            how the backend image is built
│   │   └── .env.example          template for apps/api/.env
│   │
│   └── frontend/                 THE WEBSITE (own node_modules, not in the workspace)
│       ├── src/
│       │   ├── app/              one folder per page (Next.js App Router)
│       │   ├── components/
│       │   │   ├── landing/      landing-page sections and demo "videos"
│       │   │   ├── app/          app shell (navigation) and the sign-in form
│       │   │   ├── learn/        the player, canvas, tutor chat, quiz, progress screen
│       │   │   └── ui/           buttons, cards, inputs (shared primitives)
│       │   ├── lib/
│       │   │   ├── api.ts        every call to the backend
│       │   │   ├── auth.tsx      login state shared across pages
│       │   │   ├── usePlayer.ts  play / pause / step logic
│       │   │   ├── narration.ts  Sarvam audio with browser-voice fallback
│       │   │   ├── speech.ts     voice commands (speech recognition)
│       │   │   └── simulation/
│       │   │       ├── renderer.ts   draws a step on the canvas
│       │   │       └── compose.ts    helpers for building curated diagrams
│       │   └── data/
│       │       ├── featured.ts           the five curated lessons + quizzes
│       │       └── demo-simulations.json real generated output for the landing page
│       └── .env.example          template for apps/frontend/.env.local
│
├── docs/                         all documentation (you are here)
│   ├── phases/                   one document per development phase
│   ├── product/                  the original requirements and design
│   └── assets/                   README images and animated SVGs
├── scripts/rotate-sarvam-key.sh  safely replaces the voice key in production
├── .github/workflows/            the two deploy robots
├── package.json                  root: npm workspace (API) + handy scripts
└── README.md                     project front page
```

---

## 7. What happens when you generate a lesson, step by step

Follow one request from click to animation.

**In the browser**

1. On `/dashboard` you type "How DNS works" and press Generate.
2. The browser goes to `/learn/?topic=How%20DNS%20works&level=beginner`.
3. `lib/api.ts` sends `POST /api/ai/simulation` with your **login token** in the `Authorization` header. It allows up to 150 seconds.
4. While waiting, `GenerationProgress` shows the four real pipeline stages and a timer.

**In the backend** (`apps/api/src/index.ts`)

5. **Who are you?** The token is checked, and its session is looked up in SQLite.
6. **Is the request valid?** zod checks the topic (2–120 characters) and the level.
7. **Already made?** It checks:
   - an in-memory cache (12 hours) → instant;
   - the `simulation_cache` table (7 days, shared by all users) → about 0.6 s in production.
8. **Being made right now?** If someone else asked for the same topic a moment ago, it waits for their result instead of paying twice.
9. **Outline:** one AI call returns 6–8 steps, each with a concept, a subtitle and a *visual plan* (which shapes, which numbers, what moves). It uses one running example throughout, so the steps tell one story.
10. **Diagrams in parallel:** one AI call per step, *all at the same time*, turns each visual plan into elements with positions and animations. Parallel calls are why it takes about 20 s instead of a minute or more.
11. **Code repairs:** code (not AI) fixes predictable problems: placeholder labels, broken tree links, numbers outside a chart, and so on.
12. **Quality gate:** steps with real defects (too few elements, short subtitle, unlabeled shapes) are redesigned, at most 3, in parallel. A redesign is kept only if it scores higher.
13. **Finish:** each step gets a duration from its word count, a quiz is attached, the history entry is saved, and the result is cached.

**Back in the browser**

14. The player shows step 1. `renderer.ts` draws its elements on the canvas, animating them (fade in, draw, pulse, move...). Arrows attach to the shapes they name.
15. `narration.ts` asks `POST /api/tts` for the subtitle's audio:
    - the backend checks `tts_cache`. If the sentence was ever spoken before, it returns instantly for free;
    - otherwise it pays Sarvam once, stores the MP3 and returns it;
    - if the daily budget is used up, the browser's own voice reads it instead.
16. While step 1 plays, the player **prefetches only step 2's audio**, to save credits.
17. Your quiz result goes to `POST /api/progress/update`. Passing unlocks the next level.

If the AI is down, the backend returns a simple **template** lesson, and the page says so.

---

## 8. The backend, file by file

### `src/index.ts`: routes and pipeline

All routes (every one except `/health`, register and login needs a login token):

| Route | What it does |
|---|---|
| `GET /health` | "I'm alive" plus the deployed commit. |
| `POST /api/auth/register`, `POST /api/auth/login` | Create an account / sign in → returns a JWT. |
| `GET /api/topics`, `GET /api/topics/:topicId/problem-sets` | The seed topics and their quizzes. |
| `GET /api/progress`, `POST /api/progress/update` | Read / update levels and scores. |
| `GET /api/preferences`, `PUT /api/preferences` | Interaction mode and voice settings. |
| `GET /api/history`, `DELETE /api/history/topic/:topicId` | What you did, and clearing it. |
| `POST /api/interactions` | Record an action. |
| `POST /api/ai/simulation` | Generate a lesson (section 7). |
| `POST /api/ai/chat` | Tutor answer (uses the topic title and last 5 messages). |
| `POST /api/ai/voice-action` | Turns speech into one of 15 player commands. |
| `POST /api/tts` | Narration audio. |
| `POST /api/ai/feedback/action`, `POST /api/ai/visual` | Templated replies saved to history (no AI call). |

Full request and response shapes: [api-reference.md](api-reference.md).

### `src/auth.ts`: accounts

- Passwords are **never stored**. A salted **scrypt** hash is stored (`scrypt$salt$hash`).
- Login returns a **JWT** signed with `JWT_SECRET`.
- A **session** row is saved under the token's SHA-256 hash and expires in 24 hours.

### `src/services/llm.ts`: talking to the AI

- `generateText` / `generateJson` are the only ways the code calls the AI.
- A **limiter** allows at most 6 AI calls at once (`LLM_MAX_CONCURRENCY`), so many users can't exceed our per-minute budget.
- **Failover:** if the primary deployment returns 429 (too busy), 5xx (error) or times out, the call moves to the overflow deployment.
- If a model rejects a setting (for example `temperature`), the client remembers that and retries without it.

### `src/services/prompts.ts`: what we tell the AI

- `OUTLINE_SYSTEM_PROMPT` + `OUTLINE_SCHEMA`: how to plan a lesson, and the exact JSON shape.
- `ELEMENT_SYSTEM_PROMPT`: the catalogue of drawable elements, layout recipes, and a worked example. It also says that every shape has an `id` and arrows use `from` / `to`.
- Chat and voice-command prompts. `VOICE_ACTION_SCHEMA` restricts answers to the 15 allowed actions.

The long, unchanging rules come first, so Azure's **prompt caching** can reuse them across calls (cheaper and faster).

### `src/services/tts.ts`: the voice

It calls Sarvam with the step text and returns MP3 audio at 24 kHz. The caching and daily budget logic around it sits in `index.ts` and `db.ts`.

### `src/db/db.ts`: the database

It creates the tables (section 10) and provides small functions such as `findUserByEmail` and `getCachedSpeech`. No other file writes SQL.

---

## 9. The frontend, file by file

### Pages (`src/app/`)

| URL | File | What you see |
|---|---|---|
| `/` | `page.tsx` | Landing page: hero with a live demo of *real* generated output, "How it works", a 4-chapter feature reel, call to action. |
| `/login`, `/signup` | `login/`, `signup/` | Sign in / create account, beside a live demo. |
| `/dashboard` | `dashboard/` | Topic box + level picker, five curated lessons, recent history, progress snapshot. |
| `/learn` | `learn/` | Generation progress, then the player (canvas, subtitles, narration, timeline, voice button) with **Tutor / Steps / Practice** tabs. `?featured=<slug>` opens a curated lesson. |
| `/progress` | `progress/` | Levels and scores per topic; history with delete. |
| `/settings` | `settings/` | Interaction mode, voice commands, narration on/off, **voice engine (Natural or Browser)**, speed. |
| 404 | `not-found.tsx` | Page not found. |

### Important pieces

- **`lib/simulation/renderer.ts`** is the heart of the visuals. Each animation frame it:
  1. works out which elements are visible yet (each has a delay);
  2. draws shapes, then connectors **attached to the shapes they name**. An arrow whose end is within about 5% of a shape snaps to it;
  3. never draws a connector until both of its shapes are visible;
  4. for tree steps, draws the tree's own edges and ignores model-drawn lines.
- **`lib/usePlayer.ts`**: the playback clock (play, pause, next, jump, speed).
- **`lib/narration.ts`**: fetches Sarvam audio, prefetches the next step, changes speed with `playbackRate` (no new audio needed) and falls back to the browser voice.
- **`lib/speech.ts`**: listens for voice commands and sends the text to `/api/ai/voice-action`.
- **`lib/auth.tsx`**: keeps the token in `localStorage`. Any 401 from the API signs you out.
- **`data/featured.ts` + `lib/simulation/compose.ts`**: the curated lessons, built with helpers like `box()`, `node()`, `link()` and `cellRow()`, so the geometry is exact.

### Design system

- Dark theme. Colour tokens, defined once in `globals.css`:
  - `ink-950`…`ink-600` for backgrounds;
  - **cyan** `#00d4ff` (primary);
  - **violet** `#8b5cf6` (AI / tutor);
  - **signal orange** `#ff6b35` (the thing being discussed);
  - **mint** `#22c55e` (success);
  - **amber** `#facc15` (warning).
- Fonts: Geist, Geist Mono, and Instrument Serif italic for accent words.
- Motion: one shared easing curve, springs for toggles, scroll reveals that play once. Everything respects the "reduce motion" system setting.

### Why "static export" matters

GitHub Pages can only serve files. So the site can't use Next.js server features (server actions, API routes, cookies, middleware, dynamic URL segments). That is why the topic travels in the **query string** (`/learn/?topic=...`) rather than in the path (`/learn/dns`).

The site is served under `/interactive_tech_tutor/` (the **base path**), so links and redirects are written to respect it.

---

## 10. The data: what is stored and where

Everything is in **one SQLite file**, `app.db`:
- locally it is in `apps/api/data/`;
- in production it is at `/data/app.db` on the Azure Files share.

| Table | Holds |
|---|---|
| `users` | id, name, email, password **hash**, timestamps |
| `sessions` | SHA-256 of each login token, which user, expiry |
| `preferences` | interaction mode, voice settings |
| `progress` | per user × topic × level: status, score |
| `history` | every simulation, chat message and action, per topic |
| `simulation_cache` | finished lessons, kept 7 days, shared by everyone |
| `tts_cache` | narration MP3s, kept permanently, shared by everyone |

The browser's `localStorage` holds only your token, name, email and voice-engine choice.

**Why SQLite?** No database server to run or pay for, and our setup guarantees a single writer (one backend copy). The catch: on a network drive SQLite needs care. We mount the share with `nobrl` and use the normal journal mode, not WAL. That is also why we can run only **one** backend copy.

**Backups:** `npm run backup:export` writes users, preferences, progress and history to JSON; `npm run backup:import <file>` restores them.

---

## 11. The cloud: what runs where

| Thing | Where | Name |
|---|---|---|
| Website | GitHub Pages | `yating021.github.io/interactive_tech_tutor` |
| Backend | Azure Container Apps | app `itt-api` in environment `itt-env` (0.5 CPU, 1 GiB, 0–1 copies) |
| Database file | Azure Files | storage account `ittdatayg1013`, share `itt-data`, mounted at `/data` |
| AI models | Azure OpenAI (Foundry resource `itt-foundry-yg`) | `gpt41mini-v1`, `itt-llm-burst` |
| Backend image | GHCR | `ghcr.io/yating021/interactive-tech-tutor-api` |
| Voice | Sarvam AI | `bulbul:v4-flash` |
| Deploy identity | Azure service principal | `itt-github-deployer` (may change only `itt-rg`) |

**Why Korea Central?** The Azure for Students subscription only allows five regions. Of those, only Korea Central offered gpt-4.1-mini *and* Container Apps.

**Why Container Apps?**
- It **scales to zero**, so no cost while idle.
- It can mount Azure Files.
- It handles 20–40 s requests.
- It provides HTTPS automatically.

The price is a **cold start**: the first request after idle waits a few seconds. The website pings `/health` as soon as it loads, to start the wake-up early.

Full inventory and costs: [operations.md](operations.md).

---

## 12. How code gets from your laptop to the live site

```
git push to main
   │
   ├── changed apps/api/** ?  ──► deploy-backend.yml
   │        1. build the Docker image
   │        2. push it to GHCR (tagged with the commit)
   │        3. log in to Azure as itt-github-deployer
   │        4. tell itt-api to run the new image
   │        5. poll /health (up to 400 s) until it reports this commit → else fail
   │
   └── changed apps/frontend/** ? ──► deploy-frontend.yml
            1. npm ci inside apps/frontend
            2. next build → static files in out/
            3. add .nojekyll (otherwise Pages hides the _next/ folder)
            4. publish to GitHub Pages
```

Both workflows live in [.github/workflows/](../.github/workflows/) and can also be run by hand from the Actions tab.

**Rule of thumb:** a green tick is not proof. After a deploy, open `/health` and check the commit, then try the site.

---

## 13. Running it on your own computer

You need **Node.js 22+**, **npm** and **git**.

```bash
git clone https://github.com/YatinG021/interactive_tech_tutor.git
cd interactive_tech_tutor

# 1. Install
npm install                          # backend (root workspace)
npm --prefix apps/frontend install   # frontend (separate node_modules)

# 2. Configure
cp apps/api/.env.example apps/api/.env
cp apps/frontend/.env.example apps/frontend/.env.local
#   edit apps/api/.env: AZURE_OPENAI_* (and SARVAM_API_KEY for the natural voice)
#   apps/frontend/.env.local: NEXT_PUBLIC_API_URL=http://localhost:4000/api

# 3. Run (two terminals)
npm run dev:api        # http://localhost:4000  (try /health)
npm run dev:frontend   # http://localhost:3000
```

Without Azure keys the app still runs: sign-up, curated lessons and progress work, generated topics fall back to templates, and narration uses the browser voice.

Useful commands:

| Command | Does |
|---|---|
| `npm run build` | Compile the API and build the static site |
| `npm --prefix apps/frontend run lint` | Lint the frontend |
| `npm run backup:export` | Back up the local database to JSON |

---

## 14. Configuration and secrets

### Backend: `apps/api/.env` (copy from `.env.example`)

| Variable | Meaning |
|---|---|
| `PORT` | Local port (4000; the container uses 8000) |
| `JWT_SECRET` | Signs login tokens. **Required in production** (`openssl rand -hex 32`) |
| `FRONTEND_ORIGINS` | Websites allowed to call the API |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` | Your Azure OpenAI resource |
| `AZURE_OPENAI_DEPLOYMENT` | Primary deployment (production: `gpt41mini-v1`) |
| `AZURE_OPENAI_OVERFLOW_DEPLOYMENT` | Overflow deployment (production: `itt-llm-burst`) |
| `AZURE_OPENAI_API_VERSION` | API version, e.g. `2024-10-21` |
| `LLM_MAX_CONCURRENCY` | Max simultaneous AI calls (6) |
| `SARVAM_API_KEY`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER` | Voice |
| `TTS_DAILY_CHAR_LIMIT` | Characters sent to Sarvam per day (8000) |
| `DATA_DIR` | Where `app.db` lives (`./data` locally, `/data` in Azure) |
| `CACHE_VERSION`, `SIMULATION_CACHE_TTL_HOURS` | Cache control |

### Frontend: `apps/frontend/.env.local`

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_URL` | The API address including `/api` |
| `NEXT_PUBLIC_BASE_PATH` | `/interactive_tech_tutor` on Pages; empty locally |

> Anything starting with `NEXT_PUBLIC_` is **visible to everyone**. Never put a key there.

### Secret rules

- Every `.env` file is **gitignored**. Only `.env.example` files (no real values) are committed.
- In production, the keys are **Container App secrets** (`jwt-secret`, `aoai-key`, `sarvam-key`), not files.
- GitHub holds `AZURE_CREDENTIALS` (for deploying) as a repository secret, and `API_BASE_URL` as a variable.
- To replace the Sarvam key:
  1. create a new key in the Sarvam dashboard;
  2. put it in `apps/api/.env`;
  3. run `scripts/rotate-sarvam-key.sh`. It tests the key, then updates production.

---

## 15. How the project was built: phases and stages

The project started (February 2026) as a React + Vite site with an Express API on **AWS**:
- Bedrock (Nova Pro) for AI;
- DynamoDB and S3 for data;
- Amplify, Render and Vercel for hosting.

In October 2026 it was migrated to **Azure + GitHub**, rebuilt and documented in eight phases. Each phase has its own document in [phases/](phases/).

| # | Phase | What happened | Result |
|---|---|---|---|
| 0 | **Assessment and plan** | Read the code and the requirements; listed every AWS service; designed the Azure target. | Found: server couldn't start without AWS keys, a write-only S3 cache, progress lost on every redeploy, unsalted password hashes. |
| 1 | **Azure foundation** | Installed the Azure CLI; discovered the 5-region policy; created `itt-rg` and the Foundry resource in Korea Central; moved the repo to YatinG021 with full history. | A working Azure account and model access. |
| 2 | **Language model** | Wrote `llm.ts`; replaced every Bedrock call with Azure OpenAI; removed the AWS AI SDK. | All AI goes through one client. |
| 3–4 | **Storage and pipeline** | Replaced DynamoDB, S3 and `store.json` with **SQLite**; scrypt passwords; hashed sessions. Rebuilt generation as *outline → parallel steps → parallel repair*; added the persistent cache and in-flight de-duplication; rewrote the prompts with Structured Outputs; fixed the matrix-repair and quality-gate bugs. | No AWS left in the code; generation about 20 s instead of 42 s or more for the first pass alone. |
| 5 | **Backend deployment** | Dockerfile; public GHCR image; Container Apps environment (recreated in WorkloadProfiles mode); Azure Files with `nobrl`; secrets; deploy workflow with health-check smoke test; fixed stale deployment names; added overflow failover. | The API is live and survives restarts. |
| 6 | **Frontend** | First put the old Vite site on Pages; then built the **new Next.js frontend** (landing page with live demos, player, progress, settings); fixed diagram alignment in the renderer and prompts; built the 5 curated lessons; added **Sarvam narration** with caching and a daily budget. | The current website. |
| 7 | **Cleanup** | Removed the old Vite app and the Render and Vercel config; regenerated the lockfile; removed old CORS origins; deleted a leftover resource group; restructured folders; wrote all docs and the README. | A clean repository. Still open: deleting the old AWS resources (needs the AWS account owner) and rotating the Sarvam key. |

Each phase followed the same stages:
1. **plan** what changes and why;
2. **build** it;
3. **run it locally** and measure;
4. **deploy**;
5. **verify on the live system** (health commit, real browser run);
6. **document**.

---

## 16. Problems we hit and what they teach

| Problem | Real cause | Lesson |
|---|---|---|
| Diagrams looked scattered and boxes overlapped | A "confusion-matrix repair" ran on *every* topic and snapped boxes into a 2×2 grid. Spotted because two different AI models produced identical coordinates. | When output looks wrong, check your own post-processing before blaming the AI. |
| Almost every step was "repaired" (slow and expensive) | The quality bar was set higher than good steps usually score. | Look at the real distribution of scores before choosing a threshold. |
| AI looked capped at 30K TPM, then inconsistent | The deployment **name** had been reused; Azure kept serving the old model and limits under it for over 30 minutes. | Never reuse a deployment name. Verify with the response's `model` field and rate-limit headers. |
| Arrows floated away from their boxes | Arrows were free coordinates; edge-clamping moved boxes but not arrows. | Connect things by **reference** (`from`/`to` ids), not by coordinates. |
| Azure Files wouldn't mount | The default "Express" Container Apps environment doesn't support it. | Read what a default mode gives up. |
| CLI said "InternalServerError" but the app existed | The CLI's progress poll failed, not the creation. | Check the actual resource (`az containerapp show`). |
| Quizzes passed but levels didn't unlock | 2 of 3 = 67%, but the server wanted 70%. | Keep business rules in one place, or send them explicitly. |
| Tutor didn't know the topic | It looked up generated topic ids among the 3 seed topics only. | Pass the context you need instead of re-deriving it. |
| Pages site loaded without styles | GitHub Pages' Jekyll hid the `_next/` folder. | Add `.nojekyll`. |

---

## 17. Where to change things

| I want to... | Edit |
|---|---|
| Change how lessons are written | `apps/api/src/services/prompts.ts` |
| Add a new drawable element type | the prompt catalogue in `prompts.ts` **and** `apps/frontend/src/lib/simulation/renderer.ts` |
| Add a curated lesson | `apps/frontend/src/data/featured.ts` (use helpers from `compose.ts`) |
| Add an API route | `apps/api/src/index.ts` (validate with zod; add a DB function in `db/db.ts` if it stores data) |
| Change colours or fonts | `apps/frontend/src/app/globals.css` (design tokens) |
| Change the voice | `SARVAM_TTS_SPEAKER` (env var / Container App setting) |
| Use a different AI model | create a **new** deployment name in Azure, then set `AZURE_OPENAI_DEPLOYMENT` |
| Invalidate cached lessons | bump `CACHE_VERSION` |
| Change landing-page sections | `apps/frontend/src/components/landing/` |

---

## 18. What the project does not do (yet)

Being honest about limits helps you avoid wrong assumptions.

- **No automated tests.** Everything was verified by running it, by measurements and by browser checks.
- **No per-user rate limiting**, and no prompt-injection screening beyond the prompt wording.
- **No email verification, password reset or Google sign-in**; no logout endpoint (signing out clears the browser token).
- **One backend copy only**, because of SQLite on a network share.
- **Cold starts** after idle periods.
- **Quizzes for generated topics are generic**; only the curated and seed topics have topic-specific questions.
- AI diagrams are always *connected*, but the model can still place shapes too close together.
- File attachments in chat send only the file's name, type and size, not its contents.
- Natural narration depends on Sarvam trial credits (about ₹100, roughly 33,000 characters) and the daily cap.
- The old AWS resources still exist in the previous owner's AWS account.

Ideas for later:
- move to a server database for more than one backend copy;
- topic-specific AI quizzes;
- rate limits;
- automated tests;
- streaming steps as they finish;
- a custom `.tech` domain.

---

## 19. FAQ

**Why is the first load sometimes slow?**
The backend was asleep (scale to zero). It wakes in a few seconds.

**Why is a new topic about 20 seconds, but a repeat instant?**
New topics are written by the AI; repeats come from the cache.

**Does every user pay for narration again?**
No. Every sentence is paid for once and cached for everyone.

**Can I see the database?**
Locally, open `apps/api/data/app.db` in any SQLite viewer.

**Where are the API keys?**
In your local `apps/api/.env` (never committed) and as Container App secrets in Azure. Never in the frontend or in git.

**What is in the other documents?**

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Deeper design, data model, diagrams |
| [api-reference.md](api-reference.md) | Every endpoint |
| [backend-setup.md](backend-setup.md) | Backend configuration checklist |
| [operations.md](operations.md) | Deploys, secrets, costs, AWS teardown |
| [product-documentation.txt](product-documentation.txt) | Full product documentation with measurements and history |
| [phases/](phases/) | One document per phase |

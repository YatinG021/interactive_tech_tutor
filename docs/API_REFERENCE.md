# Interactive Tech Tutor API Reference

Every endpoint the frontend calls, with exact request and response shapes. Taken from `apps/api/src/index.ts`.

## Basics

| | |
|---|---|
| Production base URL | `https://itt-api.orangefield-ee93915e.koreacentral.azurecontainerapps.io` |
| Local base URL | `http://localhost:4000` |
| API prefix | `/api` (everything except `/health`) |
| Format | JSON in, JSON out. Send `Content-Type: application/json`. |
| Auth | `Authorization: Bearer <token>` on every route marked **auth** |
| Errors | Non-2xx responses are `{ "error": string }` |

Frontend environment variable: `NEXT_PUBLIC_API_URL` (or `VITE_API_URL` for the old app) set to the base URL **including** `/api`, e.g. `https://…azurecontainerapps.io/api`.

### CORS
The API accepts browser calls only from listed origins (`FRONTEND_ORIGINS` on the server, plus `http://localhost:3000` which is built in). Production allows `https://yating021.github.io`; `http://localhost:3000` (the Next.js dev server) is always allowed. A new origin must be added on the server before it can call the API; otherwise the preflight returns **403**.

### Sessions
- A token is valid for **24 hours** (the session record expires before the 7-day JWT does).
- Any **401** means the token is missing, invalid or expired: clear it and send the user to sign-in.
- There is no logout endpoint. Logging out means discarding the token on the client.

### Status codes
| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Body failed validation. `error` says which payload. |
| 401 | Not signed in, or the session expired |
| 403 | Origin not allowed by CORS |
| 404 | Not found (preferences, problem sets for an unknown topic) |
| 409 | Email already registered |
| 500 | Server error |

### Latency to design for
| Call | Typical time |
|---|---|
| Most routes | under 300 ms |
| `/ai/chat`, `/ai/voice-action` | 1–3 s |
| `/ai/simulation`, first time for a topic | **20–40 s**. Show a progress state; use a client timeout of at least 120 s. |
| `/ai/simulation`, repeat | under 1 s (cached for 7 days, shared by all users) |
| First request after the API was idle | +5–15 s (scale-to-zero cold start). Call `/health` when the app loads to wake it. |

---

## Shared types

```ts
type DifficultyLevel = "beginner" | "intermediate" | "advanced";
type InteractionType = "voice" | "text" | "action" | "visual";

interface User { id: string; name: string; email: string; lastLoginAt: string }

interface Topic {
  id: string;            // seed: "http-basics" | "react-state" | "sql-indexing"; generated: "custom-<ms>-<slug>"
  title: string;
  description: string;
  narration: string[];   // one line per step
  visualTheme: string;
}

interface Problem { id: string; question: string; choices: string[]; answer: string; explanation: string }
interface ProblemSet { topicId: string; level: DifficultyLevel; passingScore: number; problems: Problem[] }

interface ProgressRecord {
  userId: string; topicId: string; level: DifficultyLevel;
  status: "not-started" | "in-progress" | "completed";
  score: number;        // 0-100
  timeSpent: number;    // seconds
  updatedAt: string;    // ISO 8601
}

interface VoiceSettings {
  narrationEnabled: boolean; interactionEnabled: boolean; navigationEnabled: boolean;
  rate: number;         // 0.5-2
  voiceName: string;    // SpeechSynthesis voice name, "" = browser default
}
interface UserPreferences { userId: string; interactionMode: "voice" | "click" | "both"; voiceSettings: VoiceSettings }

interface InteractionRecord {
  id: string; userId: string; topicId: string; type: InteractionType;
  input: string; output: string; timestamp: string; meta: Record<string, unknown>;
}
```

### Simulation steps (what the canvas renders)
```ts
interface SimulationStep {
  step: number;                 // 1-based
  concept: string;              // short title
  subtitle: string;             // 3-4 sentences, read aloud by speechSynthesis
  duration_ms?: number;         // 12000-35000, suggested time on this step
  canvas_instructions: { elements: CanvasElement[] };
}

interface CanvasElement {
  type: string;   // rectangle | circle | bar | tree_node | arrow | line | dashed_line | curved_arrow | text | matrix
                  // | table | axis | plot_point | flowchart_diamond | stack | queue | number_line | neural_network | highlight_box | ...
  x?: number; y?: number; width?: number; height?: number;   // percent of canvas (0-100)
  x1?: number; y1?: number; x2?: number; y2?: number;         // lines and arrows
  color?: string;                                            // "#RRGGBB"
  label?: string;
  label_position?: "above" | "below" | "left" | "right";
  animation?: { type: string; duration: number; delay?: number; target_x?: number; target_y?: number; [k: string]: unknown };
  [extra: string]: unknown;    // value, parent_value, rows, cols, values, headers, layers, ...
}
```
Render steps with `SimulationCanvasRenderer` (ported to `apps/frontend/src/lib/simulation/renderer.ts`). Do not hand-roll a renderer; the field semantics are encoded there.

---

## Endpoints

### Health

#### `GET /health`
No auth. Use it to wake the API on app load.
```json
{ "ok": true, "service": "interactive-tech-tutor-api", "commit": "1309912c…" }
```

### Auth

#### `POST /api/auth/register`
```json
{ "name": "Ada", "email": "ada@example.com", "password": "at-least-8-chars" }
```
- `name` is optional (1-80 chars); defaults to the part of the email before `@`.
- `password` must be at least 8 characters after trimming.

**201**
```json
{ "token": "eyJ…", "user": { "id": "uuid", "name": "Ada", "email": "ada@example.com", "lastLoginAt": "2026-10-13T18:00:00.000Z" } }
```
Errors: **400** invalid payload or short password; **409** `"User already exists."`

#### `POST /api/auth/login`
```json
{ "email": "ada@example.com", "password": "at-least-8-chars" }
```
**200** same shape as register. Email is case-insensitive.
Errors: **400** invalid payload; **401** `"Invalid email or password."`

### Seed content (auth)

#### `GET /api/topics`
**200** `{ "topics": Topic[] }`. The three built-in topics.

#### `GET /api/topics/:topicId/problem-sets`
**200** `{ "problemSets": ProblemSet[] }`. One per level.
**404** for any topic that is not a seed topic. Generated topics get their problem sets inside the `/ai/simulation` response instead.

### Progress (auth)

#### `GET /api/progress`
**200** `{ "progress": ProgressRecord[] }` for the signed-in user.

#### `POST /api/progress/update`
```json
{ "topicId": "http-basics", "level": "beginner", "status": "completed", "score": 90, "timeSpent": 120, "passingScore": 66 }
```
- `score` 0-100 (default 0), `timeSpent` seconds (default 0).
- `passingScore` (optional, 50-95) is the pass mark of the quiz the learner took; it is used when the topic has no seed problem set.
- Upserts the record for (user, topic, level).
- If `status` is `completed` and `score >= passingScore` (the seed set's value, else the request's `passingScore`, else 70), the next level is unlocked: a `not-started` record is created for it if none exists.

**200**
```json
{ "progress": ProgressRecord, "unlockedLevel": "intermediate" }
```
`unlockedLevel` is `null` when nothing was unlocked.

### Preferences (auth)

#### `GET /api/preferences`
**200** `{ "preferences": UserPreferences }`. Defaults are created at register and login:
```json
{ "interactionMode": "both", "voiceSettings": { "narrationEnabled": true, "interactionEnabled": true, "navigationEnabled": true, "rate": 1, "voiceName": "" } }
```
**404** only if they were never created.

#### `PUT /api/preferences`
Replaces both fields; send the whole object.
```json
{ "interactionMode": "voice", "voiceSettings": { "narrationEnabled": true, "interactionEnabled": true, "navigationEnabled": false, "rate": 1.25, "voiceName": "Samantha" } }
```
**200** `{ "preferences": UserPreferences }`

### History (auth)

#### `GET /api/history?topicId=<id>`
`topicId` is optional. **200** `{ "history": InteractionRecord[] }`, oldest first.

#### `DELETE /api/history/topic/:topicId`
**200** `{ "removedCount": 3, "topicId": "http-basics" }`

#### `POST /api/interactions`
Record any interaction the UI wants in history.
```json
{ "topicId": "http-basics", "type": "action", "input": "dragged node", "output": "ok", "meta": { "step": 2 } }
```
**201** `{ "interaction": InteractionRecord }`

### AI (auth)

#### `POST /api/ai/simulation`
Generates (or returns the cached) simulation for a topic.
```json
{ "topic": "How DNS resolution works", "level": "beginner" }
```
- `topic` 2-120 characters, `level` defaults to `beginner`.
- Cached per (topic text, level) for 7 days and shared by all users. Two identical requests in flight share one generation.

**200**
```json
{
  "topic": Topic,
  "problemSets": ProblemSet[],
  "openingMessage": "first subtitle, up to 700 chars",
  "generationSource": "ai",
  "explanation_script": "Step 1 (…): … Step 2 (…): …",
  "simulation_steps": SimulationStep[]
}
```
`generationSource` is `"template"` when the model was unavailable and a generic fallback was returned. Show a gentle notice in that case.

#### `POST /api/ai/chat`
Short tutor answer, plain text (no markdown), suitable for reading aloud.
```json
{
  "topicId": "custom-1791912000000-how-dns-resolution-works",
  "topicTitle": "How DNS resolution works",
  "message": "What does the resolver cache?",
  "mode": "text",
  "context": [ { "role": "user", "text": "…" }, { "role": "assistant", "text": "…" } ]
}
```
- `topicTitle` is optional but **send it for generated topics** so the tutor knows the subject.
- `mode`: `"text"` or `"voice"` (voice answers are more conversational). Default `"text"`.
- `context`: the last few messages; only the last 5 are used.

**200** `{ "response": "…" }`. If the model fails the API still returns 200 with a generic hint.

#### `POST /api/ai/voice-action`
Turns what the learner said into a player command.
```json
{ "topicId": "…", "topicTitle": "How DNS resolution works", "userSpeech": "go to step 3", "stepConcept": "Root servers", "stepNumber": 2 }
```
**200** (always 200; failures return `general_answer`)
```json
{
  "action_type": "jump_to_step",
  "action_params": { "step_number": 3 },
  "spoken_response": "Jumping to step 3.",
  "feedback": "",
  "requires_animation": true
}
```
| `action_type` | `action_params` | Frontend should |
|---|---|---|
| `next_step` / `previous_step` | none | move one step |
| `jump_to_step` | `step_number` | go to that step (1-based) |
| `play` / `pause` / `restart` | none | control playback |
| `move_element` | `element_label`, `target_x`, `target_y` (0-100) | animate that element; show `feedback` |
| `modify_element` | `element_label`, `property`, `new_value` | change it; show `feedback` |
| `toggle_subtitles` / `toggle_voice` | none | flip the setting |
| `open_menu` / `close_menu` | none | toggle the menu |
| `answer_question` / `general_answer` | none | speak `spoken_response` |
| `not_possible` | none | speak `spoken_response` |

Always speak `spoken_response`.

#### `POST /api/tts`
Natural-voice narration (Sarvam `bulbul:v4-flash`). Returns **audio**, not JSON.
```json
{ "text": "A binary search tree keeps smaller values on the left." }
```
- `text` 1-1500 characters.
- **200** `audio/mpeg` (MP3, 24 kHz). Header `X-TTS-Cache: hit | miss`.
- Each clip is cached by (model, voice, text) and shared by all users, so replays cost nothing.
- **429** when the daily character budget is used up, **503** when no key is configured. In both cases fall back to `speechSynthesis`.
- Speed: set `audio.playbackRate` on the client instead of asking for new audio.

#### `POST /api/ai/feedback/action`
Instant templated feedback for a UI action (no model call).
```json
{ "topicId": "…", "actionType": "drag", "detail": "moved Resolver to Root server" }
```
`actionType`: `drag | scroll | back | voice-command | navigation`. **200** `{ "response": "…" }`

#### `POST /api/ai/visual`
Records an uploaded file's **metadata only**. The file itself is not sent or analysed.
```json
{ "topicId": "…", "fileName": "notes.pdf", "fileType": "application/pdf", "size": 48213 }
```
**200** `{ "response": "Visual input received: notes.pdf (…)" }`

---

## Integration checklist
1. Read the base URL from `NEXT_PUBLIC_API_URL`; never hard-code it.
2. Call `GET /health` on first load to wake the API.
3. Store the token (e.g. `localStorage`), attach `Authorization: Bearer` to every **auth** route, and log out on any 401.
4. Give `/ai/simulation` a long timeout and a real loading state; a repeat topic returns almost instantly.
5. Send `topicTitle` with chat and voice-action for generated topics.
6. Problem sets: use `problemSets` from the simulation response for generated topics; call `/topics/:id/problem-sets` only for seed topics.
7. After a quiz, `POST /progress/update` and react to `unlockedLevel`.
8. Add every new frontend origin to the API's `FRONTEND_ORIGINS` before deploying it.

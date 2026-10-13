# Phase 6: Frontend

## 6a. First hosting on GitHub Pages
The existing Vite app was published to GitHub Pages with a configurable base path and the API URL from the `API_BASE_URL` repository variable.

## 6b. A new Next.js frontend
`apps/frontend` replaces the Vite app. It is a Next.js 16 static export with its own `node_modules`, so its React 19 cannot clash with anything else in the repository.

| Page | Contents |
|---|---|
| `/` | Hero with a live playback of a real generated simulation, topic marquee, how-it-works animations, a 4-chapter feature reel, features, call to action |
| `/login`, `/signup` | Split screen with a live demo |
| `/dashboard` | Topic generator, curated simulations, recent sessions, progress snapshot |
| `/learn` | Generation progress, then the player: canvas, narration, subtitles, keyboard shortcuts, voice commands, tutor chat, steps, practice |
| `/progress`, `/settings` | Levels and history; interaction and voice preferences |

The landing page's "videos" are real pipeline output played by the app's own renderer, plus code-driven motion graphics for voice, tutor and practice. The spec it was built from is [ui-ux-prompt.md](../ui-ux-prompt.md).

## 6c. Diagram alignment
Generated diagrams looked scattered. The causes were in the code, not only the model:

| Cause | Fix |
|---|---|
| Clamping moved shapes near the edges but not the arrows attached to them | Shapes stay where placed, just kept on-canvas |
| Arrows were free coordinates with no link to shapes | Arrows reference shapes by id (`from`/`to`) and attach to their outlines; stray endpoints snap to the nearest shape |
| Tree steps drew model lines over the renderer's own tree layout | Tree steps draw only their own edges |
| Lines appeared before their nodes | A connector waits until both shapes are visible |
| The API deleted unlabeled arrows and cut captions to 4 words | Both fixed |
| 4 px arrowheads; edge labels far from diagonal edges | ≥10 px heads; labels at the edge midpoint |

The generation prompt now asks for shape ids and `from`/`to` connectors, and the cache schema moved to v5 so old diagrams regenerate.

## 6d. Curated simulations
Five hand-built lessons with exact geometry and 3-level quizzes (9 questions each), authored with `src/lib/simulation/compose.ts`:

| Topic | Level |
|---|---|
| Binary search | DSA · Easy |
| Binary search trees | DSA · Medium |
| Dijkstra's shortest path | DSA · Hard |
| TLS 1.3 handshake | Networks & security |
| Virtual memory and address translation | Operating systems |

Every step of all five was rendered in Chrome and reviewed; issues found that way (a dangling BST edge, crossing arrows, missing arrowheads) were fixed.

## 6e. Natural voice (Sarvam AI)
- Model `bulbul:v4-flash`, persona `simran_en_edtech` (from the English "edtech" voices).
- `POST /api/tts` caches each clip in SQLite by (model, voice, text), de-duplicates in-flight requests and enforces a daily character budget (`TTS_DAILY_CHAR_LIMIT`).
- The player plays the current step, prefetches only the next one, changes speed with `playbackRate` (no new audio) and falls back to the browser voice on any error. A Settings switch chooses between the natural and browser voices.
- The free trial (₹100, about 33K characters) is spent once per sentence; replays are free.

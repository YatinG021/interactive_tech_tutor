# UI/UX Generation Prompt: Interactive Tech Tutor (Next.js + Tailwind)

Paste everything inside the box below into a UI generator (v0, Lovable, Claude) or give it to a designer. It describes the product, the design system, every screen, the motion design, and the exact backend contract. The backend contract is in `docs/api-reference.md`; attach it alongside this prompt.

The reference implementation of this prompt lives in `apps/frontend`.

---

```text
Build the complete frontend for "Interactive Tech Tutor", a web app that turns any technical topic into a
narrated, animated, step-by-step simulation. A learner types a topic ("How DNS resolution works"), waits
~20–40 s while it is generated, then watches 6–8 animated diagram steps with spoken narration and
subtitles. They can steer playback by voice ("go to step 3"), ask a tutor questions by chat or voice, and
take a short quiz per level (beginner / intermediate / advanced) that unlocks the next level.

════════════════════════════════════════════════════════════════════════
1. TECH STACK AND HARD CONSTRAINTS
════════════════════════════════════════════════════════════════════════
- Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4 (CSS-first config with @theme),
  `motion` (import from "motion/react") for animation, `lucide-react` icons, `clsx` + `tailwind-merge`.
- The site is a STATIC EXPORT hosted on GitHub Pages: `output: "export"`, `trailingSlash: true`,
  `images.unoptimized: true`, `basePath` from NEXT_PUBLIC_BASE_PATH (e.g. "/interactive_tech_tutor").
  Therefore: no server actions, no route handlers, no cookies(), no middleware/proxy, no rewrites,
  NO dynamic route segments. Pass ids via query strings: /learn/?topic=...&level=...
- Pages that use useSearchParams must be wrapped in <Suspense>.
- All data comes from an external REST API (see API section). Base URL from NEXT_PUBLIC_API_URL
  (includes /api). Auth token in localStorage; every authed call sends Authorization: Bearer <token>.
- Never build URLs from window.location.pathname for in-app redirects (it includes basePath); use
  usePathname() from next/navigation.
- Simulations are drawn by an existing dependency-free canvas class `SimulationCanvasRenderer`
  (constructor(hostDiv), setStep(step), setPaused(bool, now), render(now), resize(), dispose()).
  Wrap it in a <SimulationCanvas step paused /> client component with one requestAnimationFrame loop
  and a ResizeObserver. Clone each step (structuredClone) before setStep; the renderer mutates it.
  Do NOT write a new renderer; the element field semantics are encoded in it.
- Browser speech: narration via window.speechSynthesis; voice commands via (webkit)SpeechRecognition.
  Both must degrade gracefully (hide the mic button when unsupported). Speech needs a user gesture,
  so simulations start paused behind a big Play button.

════════════════════════════════════════════════════════════════════════
2. BRAND AND DESIGN SYSTEM
════════════════════════════════════════════════════════════════════════
Personality: precise, calm, "engineering blueprint meets cinema". Confident, never cute. The product's
hero is the diagram, so the chrome stays dark and quiet so the canvas colours pop.

Theme: dark only (color-scheme: dark).

Colour tokens (define in @theme):
  ink-950 #05080f (page)     ink-900 #080d18 (panels)   ink-850 #0b1220 (cards)
  ink-800 #0f1829 (raised)   ink-700 #16223a (active)   ink-600 #22304d
  line rgba(148,163,184,.14) line-strong rgba(148,163,184,.26)
  fg #e8eef8  fg-muted #93a3bd  fg-subtle #64748b
  Accents shared with the canvas palette, use sparingly and with meaning:
  cyan #00d4ff (primary accent, focus, progress)  violet #8b5cf6 (tutor/AI, secondary)
  signal #ff6b35 (active/emphasis, voice listening, errors)  mint #22c55e (success)  amber #facc15 (warning)
Gradients: progress and accents use cyan→violet. Headline accent words use a light
  text gradient (#e8eef8 → #7dd3fc → #a78bfa).

Typography:
  Sans: Geist (UI and body).  Mono: Geist Mono (step counters, timecodes, eyebrows).
  Display accent: Instrument Serif ITALIC, only for 1–3 emphasised words inside big headlines
  ("Watch any tech concept *come alive.*").
  Scale: hero 56–68px/1.02 semibold tight; h1 30–36px; h2 24–36px; body 15–18px/1.6; small 12–13px.
  Eyebrows: mono, 12px, uppercase, letter-spacing .2em, cyan.

Surfaces: rounded-2xl cards (radius ~16–22px) with 1px rings (ring-line), no heavy shadows except a
soft cyan/violet glow under hero media. Blueprint grid backgrounds (44px and 22px grids at 6–7%
opacity) behind the hero and every canvas, masked with radial gradients.

Components: Button (primary = near-white on ink with a cyan glow; secondary = ink-800 with ring;
ghost; danger), Input (h-11, ink-900, ring, cyan focus ring), Segmented control, Badge (tones: neutral,
cyan, violet, signal, mint, amber), Card, Toggle switch (spring knob), Spinner, Logo (rounded square
with three connected nodes in cyan/violet/signal + "TechTutor" wordmark).

Accessibility: WCAG AA contrast on all text; visible focus rings; every icon button has aria-label;
subtitles use aria-live="polite"; full keyboard support in the player; respect prefers-reduced-motion
(disable non-essential motion, keep content visible); min 44px touch targets on mobile.

════════════════════════════════════════════════════════════════════════
3. MOTION LANGUAGE
════════════════════════════════════════════════════════════════════════
- Default ease: cubic-bezier(0.22, 1, 0.36, 1) ("expo out"). Durations: micro 150–250 ms, UI 300–450 ms,
  section reveals 600–800 ms. Springs for toggles/tabs: stiffness 400, damping 32.
- Entrances: fade + 12–24px rise, staggered 60–100 ms. Scroll reveals with whileInView, once: true.
- Shared-layout highlight (layoutId) for active nav item and active tab.
- Hero media: slight 3D tilt-in on load (rotateX 8→0) and gentle parallax on scroll (useScroll/useTransform).
- Looping "video" players must pause when off-screen (useInView) and when the tab is hidden.
- Never animate layout of the canvas itself; the renderer animates its own elements.

════════════════════════════════════════════════════════════════════════
4. LANDING PAGE "/" (marketing, works signed-out)
════════════════════════════════════════════════════════════════════════
a) Sticky nav: logo; anchors (How it works, See it, Features); Sign in (ghost) + Get started
   (primary). If signed in: "Open app →". Transparent at top, blurred ink with bottom border on scroll.
b) Hero (two columns on desktop, stacked on mobile):
   - Eyebrow pill "AI-generated, narrated simulations".
   - H1 "Watch any tech concept come alive." ("come alive." in serif italic gradient).
   - Sub-copy (2 lines). A topic input + "Generate →" button in one pill; submitting goes to
     /learn/?topic=..&level=beginner (or /signup/?next=... if signed out). Four example-topic chips.
   - Right: DEMO PLAYER (see 4f) autoplaying a real generated simulation (Bubble Sort), framed as a
     macOS-style window with a "REAL OUTPUT" live dot badge. Caption below.
c) Infinite marquee of example topics (pause on hover, edge fade masks).
d) "How it works": 3 cards, each with its own tiny looping animation:
   1. typing animation into a mini input + level chips;
   2. outline rows sliding in one by one (01 Your browser asks / 02 Resolver checks cache ...);
   3. a 3×2 grid of "step n" tiles filling with a cyan→violet bar simultaneously (parallel drawing).
   Copy must stay truthful: ~20 s for a fresh topic, repeats open instantly.
e) "See it in action": a FEATURE REEL, a chaptered motion-graphic video (see 4g).
f) DEMO PLAYER component spec (reused in hero, auth pages, reel):
   window chrome (traffic lights, title, "/ 03/08 Step concept" crossfading per step, REAL OUTPUT badge)
   → 16:10 canvas stage on blueprint grid → subtitle line whose words fade from 20% to 100% opacity
   in sync with step progress → controls: play/pause, segmented progress bar (one segment per step,
   clickable, active one fills), restart. Loops; fixed ~6.5 s per step.
   Data: bundle 2–3 REAL simulations produced by the API as JSON (no fake diagrams).
g) FEATURE REEL spec: left column = 4 chapter buttons (Watch it work / Talk to it / Ask the tutor /
   Practise & level up) each with caption and a bottom progress line; right = 16:10 stage
   (4:5 on mobile) with crossfading scenes, 7 s per chapter, auto-advance, play/pause, timecode "0:12 / 0:28".
   Scenes (all motion graphics, deterministic, replay on chapter change):
   1. Live demo player (TCP handshake).
   2. Voice: pulsing mic orb with expanding ring → 28-bar animated waveform → transcript bubble
      "Take me to step 3" → mono command chip `jump_to_step step_number: 3` → a row of step
      numbers where "3" lights up in signal orange.
   3. Tutor: chat bubbles appear one by one (user cyan, tutor ink with violet bot avatar), then a
      typing indicator.
   4. Practice: quiz card where the correct choice turns mint with "Correct", a circular score ring
      animates 0→90%, then an "Intermediate unlocked" badge springs in.
h) Feature grid (6 tiles in a 1px-gap grid): diagrams match the words, hands-free control, on-topic
   tutor, three levels, progress that sticks, fast on repeat.
i) Final CTA card with blueprint glow: "What do you want to *understand* today?" + button.
j) Footer: logo + one line.

════════════════════════════════════════════════════════════════════════
5. AUTH "/login/" AND "/signup/"
════════════════════════════════════════════════════════════════════════
Split screen: left = form (logo top, centred card: title, subtitle, fields, error alert, full-width
primary button with spinner, switch link); right (desktop only) = demo player (softmax) on a blueprint
glow with one explanatory sentence. Signup: Name (optional), Email, Password (≥8 chars, validate
client-side). Respect ?next= (only same-site paths starting with "/"). Already signed in → redirect.
Errors from the API are shown verbatim ("User already exists.", "Invalid email or password.").

════════════════════════════════════════════════════════════════════════
6. APP SHELL (all signed-in pages)
════════════════════════════════════════════════════════════════════════
Sticky top bar: logo, nav (Dashboard, Progress, Settings) with animated active pill, user name +
initials avatar, sign-out icon. If no session → redirect to /login/?next=<current path>. Show a centred
spinner until the session is read from localStorage. Any 401 from the API → clear session, redirect.

════════════════════════════════════════════════════════════════════════
7. DASHBOARD "/dashboard/"
════════════════════════════════════════════════════════════════════════
- Hero card: "Hi {firstName}," + "What do you want to *see explained*?"; big topic input + Generate;
  level Segmented (Beginner / Intermediate / Advanced); helper text "New topics take about 20–40
  seconds. Repeats open instantly."
- "Try one of these": 8 suggestion chips (staggered entrance) → open /learn directly.
- Two columns: "Recent simulations" (from GET /history, entries whose meta.source ===
  "simulation-generator", de-duplicated by topic+level, newest 6; card shows topic, level badge,
  relative time; click reopens) and "Your progress" (3 stat tiles: levels passed, in progress, best
  score; last 4 records; link to /progress). Skeletons while loading, friendly empty states.

════════════════════════════════════════════════════════════════════════
8. LEARN "/learn/?topic=…&level=…" (the core experience)
════════════════════════════════════════════════════════════════════════
State A, generating (POST /ai/simulation, timeout ≥120 s): eyebrow "GENERATING · BEGINNER", topic title,
honest time note, 8 "step n" tiles that fill in parallel, an asymptotic progress bar (never shows 100%
before the response), and a 4-stage checklist that advances with elapsed time:
Reading your topic → Storyboarding the steps and a running example → Drawing every step in parallel →
Checking each diagram against its narration; plus "Ns elapsed".
State B, error: title, API message, "Try again" + "Back to dashboard".
State C, player (desktop: 2 columns [stage | 400px panel], full viewport height; mobile: stacked):
- Stage header: back button, topic title, "Step 3 of 8 · concept", level badge, and an amber badge
  "Basic version, the AI was unavailable" when generationSource === "template".
- Canvas on blueprint grid. Initially covered by a dim overlay with a large glowing Play button
  (pulsing ring), "8 narrated steps", and keyboard hints. Clicking starts narration (user gesture).
- Subtitle bar (toggleable): current step's subtitle with progressive word reveal.
- Controls: previous, play/pause (round primary), next, segmented step progress (clickable, tooltip
  with concept), narration toggle, subtitles toggle, Voice button (signal colour + spinner while listening).
- Playback rules: each step lasts its duration_ms (fallback ≈400 ms × words, 12–35 s) AND waits for
  narration to finish before auto-advancing. Pausing cancels speech; resuming re-reads the step.
  Keyboard: Space = play/pause, ←/→ = previous/next (ignored while typing).
- Voice command: pause → listen once → POST /ai/voice-action with topicTitle, stepConcept,
  stepNumber → apply action (next/previous/jump/play/pause/restart/toggle subtitles/toggle narration;
  move_element/modify_element edit the matching element in the current step) → speak spoken_response
  → toast "You said '…'" + response + feedback (auto-hides after 6 s).
- Previous-step clicks also POST /ai/feedback/action {actionType:"back"} (fire and forget).
- End of last step: bottom sheet "You've watched every step. Ready to test yourself?" with Replay and
  "Practise now" (switches the panel to Practice).
- Side panel with animated tabs:
  • Tutor: chat thread (assistant bubbles with violet bot avatar), typing dots, auto-scroll, textarea
    (Enter sends, Shift+Enter newline), "Ask by voice", "Read replies aloud" toggle, "Attach" (sends file
    metadata only to POST /ai/visual; say so in the tooltip). POST /ai/chat always includes topicTitle and
    the last 5 messages as context. Focusing the composer pauses playback.
  • Steps: numbered list of concepts + 2-line subtitle excerpt; active step highlighted; click to jump.
  • Practice: level tabs from problemSets, "Pass at N%" badge, multiple-choice questions, "Check answers"
    (enabled when all answered) → score card (mint if passed, amber if not) → POST /progress/update →
    if unlockedLevel, spring-in "Intermediate unlocked" badge; reveal correct/incorrect and explanations;
    "Try again".

════════════════════════════════════════════════════════════════════════
9. PROGRESS "/progress/" AND SETTINGS "/settings/"
════════════════════════════════════════════════════════════════════════
Progress: "Levels" grid, one card per topic with 3 level tiles (animated score bar, status badge:
Completed mint / In progress amber / Not started / Locked). Topic titles: generated ids look like
"custom-<ms>-<slug>"; prefer the matching history input, else de-slug. "History": one card per topic,
newest first, icon per interaction type, input + 2-line output, relative time, Delete button
(DELETE /history/topic/:id) with exit animation.
Settings: Interaction card (Segmented: Voice and click / Click only / Voice first; switches for voice
commands and voice navigation) and Narration card (switch, speed slider 0.5–2.0× with mono readout,
voice <select> from speechSynthesis.getVoices() filtered to English, "Preview voice"). Primary "Save
changes" → PUT /preferences with the whole object → "Saved ✓".

════════════════════════════════════════════════════════════════════════
10. API CONTRACT (summary; see api-reference.md for full shapes)
════════════════════════════════════════════════════════════════════════
GET  /health                                   wake the API on app load (it scales to zero)
POST /auth/register {name?,email,password}     → {token,user}      409 if exists
POST /auth/login {email,password}              → {token,user}      401 if wrong
GET  /topics · GET /topics/:id/problem-sets    seed content only (404 for generated topics)
GET  /progress · POST /progress/update {topicId,level,status,score,timeSpent} → {progress,unlockedLevel}
GET  /preferences · PUT /preferences {interactionMode, voiceSettings{narrationEnabled,interactionEnabled,navigationEnabled,rate,voiceName}}
GET  /history?topicId= · DELETE /history/topic/:id · POST /interactions
POST /ai/simulation {topic,level}              → {topic, problemSets, openingMessage, generationSource, explanation_script, simulation_steps[]}
POST /ai/chat {topicId,topicTitle,message,mode,context[]}            → {response}
POST /ai/voice-action {topicId,topicTitle,userSpeech,stepConcept,stepNumber} → {action_type,action_params,spoken_response,feedback,requires_animation}
POST /ai/feedback/action {topicId,actionType,detail} · POST /ai/visual {topicId,fileName,fileType,size}
Errors are {error: string}. 401 → sign out.

════════════════════════════════════════════════════════════════════════
11. QUALITY BAR / ACCEPTANCE
════════════════════════════════════════════════════════════════════════
- `next build` produces a static export with zero type and lint errors; no console errors at runtime.
- Every async view has loading, empty and error states. No layout shift when data arrives.
- Responsive from 360 px to 1600 px; the player stacks on mobile; the reel uses a 4:5 stage on mobile.
- Copy is truthful (no invented stats or testimonials); landing diagrams are real API output.
- Motion respects prefers-reduced-motion and pauses off-screen.
```

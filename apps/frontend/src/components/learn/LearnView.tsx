"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Captions,
  CaptionsOff,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ListOrdered,
  Loader2,
  MessageSquareText,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { featuredBySlug, featuredProblemSets } from "@/data/featured";
import { api } from "@/lib/api";
import { narrate, prefetchNarration, stopNarration } from "@/lib/narration";
import { canListen, listenOnce, speak } from "@/lib/speech";
import type { DifficultyLevel, SimulationResponse, SimulationStep, UserPreferences, VoiceActionResponse } from "@/lib/types";
import { LEVELS } from "@/lib/types";
import { usePlayer } from "@/lib/usePlayer";
import { capitalize, cn } from "@/lib/utils";
import { Badge, Button, ButtonLink } from "@/components/ui/primitives";
import { ChatPanel } from "./ChatPanel";
import { GenerationProgress } from "./GenerationProgress";
import { PracticePanel } from "./PracticePanel";
import { SimulationCanvas } from "./SimulationCanvas";

type Tab = "tutor" | "steps" | "practice";

export function LearnView() {
  const params = useSearchParams();
  const featuredSlug = params.get("featured");
  if (featuredSlug) return <FeaturedView slug={featuredSlug} level={params.get("level")} />;
  return <GeneratedView />;
}

/** Curated simulations ship with the app, so they open instantly with no generation step. */
function FeaturedView({ slug, level: levelParam }: { slug: string; level: string | null }) {
  const item = featuredBySlug(slug);
  const level: DifficultyLevel = levelParam && LEVELS.includes(levelParam as DifficultyLevel) ? (levelParam as DifficultyLevel) : "beginner";
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const data = useMemo<SimulationResponse | null>(() => {
    if (!item) return null;
    return {
      topic: {
        id: `featured-${item.slug}`,
        title: item.title,
        description: item.blurb,
        narration: item.steps.map((s) => s.subtitle),
        visualTheme: "featured"
      },
      problemSets: featuredProblemSets(item),
      openingMessage: item.steps[0]?.subtitle ?? "",
      generationSource: "featured",
      explanation_script: item.steps.map((s) => `${s.concept}: ${s.subtitle}`).join(" "),
      simulation_steps: item.steps
    };
  }, [item]);

  useEffect(() => {
    api.preferences().then((r) => setPreferences(r.preferences)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!item) return;
    void api
      .recordInteraction({
        topicId: `featured-${item.slug}`,
        type: "text",
        input: item.title,
        output: item.steps[0]?.subtitle ?? item.blurb,
        meta: { source: "simulation-generator", level, generationSource: "featured", featured: item.slug }
      })
      .catch(() => undefined);
  }, [item, level]);

  if (!data) {
    return (
      <div className="py-24 text-center">
        <p className="text-fg-muted">That simulation doesn&apos;t exist.</p>
        <ButtonLink href="/dashboard/" className="mt-6">
          Go to dashboard
        </ButtonLink>
      </div>
    );
  }
  return <Player key={`${data.topic.id}-${level}`} data={data} level={level} preferences={preferences} />;
}

function GeneratedView() {
  const params = useSearchParams();
  const topic = (params.get("topic") ?? "").trim();
  const levelParam = params.get("level") as DifficultyLevel | null;
  const level: DifficultyLevel = levelParam && LEVELS.includes(levelParam) ? levelParam : "beginner";

  const [attempt, setAttempt] = useState(0);
  // Each result remembers which request produced it, so a new topic shows the loader immediately.
  const requestKey = `${topic}::${level}::${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: SimulationResponse; error?: string } | null>(null);
  const current = result?.key === requestKey ? result : null;
  const data = current?.data ?? null;
  const error = current?.error ?? "";
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  useEffect(() => {
    api.preferences().then((r) => setPreferences(r.preferences)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (topic.length < 2) return;
    let cancelled = false;
    api
      .simulation({ topic, level })
      .then((response) => {
        if (!cancelled) setResult({ key: requestKey, data: response });
      })
      .catch((caught: Error) => {
        if (!cancelled) setResult({ key: requestKey, error: caught.message });
      });
    return () => {
      cancelled = true;
    };
  }, [topic, level, requestKey]);

  if (topic.length < 2) {
    return (
      <div className="py-24 text-center">
        <p className="text-fg-muted">Pick a topic to start.</p>
        <ButtonLink href="/dashboard/" className="mt-6">
          Go to dashboard
        </ButtonLink>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold text-fg">We couldn&apos;t build this simulation</h1>
        <p className="mt-2 text-sm text-fg-muted">{error}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => setAttempt((value) => value + 1)}>
            <RotateCcw className="size-4" /> Try again
          </Button>
          <ButtonLink href="/dashboard/" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </div>
      </div>
    );
  }
  if (!data) {
    return <GenerationProgress topic={topic} level={level} />;
  }
  return <Player key={`${data.topic.id}-${level}`} data={data} level={level} preferences={preferences} />;
}

interface Toast {
  id: number;
  heard?: string;
  text: string;
  tone?: "info" | "warn";
}

function Player({
  data,
  level,
  preferences
}: {
  data: SimulationResponse;
  level: DifficultyLevel;
  preferences: UserPreferences | null;
}) {
  const [steps, setSteps] = useState<SimulationStep[]>(data.simulation_steps);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  // null = follow the saved preference until the learner toggles it here.
  const [narrationOverride, setNarrationOverride] = useState<boolean | null>(null);
  const narrationOn = narrationOverride ?? preferences?.voiceSettings.narrationEnabled ?? true;
  const setNarrationOn = (update: (value: boolean) => boolean) => setNarrationOverride(update(narrationOn));
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [tab, setTab] = useState<Tab>("tutor");
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const speakingRef = useRef(false);

  const rate = preferences?.voiceSettings.rate ?? 1;
  const voiceName = preferences?.voiceSettings.voiceName ?? "";
  const topicTitle = data.topic.title;

  const player = usePlayer(steps, {
    autoPlay: false,
    canAdvance: () => !speakingRef.current,
    onFinish: () => setFinished(true)
  });
  const { index, step, playing, setPlaying, goTo } = player;

  const showToast = useCallback((next: Omit<Toast, "id">) => {
    const id = Date.now();
    setToast({ ...next, id });
    window.setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 6000);
  }, []);

  // Narrate the current step while playing. The player waits for narration before advancing.
  useEffect(() => {
    if (!playing || !narrationOn || !step) {
      stopNarration();
      speakingRef.current = false;
      return;
    }
    speakingRef.current = true;
    narrate(step.subtitle, { rate, voiceName, onEnd: () => (speakingRef.current = false) });
    // Only the next step is prepared ahead, so credits are spent on steps people actually reach.
    const upcoming = steps[index + 1];
    if (upcoming) prefetchNarration(upcoming.subtitle);
    return () => {
      stopNarration();
      speakingRef.current = false;
    };
  }, [index, playing, narrationOn, step, steps, rate, voiceName]);

  useEffect(() => () => stopNarration(), []);

  const start = () => {
    setStarted(true);
    setFinished(false);
    setPlaying(true);
  };

  const previous = () => {
    if (index === 0) return;
    goTo(index - 1);
    void api
      .actionFeedback({ topicId: data.topic.id, actionType: "back", detail: `Returned to step ${index}: ${steps[index - 1]?.concept}` })
      .catch(() => undefined);
  };

  const applyVoiceAction = useCallback(
    (action: VoiceActionResponse) => {
      const p = action.action_params ?? {};
      switch (action.action_type) {
        case "next_step":
          goTo(index + 1);
          setPlaying(true);
          break;
        case "previous_step":
          goTo(index - 1);
          setPlaying(true);
          break;
        case "jump_to_step":
          if (typeof p.step_number === "number") {
            goTo(p.step_number - 1);
            setPlaying(true);
          }
          break;
        case "play":
          setStarted(true);
          setPlaying(true);
          break;
        case "pause":
          setPlaying(false);
          break;
        case "restart":
          goTo(0);
          setFinished(false);
          setPlaying(true);
          break;
        case "toggle_subtitles":
          setSubtitlesOn((value) => !value);
          break;
        case "toggle_voice":
          setNarrationOverride((value) => !(value ?? preferences?.voiceSettings.narrationEnabled ?? true));
          break;
        case "move_element":
        case "modify_element": {
          const label = String(p.element_label ?? "").toLowerCase();
          if (!label) break;
          setSteps((current) =>
            current.map((item, i) => {
              if (i !== index) return item;
              const elements = item.canvas_instructions.elements.map((element) => {
                if (!String(element.label ?? "").toLowerCase().includes(label)) return element;
                if (action.action_type === "move_element") {
                  return { ...element, x: p.target_x ?? element.x, y: p.target_y ?? element.y };
                }
                return p.property ? { ...element, [p.property]: p.new_value } : element;
              });
              return { ...item, canvas_instructions: { elements } };
            })
          );
          break;
        }
        default:
          break;
      }
    },
    [goTo, index, setPlaying, preferences]
  );

  const voiceCommand = async () => {
    if (listening) return;
    const wasPlaying = playing;
    setPlaying(false);
    stopNarration();
    setListening(true);
    try {
      const heard = await listenOnce().promise;
      if (!heard) {
        showToast({ text: "I didn't catch that. Try again.", tone: "warn" });
        if (wasPlaying) setPlaying(true);
        return;
      }
      const action = await api.voiceAction({
        topicId: data.topic.id,
        topicTitle,
        userSpeech: heard,
        stepConcept: step?.concept ?? "Current step",
        stepNumber: index + 1
      });
      applyVoiceAction(action);
      speak(action.spoken_response, { rate, voiceName });
      showToast({ heard, text: [action.spoken_response, action.feedback].filter(Boolean).join(" ") });
    } catch (caught) {
      showToast({ text: (caught as Error).message, tone: "warn" });
    } finally {
      setListening(false);
    }
  };

  // Keyboard: space plays/pauses, arrows step. Ignored while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === " ") {
        event.preventDefault();
        if (!started) start();
        else player.toggle();
      } else if (event.key === "ArrowRight") {
        goTo(index + 1);
      } else if (event.key === "ArrowLeft") {
        previous();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const words = step?.subtitle.split(/\s+/) ?? [];
  const revealed = Math.max(1, Math.ceil(words.length * Math.min(1, player.progress * 1.15)));

  return (
    <div className="grid gap-5 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-line-strong">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Link href="/dashboard/" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/5 hover:text-fg" aria-label="Back to dashboard">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-fg">{topicTitle}</h1>
            <p className="truncate text-xs text-fg-subtle">
              Step {index + 1} of {steps.length} · {step?.concept}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {data.generationSource === "featured" ? <Badge tone="mint">Curated</Badge> : null}
            {data.generationSource === "template" ? (
              <Badge tone="amber">Basic version, the AI was unavailable</Badge>
            ) : null}
            <Badge tone={level === "beginner" ? "cyan" : level === "intermediate" ? "violet" : "signal"}>{capitalize(level)}</Badge>
          </div>
        </header>

        <div className="relative min-h-[320px] flex-1 bg-blueprint-fine">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(0_212_255/0.05),transparent_70%)]" />
          <SimulationCanvas step={step} paused={!playing} className="absolute inset-0" />

          <AnimatePresence>
            {!started ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 grid place-items-center bg-ink-950/55 backdrop-blur-[2px]"
              >
                <div className="text-center">
                  <motion.button
                    type="button"
                    onClick={start}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                    className="relative grid size-20 place-items-center rounded-full bg-fg text-ink-950 shadow-[0_0_60px_-10px_rgb(0_212_255/0.8)]"
                    aria-label="Start simulation"
                  >
                    <motion.span
                      className="absolute inset-0 rounded-full ring-2 ring-cyan/50"
                      animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                    <Play className="size-8 translate-x-0.5" />
                  </motion.button>
                  <p className="mt-4 text-sm text-fg">{steps.length} narrated steps</p>
                  <p className="mt-1 text-xs text-fg-subtle">Space to play or pause · ← → to move between steps</p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {finished ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-3 rounded-2xl bg-ink-850/95 p-4 ring-1 ring-line-strong backdrop-blur"
              >
                <GraduationCap className="size-5 text-mint" />
                <span className="text-sm text-fg">You&apos;ve watched every step. Ready to test yourself?</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setFinished(false); player.restart(); }}>
                    <RotateCcw className="size-3.5" /> Replay
                  </Button>
                  <Button size="sm" onClick={() => setTab("practice")}>
                    Practise now
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {toast ? (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "absolute left-1/2 top-4 w-[min(92%,520px)] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm ring-1 backdrop-blur",
                  toast.tone === "warn" ? "bg-amber/10 text-fg ring-amber/30" : "bg-ink-850/95 text-fg ring-line-strong"
                )}
              >
                {toast.heard ? <p className="text-xs text-fg-subtle">You said “{toast.heard}”</p> : null}
                <p className="mt-0.5">{toast.text}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {subtitlesOn && started ? (
          <div className="border-t border-line bg-ink-850/80 px-5 py-3.5">
            <p className="min-h-[3rem] text-[15px] leading-relaxed text-fg" aria-live="polite">
              {words.map((word, i) => (
                <span key={`${index}-${i}`} className={cn("transition-opacity duration-300", i < revealed ? "opacity-100" : "opacity-25")}>
                  {word}{" "}
                </span>
              ))}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={previous} disabled={index === 0} className="grid size-9 place-items-center rounded-lg text-fg-muted transition hover:bg-white/5 hover:text-fg disabled:opacity-30" aria-label="Previous step">
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => (started ? player.toggle() : start())}
            className="grid size-10 place-items-center rounded-full bg-fg text-ink-950 transition hover:bg-white"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <button type="button" onClick={() => goTo(index + 1)} disabled={index >= steps.length - 1} className="grid size-9 place-items-center rounded-lg text-fg-muted transition hover:bg-white/5 hover:text-fg disabled:opacity-30" aria-label="Next step">
            <ChevronRight className="size-5" />
          </button>

          <div className="mx-2 flex min-w-[160px] flex-1 gap-1">
            {steps.map((item, i) => (
              <button
                key={item.step}
                type="button"
                onClick={() => goTo(i)}
                title={`${i + 1}. ${item.concept}`}
                className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10 transition hover:bg-white/20"
                aria-label={`Step ${i + 1}: ${item.concept}`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan to-violet"
                  style={{ width: i < index ? "100%" : i === index ? `${player.progress * 100}%` : "0%" }}
                />
              </button>
            ))}
          </div>

          <ToggleButton on={narrationOn} onClick={() => setNarrationOn((value) => !value)} label="Narration" iconOn={Volume2} iconOff={VolumeX} />
          <ToggleButton on={subtitlesOn} onClick={() => setSubtitlesOn((value) => !value)} label="Subtitles" iconOn={Captions} iconOff={CaptionsOff} />
          {canListen() ? (
            <button
              type="button"
              onClick={voiceCommand}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-3 text-sm ring-1 transition",
                listening ? "bg-signal/15 text-signal ring-signal/40" : "text-fg-muted ring-line hover:bg-white/5 hover:text-fg"
              )}
              aria-label="Voice command"
            >
              {listening ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
              <span className="hidden sm:inline">{listening ? "Listening" : "Voice"}</span>
            </button>
          ) : null}
        </div>
      </section>

      <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-line-strong">
        <div className="flex gap-1 border-b border-line p-2">
          {(
            [
              ["tutor", "Tutor", MessageSquareText],
              ["steps", "Steps", ListOrdered],
              ["practice", "Practice", GraduationCap]
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn("relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm transition", tab === id ? "text-fg" : "text-fg-muted hover:text-fg")}
            >
              {tab === id ? (
                <motion.span layoutId="learn-tab" className="absolute inset-0 rounded-lg bg-white/[0.06] ring-1 ring-line" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              ) : null}
              <Icon className="relative size-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {tab === "tutor" ? (
            <ChatPanel topicId={data.topic.id} topicTitle={topicTitle} voiceRate={rate} voiceName={voiceName} onEngage={() => setPlaying(false)} />
          ) : tab === "steps" ? (
            <ol className="h-full space-y-1.5 overflow-y-auto p-3">
              {steps.map((item, i) => (
                <li key={item.step}>
                  <button
                    type="button"
                    onClick={() => {
                      goTo(i);
                      if (!started) start();
                    }}
                    className={cn("w-full rounded-xl p-3 text-left ring-1 transition", i === index ? "bg-cyan/10 ring-cyan/30" : "ring-transparent hover:bg-white/[0.04]")}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn("font-mono text-xs", i === index ? "text-cyan" : "text-fg-subtle")}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-sm font-medium text-fg">{item.concept}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-fg-muted">{item.subtitle}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <PracticePanel topicId={data.topic.id} problemSets={data.problemSets} initialLevel={level} />
          )}
        </div>
      </aside>
    </div>
  );
}

function ToggleButton({
  on,
  onClick,
  label,
  iconOn: IconOn,
  iconOff: IconOff
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  iconOn: React.ComponentType<{ className?: string }>;
  iconOff: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={`${label} ${on ? "on" : "off"}`}
      className={cn("grid size-9 place-items-center rounded-lg transition hover:bg-white/5", on ? "text-fg" : "text-fg-subtle")}
      aria-label={label}
    >
      {on ? <IconOn className="size-4" /> : <IconOff className="size-4" />}
    </button>
  );
}

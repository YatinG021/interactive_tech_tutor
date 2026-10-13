"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Clock3, Cpu, GitBranch, Network, PlayCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import { FEATURED } from "@/data/featured";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Badge, Button, Card, Segmented } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DifficultyLevel, InteractionRecord, ProgressRecord } from "@/lib/types";
import { capitalize, featuredHref, formatRelative, learnHref, prettyTopic } from "@/lib/utils";

const SUGGESTIONS = [
  "How DNS resolution works",
  "Binary search trees",
  "How HTTPS encrypts traffic",
  "Merge sort",
  "Gradient descent",
  "Database indexing",
  "Load balancing",
  "How a CPU cache works"
];

const LEVEL_OPTIONS = [
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" }
];

interface RecentSession {
  topic: string;
  level: DifficultyLevel;
  timestamp: string;
  source: string;
  featured?: string;
}

const FEATURED_ICONS = { "binary-search": Search, "binary-search-tree": GitBranch, dijkstra: Network, "tls-handshake": ShieldCheck, "virtual-memory": Cpu } as const;
const DIFFICULTY_TONE = { Easy: "mint", Medium: "amber", Hard: "signal" } as const;

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<DifficultyLevel>("beginner");
  const [history, setHistory] = useState<InteractionRecord[] | null>(null);
  const [progress, setProgress] = useState<ProgressRecord[] | null>(null);

  useEffect(() => {
    api.history().then((r) => setHistory(r.history)).catch(() => setHistory([]));
    api.progress().then((r) => setProgress(r.progress)).catch(() => setProgress([]));
  }, []);

  const recent = useMemo<RecentSession[]>(() => {
    if (!history) return [];
    const seen = new Set<string>();
    const sessions: RecentSession[] = [];
    for (const item of [...history].reverse()) {
      if (item.meta?.source !== "simulation-generator") continue;
      const sessionLevel = (item.meta.level as DifficultyLevel) ?? "beginner";
      const key = `${item.input.toLowerCase()}::${sessionLevel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sessions.push({
        topic: item.input,
        level: sessionLevel,
        timestamp: item.timestamp,
        source: String(item.meta.generationSource ?? "ai"),
        featured: typeof item.meta.featured === "string" ? item.meta.featured : undefined
      });
      if (sessions.length === 6) break;
    }
    return sessions;
  }, [history]);

  const stats = useMemo(() => {
    const records = progress ?? [];
    return {
      completed: records.filter((r) => r.status === "completed").length,
      inProgress: records.filter((r) => r.status === "in-progress").length,
      best: records.reduce((max, r) => Math.max(max, r.score), 0)
    };
  }, [progress]);

  const start = (value: string, chosenLevel: DifficultyLevel = level) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    router.push(learnHref(trimmed, chosenLevel));
  };

  const firstName = (user?.name ?? "").split(" ")[0] || "there";

  return (
    <div className="space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl bg-ink-850 p-7 ring-1 ring-line-strong sm:p-10"
      >
        <div className="absolute inset-0 bg-blueprint opacity-70 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(0_212_255/0.25),transparent)] blur-2xl" />
        <div className="relative max-w-2xl">
          <p className="text-sm text-fg-muted">Hi {firstName},</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            What do you want to <span className="font-display font-normal italic text-gradient">see explained</span>?
          </h1>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              start(topic);
            }}
            className="mt-7 space-y-4"
          >
            <div className="flex flex-col gap-2 rounded-2xl bg-ink-950/70 p-2 ring-1 ring-line-strong sm:flex-row">
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Type any technical topic…"
                aria-label="Topic"
                maxLength={120}
                autoFocus
                className="h-12 flex-1 rounded-xl bg-transparent px-4 text-base text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              <Button type="submit" size="lg" disabled={topic.trim().length < 2}>
                <Sparkles className="size-4" /> Generate
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={level} options={LEVEL_OPTIONS} onChange={setLevel} />
              <span className="text-xs text-fg-subtle">New topics take about 20–40 seconds. Repeats open instantly.</span>
            </div>
          </form>
        </div>
      </motion.section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">Curated simulations</h2>
            <p className="mt-1 text-sm text-fg-muted">Hand-built diagrams, open instantly, with a quiz at three levels.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURED.map((item, i) => {
            const Icon = FEATURED_ICONS[item.slug as keyof typeof FEATURED_ICONS] ?? Sparkles;
            return (
              <motion.div key={item.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05 }}>
                <Link
                  href={featuredHref(item.slug)}
                  className="group flex h-full flex-col rounded-2xl bg-ink-850 p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:bg-ink-800 hover:ring-line-strong"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-xl bg-white/5 ring-1 ring-line transition group-hover:ring-cyan/40">
                      <Icon className="size-4 text-cyan" />
                    </span>
                    <Badge tone={DIFFICULTY_TONE[item.difficulty]}>{item.difficulty}</Badge>
                  </div>
                  <p className="mt-4 font-medium leading-snug text-fg">{item.title}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-fg-subtle">{item.subject}</p>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-fg-muted">{item.blurb}</p>
                  <span className="mt-auto pt-4 text-xs text-fg-subtle">{item.steps.length} steps</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wider text-fg-subtle">Or generate any topic</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion, i) => (
            <motion.button
              key={suggestion}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              onClick={() => start(suggestion)}
              className="rounded-full bg-white/[0.04] px-3.5 py-2 text-sm text-fg-muted ring-1 ring-line transition hover:bg-white/10 hover:text-fg"
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-fg">Recent simulations</h2>
            <Link href="/progress/" className="text-sm text-fg-muted hover:text-fg">
              See all history
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {history === null ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-850 ring-1 ring-line" />
              ))
            ) : recent.length === 0 ? (
              <Card className="col-span-full p-6 text-sm text-fg-muted">
                No simulations yet. Generate your first one above.
              </Card>
            ) : (
              recent.map((session, i) => (
                <motion.div
                  key={`${session.topic}-${session.level}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={session.featured ? featuredHref(session.featured, session.level) : learnHref(session.topic, session.level)}
                    className="group flex h-full flex-col justify-between gap-3 rounded-2xl bg-ink-850 p-4 ring-1 ring-line transition hover:bg-ink-800 hover:ring-line-strong"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-fg">{session.topic}</span>
                      <PlayCircle className="size-5 shrink-0 text-fg-subtle transition group-hover:text-cyan" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-fg-subtle">
                      <Badge tone={session.level === "beginner" ? "cyan" : session.level === "intermediate" ? "violet" : "signal"}>
                        {capitalize(session.level)}
                      </Badge>
                      <Clock3 className="size-3.5" /> {formatRelative(session.timestamp)}
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg">Your progress</h2>
          <Card className="mt-4 p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Levels passed", value: stats.completed },
                { label: "In progress", value: stats.inProgress },
                { label: "Best score", value: `${Math.round(stats.best)}%` }
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-ink-900 px-2 py-4 ring-1 ring-line">
                  <div className="text-2xl font-semibold text-fg">{progress === null ? "–" : stat.value}</div>
                  <div className="mt-1 text-[11px] text-fg-subtle">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              {(progress ?? []).slice(-4).reverse().map((record) => (
                <div key={`${record.topicId}-${record.level}`} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className={record.status === "completed" ? "size-4 text-mint" : "size-4 text-fg-subtle"} />
                  <span className="truncate text-fg-muted">{prettyTopic(record.topicId)}</span>
                  <span className="ml-auto text-xs text-fg-subtle">{capitalize(record.level)}</span>
                </div>
              ))}
            </div>
            <Link href="/progress/" className="mt-5 inline-flex items-center gap-1.5 text-sm text-cyan hover:underline">
              View progress <ArrowRight className="size-3.5" />
            </Link>
          </Card>
        </section>
      </div>
    </div>
  );
}

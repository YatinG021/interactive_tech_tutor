"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bot, Hand, Image as ImageIcon, MessageSquareText, Mic, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { InteractionRecord, ProgressRecord } from "@/lib/types";
import { LEVELS } from "@/lib/types";
import { capitalize, cn, formatRelative, prettyTopic } from "@/lib/utils";

export default function ProgressPage() {
  return (
    <AppShell>
      <ProgressView />
    </AppShell>
  );
}

const typeIcon = { text: MessageSquareText, voice: Mic, action: Hand, visual: ImageIcon } as const;

function ProgressView() {
  const [progress, setProgress] = useState<ProgressRecord[] | null>(null);
  const [history, setHistory] = useState<InteractionRecord[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.progress().then((r) => setProgress(r.progress)).catch((e: Error) => setError(e.message));
    api.history().then((r) => setHistory(r.history)).catch((e: Error) => setError(e.message));
  }, []);

  const topics = useMemo(() => {
    const byTopic = new Map<string, ProgressRecord[]>();
    for (const record of progress ?? []) {
      byTopic.set(record.topicId, [...(byTopic.get(record.topicId) ?? []), record]);
    }
    return [...byTopic.entries()];
  }, [progress]);

  const historyByTopic = useMemo(() => {
    const groups = new Map<string, InteractionRecord[]>();
    for (const item of [...(history ?? [])].reverse()) {
      groups.set(item.topicId, [...(groups.get(item.topicId) ?? []), item]);
    }
    return [...groups.entries()];
  }, [history]);

  const titleFor = (topicId: string) => {
    const generated = (history ?? []).find((item) => item.topicId === topicId && item.meta?.source === "simulation-generator");
    return generated?.input ?? prettyTopic(topicId);
  };

  const remove = async (topicId: string) => {
    setDeleting(topicId);
    try {
      await api.deleteHistory(topicId);
      setHistory((current) => (current ?? []).filter((item) => item.topicId !== topicId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <PageHeader title="Progress" subtitle="Levels you've passed and everything you've asked, by topic." />
      {error ? <p className="mb-6 rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal ring-1 ring-signal/25">{error}</p> : null}

      <section>
        <h2 className="text-lg font-semibold text-fg">Levels</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {progress === null ? (
            <div className="h-28 animate-pulse rounded-2xl bg-ink-850 ring-1 ring-line" />
          ) : topics.length === 0 ? (
            <Card className="p-6 text-sm text-fg-muted md:col-span-2">Finish a practice quiz to see your levels here.</Card>
          ) : (
            topics.map(([topicId, records], i) => (
              <motion.div key={topicId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-5">
                  <p className="font-medium text-fg">{titleFor(topicId)}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {LEVELS.map((level) => {
                      const record = records.find((item) => item.level === level);
                      const tone = record?.status === "completed" ? "mint" : record?.status === "in-progress" ? "amber" : "neutral";
                      return (
                        <div key={level} className="rounded-xl bg-ink-900 p-3 ring-1 ring-line">
                          <p className="text-[11px] text-fg-subtle">{capitalize(level)}</p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                            <motion.div
                              className={cn("h-full rounded-full", tone === "mint" ? "bg-mint" : tone === "amber" ? "bg-amber" : "bg-white/10")}
                              initial={{ width: 0 }}
                              animate={{ width: `${record?.score ?? 0}%` }}
                              transition={{ duration: 0.9, delay: 0.2 }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <Badge tone={tone}>{record ? capitalize(record.status.replace("-", " ")) : "Locked"}</Badge>
                            {record && record.score > 0 ? <span className="text-xs text-fg-muted">{Math.round(record.score)}%</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">History</h2>
        <div className="mt-4 space-y-4">
          {history === null ? (
            <div className="h-40 animate-pulse rounded-2xl bg-ink-850 ring-1 ring-line" />
          ) : historyByTopic.length === 0 ? (
            <Card className="p-6 text-sm text-fg-muted">No activity yet.</Card>
          ) : (
            <AnimatePresence initial={false}>
              {historyByTopic.map(([topicId, items]) => (
                <motion.div key={topicId} layout exit={{ opacity: 0, height: 0 }}>
                  <Card className="overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                      <Sparkles className="size-4 text-cyan" />
                      <p className="font-medium text-fg">{titleFor(topicId)}</p>
                      <span className="text-xs text-fg-subtle">{items.length} items</span>
                      <Button variant="ghost" size="sm" className="ml-auto" loading={deleting === topicId} onClick={() => remove(topicId)}>
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </div>
                    <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                      {items.map((item) => {
                        const Icon = item.meta?.source === "simulation-generator" ? Sparkles : item.type === "text" ? Bot : typeIcon[item.type];
                        return (
                          <li key={item.id} className="flex gap-3 px-5 py-3 text-sm">
                            <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-fg">{item.input}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{item.output}</p>
                            </div>
                            <span className="shrink-0 text-xs text-fg-subtle">{formatRelative(item.timestamp)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </section>
    </>
  );
}

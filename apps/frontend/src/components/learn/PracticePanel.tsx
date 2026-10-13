"use client";

import { AnimatePresence, motion } from "motion/react";
import { Award, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { DifficultyLevel, ProblemSet } from "@/lib/types";
import { LEVELS } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { Badge, Button } from "@/components/ui/primitives";

interface Props {
  topicId: string;
  problemSets: ProblemSet[];
  initialLevel: DifficultyLevel;
}

export function PracticePanel({ topicId, problemSets, initialLevel }: Props) {
  const available = LEVELS.filter((level) => problemSets.some((set) => set.level === level));
  const [level, setLevel] = useState<DifficultyLevel>(available.includes(initialLevel) ? initialLevel : available[0]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; unlocked: DifficultyLevel | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [startedAt] = useState(() => Date.now());

  const set = useMemo(() => problemSets.find((item) => item.level === level), [problemSets, level]);

  if (!set) {
    return <p className="p-5 text-sm text-fg-muted">No practice questions for this topic yet.</p>;
  }

  const answered = set.problems.filter((problem) => answers[problem.id]).length;

  const submit = async () => {
    const correct = set.problems.filter((problem) => answers[problem.id] === problem.answer).length;
    const score = Math.round((correct / set.problems.length) * 100);
    const passed = score >= set.passingScore;
    setSaving(true);
    setError("");
    try {
      const response = await api.updateProgress({
        topicId,
        level: set.level,
        status: passed ? "completed" : "in-progress",
        score,
        passingScore: set.passingScore,
        timeSpent: Math.max(30, Math.round((Date.now() - startedAt) / 1000))
      });
      setResult({ score, passed, unlocked: response.unlockedLevel });
    } catch (caught) {
      setResult({ score, passed, unlocked: null });
      setError(`Your score wasn't saved: ${(caught as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const reset = (nextLevel = level) => {
    setLevel(nextLevel);
    setAnswers({});
    setResult(null);
    setError("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1.5 border-b border-line p-3">
        {available.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => reset(item)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              item === level ? "bg-ink-700 text-fg ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
            )}
          >
            {capitalize(item)}
          </button>
        ))}
        <Badge className="ml-auto" tone="neutral">
          Pass at {set.passingScore}%
        </Badge>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <AnimatePresence>
          {result ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "rounded-2xl p-4 ring-1",
                result.passed ? "bg-mint/10 ring-mint/30" : "bg-amber/10 ring-amber/30"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl font-semibold text-fg">{result.score}%</span>
                <span className="text-sm text-fg-muted">
                  {result.passed ? "Passed. Nice work." : `You need ${set.passingScore}% to pass. Review and try again.`}
                </span>
              </div>
              {result.unlocked ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, type: "spring" }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet/15 px-3 py-1.5 text-sm font-medium text-fg ring-1 ring-violet/40"
                >
                  <Award className="size-4 text-violet" /> {capitalize(result.unlocked)} unlocked
                </motion.div>
              ) : null}
              {error ? <p className="mt-2 text-xs text-signal">{error}</p> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {set.problems.map((problem, index) => {
          const chosen = answers[problem.id];
          return (
            <div key={problem.id}>
              <p className="text-sm font-medium text-fg">
                <span className="mr-2 font-mono text-xs text-fg-subtle">{index + 1}.</span>
                {problem.question}
              </p>
              <div className="mt-2.5 space-y-1.5">
                {problem.choices.map((choice) => {
                  const isChosen = chosen === choice;
                  const isAnswer = choice === problem.answer;
                  const reveal = result !== null;
                  return (
                    <button
                      key={choice}
                      type="button"
                      disabled={reveal}
                      onClick={() => setAnswers((current) => ({ ...current, [problem.id]: choice }))}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm ring-1 transition",
                        reveal && isAnswer
                          ? "bg-mint/10 text-fg ring-mint/40"
                          : reveal && isChosen
                            ? "bg-signal/10 text-fg ring-signal/40"
                            : isChosen
                              ? "bg-cyan/10 text-fg ring-cyan/40"
                              : "bg-white/[0.03] text-fg-muted ring-line hover:bg-white/[0.06] hover:text-fg"
                      )}
                    >
                      {choice}
                      {reveal && isAnswer ? <CheckCircle2 className="size-4 shrink-0 text-mint" /> : null}
                      {reveal && isChosen && !isAnswer ? <XCircle className="size-4 shrink-0 text-signal" /> : null}
                    </button>
                  );
                })}
              </div>
              {result ? <p className="mt-2 text-xs leading-relaxed text-fg-muted">{problem.explanation}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-line p-3">
        <span className="text-xs text-fg-subtle">
          {answered}/{set.problems.length} answered
        </span>
        {result ? (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => reset()}>
            <RotateCcw className="size-3.5" /> Try again
          </Button>
        ) : (
          <Button
            size="sm"
            className="ml-auto"
            disabled={answered < set.problems.length}
            loading={saving}
            onClick={submit}
          >
            Check answers
          </Button>
        )}
      </div>
    </div>
  );
}

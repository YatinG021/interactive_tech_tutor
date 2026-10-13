"use client";

import { motion } from "motion/react";
import { Check, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button, Card, Segmented } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { getVoiceEngine, narrate, setVoiceEngine, type VoiceEngine } from "@/lib/narration";
import { canSpeak, listVoices, speak } from "@/lib/speech";
import type { UserPreferences } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsView />
    </AppShell>
  );
}

type Draft = Omit<UserPreferences, "userId">;

const DEFAULTS: Draft = {
  interactionMode: "both",
  voiceSettings: { narrationEnabled: true, interactionEnabled: true, navigationEnabled: true, rate: 1, voiceName: "" }
};

function SettingsView() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // Rendered only after sign-in on the client, so localStorage is available here.
  const [engine, setEngine] = useState<VoiceEngine>(() => getVoiceEngine());

  useEffect(() => {
    api
      .preferences()
      .then(({ preferences }) => setDraft({ interactionMode: preferences.interactionMode, voiceSettings: preferences.voiceSettings }))
      .catch(() => setDraft(DEFAULTS));
    if (!canSpeak()) return;
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  if (!draft) {
    return <div className="h-96 animate-pulse rounded-2xl bg-ink-850 ring-1 ring-line" />;
  }

  const setVoice = (patch: Partial<Draft["voiceSettings"]>) => {
    setSaved(false);
    setDraft({ ...draft, voiceSettings: { ...draft.voiceSettings, ...patch } });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.savePreferences(draft);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="How you'd like to control simulations and hear narration."
        actions={
          <Button onClick={save} loading={saving}>
            {saved ? <Check className="size-4" /> : null}
            {saved ? "Saved" : "Save changes"}
          </Button>
        }
      />
      {error ? <p className="mb-6 rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal ring-1 ring-signal/25">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold text-fg">Interaction</h2>
          <p className="mt-1 text-sm text-fg-muted">Choose how you&apos;d like to move through a simulation.</p>
          <Segmented
            className="mt-5"
            value={draft.interactionMode}
            onChange={(interactionMode) => {
              setSaved(false);
              setDraft({ ...draft, interactionMode });
            }}
            options={[
              { value: "both", label: "Voice and click" },
              { value: "click", label: "Click only" },
              { value: "voice", label: "Voice first" }
            ]}
          />
          <div className="mt-6 space-y-1">
            <Toggle
              label="Voice commands during simulations"
              description="Say next, back, pause or “go to step 3”."
              checked={draft.voiceSettings.interactionEnabled}
              onChange={(interactionEnabled) => setVoice({ interactionEnabled })}
            />
            <Toggle
              label="Voice navigation in menus"
              description="Keep voice control available outside the player."
              checked={draft.voiceSettings.navigationEnabled}
              onChange={(navigationEnabled) => setVoice({ navigationEnabled })}
            />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-fg">Narration</h2>
          <p className="mt-1 text-sm text-fg-muted">Subtitles stay on even when narration is muted.</p>
          <div className="mt-5">
            <span className="text-sm font-medium text-fg">Voice engine</span>
            <Segmented
              className="mt-2"
              value={engine}
              onChange={(value) => {
                setEngine(value);
                setVoiceEngine(value);
              }}
              options={[
                { value: "natural", label: "Natural (Sarvam)" },
                { value: "browser", label: "Browser voice" }
              ]}
            />
            <p className="mt-2 text-xs text-fg-muted">
              The natural voice is a human-sounding Sarvam Bulbul voice. Each narration is generated once and cached.
              The browser voice works offline.
            </p>
          </div>
          <div className="mt-5 space-y-1">
            <Toggle
              label="Read each step aloud"
              checked={draft.voiceSettings.narrationEnabled}
              onChange={(narrationEnabled) => setVoice({ narrationEnabled })}
            />
          </div>
          <label className="mt-6 block">
            <span className="flex items-center justify-between text-sm">
              <span className="font-medium text-fg">Speed</span>
              <span className="font-mono text-fg-muted">{draft.voiceSettings.rate.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={draft.voiceSettings.rate}
              onChange={(event) => setVoice({ rate: Number(event.target.value) })}
              className="mt-3 w-full accent-cyan"
            />
          </label>
          <label className="mt-6 block">
            <span className="text-sm font-medium text-fg">Browser voice</span>
            <select
              value={draft.voiceSettings.voiceName}
              onChange={(event) => setVoice({ voiceName: event.target.value })}
              className="mt-2 h-11 w-full rounded-xl bg-ink-900 px-3 text-sm text-fg ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-cyan/60"
            >
              <option value="">Browser default</option>
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            disabled={!canSpeak()}
            onClick={() => {
              const sample = "This is how each step will sound.";
              const voice = { rate: draft.voiceSettings.rate, voiceName: draft.voiceSettings.voiceName };
              if (engine === "natural") narrate(sample, voice);
              else speak(sample, voice);
            }}
          >
            <Volume2 className="size-3.5" /> Preview voice
          </Button>
        </Card>
      </div>
    </>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.03]"
    >
      <span className="flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-fg-muted">{description}</span> : null}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-cyan" : "bg-white/15")}>
        <motion.span
          className="absolute top-0.5 size-5 rounded-full bg-white shadow"
          animate={{ left: checked ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

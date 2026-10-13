"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { ArrowRight, Layers, ListOrdered, Mic, MessageSquareText, Sparkles, Trophy, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { learnHref } from "@/lib/utils";
import { ButtonLink, Logo, buttonClasses } from "@/components/ui/primitives";
import { DemoPlayer } from "./DemoPlayer";

const EXAMPLE_TOPICS = [
  "How DNS resolution works",
  "Binary search trees",
  "TCP three-way handshake",
  "Softmax function",
  "Merge sort",
  "How HTTPS encrypts traffic",
  "Database indexing",
  "Gradient descent",
  "Load balancing",
  "React rendering"
];

const ease = [0.22, 1, 0.36, 1] as const;

export function SiteNav() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-line bg-ink-950/75 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="Interactive Tech Tutor home">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {[
            ["How it works", "#how"],
            ["See it", "#reel"],
            ["Features", "#features"]
          ].map(([label, href]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-fg-muted transition hover:text-fg">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/dashboard/" size="sm">
              Open app <ArrowRight className="size-3.5" />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login/" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup/" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function Hero() {
  const { user } = useAuth();
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const playerY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const glowOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.2]);

  const start = (value: string) => {
    const chosen = value.trim();
    if (chosen.length < 2) return;
    const destination = learnHref(chosen, "beginner");
    router.push(user ? destination : `/signup/?next=${encodeURIComponent(destination)}`);
  };

  return (
    <section ref={ref} className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      <motion.div style={{ opacity: glowOpacity }} className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-blueprint [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(0_212_255/0.22),transparent)] blur-2xl" />
        <div className="absolute top-40 -right-40 h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.2),transparent)] blur-2xl" />
      </motion.div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-fg-muted ring-1 ring-line"
          >
            <Sparkles className="size-3.5 text-cyan" />
            AI-generated, narrated simulations
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease }}
            className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-fg sm:text-6xl lg:text-[4.25rem]"
          >
            Watch any tech concept{" "}
            <span className="font-display text-[1.08em] font-normal italic text-gradient">come alive.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.16, ease }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted"
          >
            Type a topic and get a step-by-step animated simulation with spoken narration. Pause it, ask questions by voice
            or chat, then prove what you learned at three levels.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.24, ease }}
            onSubmit={(event) => {
              event.preventDefault();
              start(topic);
            }}
            className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-ink-900/80 p-2 ring-1 ring-line-strong backdrop-blur sm:flex-row"
          >
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. How DNS resolution works"
              aria-label="Topic to learn"
              maxLength={120}
              className="h-12 flex-1 rounded-xl bg-transparent px-4 text-base text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <button type="submit" className={buttonClasses("primary", "lg")}>
              Generate <ArrowRight className="size-4" />
            </button>
          </motion.form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-4 flex flex-wrap gap-2"
          >
            {EXAMPLE_TOPICS.slice(0, 4).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => start(example)}
                className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-line transition hover:bg-white/10 hover:text-fg"
              >
                {example}
              </button>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1, delay: 0.2, ease }}
          style={{ y: playerY, transformPerspective: 1200 }}
          className="relative"
        >
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-cyan/20 via-transparent to-violet/20 blur-2xl" />
          <DemoPlayer demo="bubbleSort" stepMs={6500} />
          <p className="mt-3 text-center text-xs text-fg-subtle">
            A real simulation from our pipeline, drawn live in your browser.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function MiniTyping() {
  const text = "How DNS resolution works";
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length + 18) i = 0;
    }, 70);
    return () => window.clearInterval(timer);
  }, [inView]);
  return (
    <div ref={ref} className="rounded-xl bg-ink-950/70 p-3 ring-1 ring-line">
      <div className="flex h-9 items-center rounded-lg bg-ink-900 px-3 font-mono text-[12px] text-fg ring-1 ring-line">
        {text.slice(0, Math.min(count, text.length))}
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-cyan" />
      </div>
      <div className="mt-2 flex gap-1.5">
        {["Beginner", "Intermediate", "Advanced"].map((level, i) => (
          <span
            key={level}
            className={`rounded-md px-2 py-1 text-[10px] ring-1 ${i === 0 ? "bg-cyan/10 text-cyan ring-cyan/25" : "text-fg-subtle ring-line"}`}
          >
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniOutline() {
  const rows = ["Your browser asks", "Resolver checks cache", "Root → TLD → authoritative", "Answer is cached"];
  return (
    <div className="space-y-1.5 rounded-xl bg-ink-950/70 p-3 ring-1 ring-line">
      {rows.map((row, i) => (
        <motion.div
          key={row}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: 0.15 + i * 0.22, duration: 0.4, ease }}
          className="flex items-center gap-2 rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] text-fg ring-1 ring-line"
        >
          <span className="font-mono text-cyan">{String(i + 1).padStart(2, "0")}</span>
          {row}
        </motion.div>
      ))}
    </div>
  );
}

function MiniParallel() {
  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-ink-950/70 p-3 ring-1 ring-line">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative h-12 overflow-hidden rounded-lg bg-ink-900 ring-1 ring-line">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan/30 to-violet/30"
            initial={{ width: "0%" }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.4 + (i % 3) * 0.35, ease: "easeInOut", delay: 0.2 }}
          />
          <span className="absolute bottom-1 left-1.5 font-mono text-[9px] text-fg-muted">step {i + 1}</span>
        </div>
      ))}
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    {
      title: "Describe a topic",
      body: "Any technical idea, at beginner, intermediate or advanced depth.",
      visual: <MiniTyping />
    },
    {
      title: "We storyboard it",
      body: "One running example and a visual plan for every step, so the whole story stays consistent.",
      visual: <MiniOutline />
    },
    {
      title: "Every step is drawn at once",
      body: "Steps render in parallel, so a fresh topic is ready in about 20 seconds. Topics already made open instantly.",
      visual: <MiniParallel />
    }
  ];
  return (
    <section id="how" className="relative scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="How it works" title="From a sentence to a simulation" />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: i * 0.1, ease }}
              className="group rounded-2xl bg-ink-850/70 p-5 ring-1 ring-line transition hover:ring-line-strong"
            >
              {step.visual}
              <div className="mt-5 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-white/5 font-mono text-[11px] text-fg-muted ring-1 ring-line">
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold text-fg">{step.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.6, ease }}
      className="mx-auto max-w-2xl text-center"
    >
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-base leading-relaxed text-fg-muted">{body}</p> : null}
    </motion.div>
  );
}

export function FeatureGrid() {
  const features = [
    { icon: Layers, title: "Diagrams that match the words", body: "Each sentence of narration is drawn: values, arrows, swaps and highlights." },
    { icon: Mic, title: "Hands-free control", body: "Say next, back, pause or “go to step 4”. Narration can be muted while subtitles stay." },
    { icon: MessageSquareText, title: "A tutor that stays on topic", body: "Ask follow-ups in text or voice and get short, concrete answers." },
    { icon: ListOrdered, title: "Three levels per topic", body: "Beginner flow, intermediate mechanisms, advanced trade-offs." },
    { icon: Trophy, title: "Progress that sticks", body: "Pass a level's quiz to unlock the next. History stays with your account." },
    { icon: Zap, title: "Fast on repeat", body: "Simulations are cached, so returning to a topic opens it in under a second." }
  ];
  return (
    <section id="features" className="relative scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="Features" title="Built for understanding, not skimming" />
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                className="group relative bg-ink-900 p-6 transition hover:bg-ink-850"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-white/5 ring-1 ring-line transition group-hover:ring-cyan/40">
                  <Icon className="size-5 text-cyan" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-fg">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{feature.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function TopicMarquee() {
  const row = [...EXAMPLE_TOPICS, ...EXAMPLE_TOPICS];
  return (
    <div className="relative overflow-hidden border-y border-line bg-ink-900/60 py-5 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
        {row.map((topic, i) => (
          <span key={`${topic}-${i}`} className="rounded-full bg-white/[0.04] px-4 py-2 text-sm text-fg-muted ring-1 ring-line">
            {topic}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-4xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease }}
          className="relative overflow-hidden rounded-3xl bg-ink-850 px-8 py-14 text-center ring-1 ring-line-strong"
        >
          <div className="absolute inset-0 bg-blueprint opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(0_212_255/0.25),transparent)] blur-2xl" />
          <h2 className="relative text-3xl font-semibold tracking-tight text-fg sm:text-5xl">
            What do you want to <span className="font-display font-normal italic text-gradient">understand</span> today?
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-fg-muted">Free to use. Your first simulation is about 20 seconds away.</p>
          <div className="relative mt-8 flex justify-center gap-3">
            <ButtonLink href={user ? "/dashboard/" : "/signup/"} size="lg">
              {user ? "Open your dashboard" : "Create a free account"} <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-fg-subtle sm:flex-row">
        <Logo />
        <p>Narrated simulations for technical topics. Built on Azure OpenAI.</p>
      </div>
    </footer>
  );
}

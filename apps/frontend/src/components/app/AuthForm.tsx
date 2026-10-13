"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input, Logo } from "@/components/ui/primitives";
import { DemoPlayer } from "@/components/landing/DemoPlayer";

function safeNext(raw: string | null): string {
  // Only allow in-app paths, never an absolute URL.
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard/";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { login, register, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  const isSignup = mode === "signup";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.trim().length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setSubmitting(true);
    try {
      if (isSignup) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      router.replace(next);
    } catch (caught) {
      setError((caught as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto my-auto w-full max-w-sm py-12"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            {isSignup ? "Start learning with narrated simulations." : "Sign in to continue where you left off."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {isSignup ? (
              <Field label="Name" hint="Optional. Shown on your dashboard.">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
              </Field>
            ) : null}
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password" hint={isSignup ? "At least 8 characters." : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
              />
            </Field>
            {error ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="rounded-xl bg-signal/10 px-3.5 py-2.5 text-sm text-signal ring-1 ring-signal/25"
              >
                {error}
              </motion.p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              {isSignup ? "Create account" : "Sign in"}
              {!submitting ? <ArrowRight className="size-4" /> : null}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-fg-muted">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              href={`${isSignup ? "/login/" : "/signup/"}?next=${encodeURIComponent(next)}`}
              className="font-medium text-fg underline-offset-4 hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </motion.div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-line bg-ink-900 lg:block">
        <div className="absolute inset-0 bg-blueprint [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.25),transparent)] blur-2xl" />
        <div className="relative flex h-full flex-col items-center justify-center gap-6 p-12">
          <DemoPlayer demo="softmax" stepMs={6000} className="w-full max-w-lg" />
          <p className="max-w-md text-center text-sm text-fg-muted">
            Every step is a diagram that matches what the narrator says, here explaining how softmax turns scores into
            probabilities.
          </p>
        </div>
      </div>
    </div>
  );
}

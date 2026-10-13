"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-fg text-ink-950 hover:bg-white shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_8px_30px_-8px_rgb(0_212_255/0.55)]",
  secondary: "bg-ink-800 text-fg ring-1 ring-line-strong hover:bg-ink-700 hover:ring-fg-subtle/60",
  ghost: "text-fg-muted hover:text-fg hover:bg-white/5",
  danger: "bg-signal/10 text-signal ring-1 ring-signal/30 hover:bg-signal/20"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl"
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, ...props },
  ref
) {
  return (
    <button ref={ref} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-5 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl bg-ink-900 px-4 text-sm text-fg ring-1 ring-line-strong placeholder:text-fg-subtle",
        "transition focus:outline-none focus:ring-2 focus:ring-cyan/60",
        className
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-signal">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-fg-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

export function Badge({
  tone = "neutral",
  className,
  children
}: {
  tone?: "neutral" | "cyan" | "violet" | "signal" | "mint" | "amber";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-white/5 text-fg-muted ring-line",
    cyan: "bg-cyan/10 text-cyan ring-cyan/25",
    violet: "bg-violet/10 text-violet ring-violet/25",
    signal: "bg-signal/10 text-signal ring-signal/25",
    mint: "bg-mint/10 text-mint ring-mint/25",
    amber: "bg-amber/10 text-amber ring-amber/25"
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-xl bg-ink-900 p-1 ring-1 ring-line", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              active ? "bg-ink-700 text-fg shadow-sm ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl bg-ink-850/80 ring-1 ring-line backdrop-blur-sm", className)}>{children}</div>
  );
}

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00d4ff" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="#0b1220" stroke="url(#logo-g)" strokeWidth="1.5" />
        <circle cx="10" cy="20" r="3" fill="#00d4ff" />
        <circle cx="22" cy="11" r="3" fill="#8b5cf6" />
        <circle cx="22" cy="22" r="2.4" fill="#ff6b35" />
        <path d="M12.5 18.5 L19.5 12.5 M12.8 20.4 L19.6 21.6" stroke="#93a3bd" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {withWordmark ? (
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          Tech<span className="text-fg-muted">Tutor</span>
        </span>
      ) : null}
    </span>
  );
}

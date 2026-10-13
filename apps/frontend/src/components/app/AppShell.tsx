"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { BarChart3, LayoutGrid, LogOut, Settings } from "lucide-react";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Logo, Spinner } from "@/components/ui/primitives";

const NAV = [
  { href: "/dashboard/", label: "Dashboard", icon: LayoutGrid },
  { href: "/progress/", label: "Progress", icon: BarChart3 },
  { href: "/settings/", label: "Settings", icon: Settings }
];

/** Chrome for signed-in pages. Redirects to /login when there is no session. */
export function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const user = useRequireAuth();
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center text-fg-muted">
        <Spinner className="size-6" />
      </div>
    );
  }

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ink-950/80 backdrop-blur-xl">
        <div className={cn("mx-auto flex h-14 items-center gap-6 px-5", wide ? "max-w-[1480px]" : "max-w-6xl")}>
          <Link href="/dashboard/" aria-label="Dashboard">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname?.startsWith(item.href.replace(/\/$/, ""));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition",
                    active ? "text-fg" : "text-fg-muted hover:text-fg"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-white/[0.06] ring-1 ring-line"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  ) : null}
                  <Icon className="relative size-4" />
                  <span className="relative hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-fg-muted md:inline">{user.name}</span>
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan/30 to-violet/30 text-xs font-semibold text-fg ring-1 ring-line-strong">
              {initials}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/");
              }}
              className="grid size-8 place-items-center rounded-lg text-fg-muted transition hover:bg-white/5 hover:text-fg"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-5 py-8", wide ? "max-w-[1480px]" : "max-w-6xl")}>{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

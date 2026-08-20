"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/auth/SessionProvider";

const items: { href: string; key: TranslationKey; enabled: boolean }[] = [
  { href: "/dashboard", key: "nav.dashboard", enabled: true },
  { href: "/atletas", key: "nav.atletas", enabled: true },
  { href: "/prancheta", key: "nav.prancheta", enabled: true },
  { href: "/agente", key: "nav.agentPanel", enabled: true },
  { href: "/clube", key: "nav.clubPanel", enabled: true },
  { href: "/clubes", key: "nav.clubes", enabled: true },
  { href: "/admin", key: "nav.admin", enabled: true },
  { href: "/torneios", key: "nav.torneios", enabled: true },
];

export function AppNav() {
  const { t } = useT();
  const { role } = useSession();
  const path = usePathname();

  return (
    <nav className="border-b border-border bg-surface shadow-sm">
      <div className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((it) => {
          if (it.href === "/agente" && role === "club") return null;
          if (it.href === "/clube" && role === "agent") return null;
          if (it.href === "/admin" && role !== "admin") return null;
          if (!it.enabled) {
            return (
              <span
                key={it.href}
                className="cursor-not-allowed whitespace-nowrap px-3 py-3 text-sm font-medium text-muted/40"
                title="Em breve"
              >
                {t(it.key)}
              </span>
            );
          }
          const active = path === it.href || path.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              // Full prefetch (not just the static shell) — every tab is
              // visible in the nav bar at once, so this warms the Router
              // Cache for all of them right away (paired with
              // `experimental.staleTimes` in next.config.ts): a click on an
              // already-prefetched tab is served straight from cache
              // instead of re-running the layout + page server-side.
              prefetch={true}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-3 text-xs font-extrabold uppercase tracking-wider transition-colors",
                active
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {t(it.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

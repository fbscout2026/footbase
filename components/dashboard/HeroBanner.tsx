"use client";

import Link from "next/link";
import { Star, Users, Bell, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { DashboardHeroStats, NotificationsSummary } from "@/lib/services/dashboard";

// Session 55: "Súmulas processadas" removed from view per user request (an
// internal ingestion-throughput number, not something an agent/club cares
// about) — `loadHeroStats` still returns `sumulasCount`, just unused here.
export function HeroBanner({ stats, notifications }: { stats: DashboardHeroStats; notifications: NotificationsSummary }) {
  const { t } = useT();

  const notificationsHint = notifications.count > 0
    ? [
        notifications.contractsExpiring > 0 ? `${notifications.contractsExpiring} ${t("dashboard.hero.notif.contracts")}` : null,
        notifications.inactive > 0 ? `${notifications.inactive} ${t("dashboard.hero.notif.inactive")}` : null,
        notifications.newGems > 0 ? `${notifications.newGems} ${t("dashboard.hero.notif.gems")}` : null,
      ].filter(Boolean).join(" · ")
    : t("dashboard.hero.notif.none");

  const cards: { icon: LucideIcon; label: string; value: string; hint?: string; href?: string }[] = [
    {
      icon: Star,
      label: t("dashboard.hero.highlight"),
      value: stats.topScorer?.name ?? "—",
      hint: stats.topScorer ? `${stats.topScorer.goals} ${t("hero.goals")} · ${t("dashboard.hero.last5")}` : undefined,
      href: stats.topScorer ? `/atletas/${stats.topScorer.fbId}` : undefined,
    },
    {
      icon: Users,
      label: t("dashboard.hero.athletes"),
      value: String(stats.athletesCount),
    },
    {
      icon: Bell,
      label: t("dashboard.hero.notifications"),
      value: String(notifications.count),
      hint: notificationsHint,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => {
        const inner = (
          <>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-brand/30 bg-brand/15 text-brand">
              <c.icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">{c.label}</p>
              <p className="metric-value truncate text-lg font-extrabold">{c.value}</p>
              {c.hint && <p className="truncate text-xs text-brand">{c.hint}</p>}
            </div>
          </>
        );
        const className =
          "matchday-surface flex items-center gap-4 bg-[linear-gradient(135deg,rgb(var(--brand)/0.09),transparent_60%)] p-5" +
          (c.href ? " transition-colors hover:border-brand/50" : "");
        return c.href ? (
          <Link key={c.label} href={c.href} className={className}>
            {inner}
          </Link>
        ) : (
          <div key={c.label} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

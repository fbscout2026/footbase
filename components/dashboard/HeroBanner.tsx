"use client";

import { FileText, Star, Users, Bell, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { mockAtletas } from "@/lib/mock-data";

export function HeroBanner() {
  const { t } = useT();

  const highlight = [...mockAtletas].sort(
    (a, b) => b.stats.totalGoals - a.stats.totalGoals
  )[0];

  const cards: { icon: LucideIcon; label: string; value: string; hint?: string }[] = [
    { icon: FileText, label: t("dashboard.hero.sumulas"), value: "128" },
    {
      icon: Star,
      label: t("dashboard.hero.highlight"),
      value: highlight?.name ?? "—",
      hint: highlight ? `${highlight.stats.totalGoals} ${t("hero.goals")}` : undefined,
    },
    {
      icon: Users,
      label: t("dashboard.hero.athletes"),
      value: String(mockAtletas.length),
    },
    {
      icon: Bell,
      label: t("dashboard.hero.notifications"),
      value: t("dashboard.hero.notificationsValue"),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="matchday-surface flex items-center gap-4 bg-[linear-gradient(135deg,rgb(var(--brand)/0.09),transparent_60%)] p-5"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-brand/30 bg-brand/15 text-brand">
            <c.icon size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="metric-value truncate text-lg font-extrabold">{c.value}</p>
            {c.hint && <p className="text-xs text-brand">{c.hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Goal } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { mockAtletas, getClubeById } from "@/lib/mock-data";

export function Artilheiros() {
  const { t } = useT();

  const scorers = [...mockAtletas]
    .filter((a) => a.stats.totalGoals > 0)
    .sort((a, b) => b.stats.totalGoals - a.stats.totalGoals)
    .slice(0, 6);

  return (
    <WidgetCard
      title={t("dashboard.scorers.title")}
      subtitle={t("dashboard.scorers.subtitle")}
      icon={Goal}
    >
      {scorers.length === 0 ? (
        <p className="text-sm text-muted">{t("dashboard.scorers.empty")}</p>
      ) : (
        <ol className="divide-y divide-border">
          {scorers.map((a, i) => (
            <li key={a.bid}>
              <Link
                href={`/atletas/${a.bid}`}
                className="flex items-center gap-3 py-2.5 transition-colors hover:text-brand"
              >
                <span className="w-5 shrink-0 text-center text-sm font-bold text-brand">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {getClubeById(a.currentClubId)?.name} · {a.currentCategory}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold">
                  {a.stats.totalGoals}
                  <span className="ml-1 text-xs font-normal text-muted">
                    {t("hero.goals")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  );
}

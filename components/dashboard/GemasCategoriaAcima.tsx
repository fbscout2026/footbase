"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { Badge } from "@/components/ui/Badge";
import { playedAboveCategoryAtletas, getClubeById } from "@/lib/mock-data";

export function GemasCategoriaAcima() {
  const { t } = useT();

  const gems = [...playedAboveCategoryAtletas].sort(
    (a, b) => b.stats.timesPlayedAboveCategory - a.stats.timesPlayedAboveCategory
  );

  return (
    <WidgetCard
      title={t("dashboard.gems.title")}
      subtitle={t("dashboard.gems.subtitle")}
      icon={TrendingUp}
    >
      {gems.length === 0 ? (
        <p className="text-sm text-muted">{t("dashboard.gems.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {gems.map((a) => (
            <li key={a.bid}>
              <Link
                href={`/atletas/${a.bid}`}
                className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {getClubeById(a.currentClubId)?.name} · {a.currentCategory}
                  </span>
                </span>
                <Badge tone="brand">
                  {a.stats.timesPlayedAboveCategory} {t("dashboard.gems.gamesAbove")}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

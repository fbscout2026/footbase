"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { Badge } from "@/components/ui/Badge";
import type { GemRow } from "@/lib/services/dashboard";

export function GemasCategoriaAcima({ athletes: gems }: { athletes: GemRow[] }) {
  const { t } = useT();

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
                    {a.currentClubName ?? "—"} · {a.currentCategory ?? "—"}
                  </span>
                </span>
                <Badge tone="brand">
                  {a.gamesAboveCategory} {t("dashboard.gems.gamesAbove")}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

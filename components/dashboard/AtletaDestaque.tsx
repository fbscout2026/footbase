"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import type { ScorerRow } from "@/lib/services/dashboard";

export function AtletaDestaque({ athletes }: { athletes: ScorerRow[] }) {
  const { t } = useT();

  return (
    <WidgetCard
      title={t("dashboard.destaque.title")}
      subtitle={t("dashboard.destaque.subtitle")}
      icon={Star}
      scrollable
    >
      {athletes.length === 0 ? (
        <p className="text-sm text-muted">{t("dashboard.destaque.empty")}</p>
      ) : (
        <ol className="divide-y divide-border">
          {athletes.map((a, i) => (
            <li key={a.fbId}>
              <Link
                href={`/atletas/${a.fbId}`}
                className="flex items-center gap-3 py-2.5 transition-colors hover:text-brand"
              >
                <span className="w-5 shrink-0 text-center text-sm font-bold text-brand">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.currentClubName ?? "—"} · {a.currentCategory ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold">
                  {a.goals}
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

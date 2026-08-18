"use client";

import Link from "next/link";
import { BellRing } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { Badge } from "@/components/ui/Badge";
import { inactiveAtletas, getClubeById } from "@/lib/mock-data";
import { formatDate } from "@/lib/format";

export function AlertaInatividade() {
  const { t } = useT();

  return (
    <WidgetCard
      title={t("dashboard.inactivity.title")}
      subtitle={t("dashboard.inactivity.subtitle")}
      icon={BellRing}
    >
      {inactiveAtletas.length === 0 ? (
        <p className="text-sm text-muted">{t("dashboard.inactivity.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {inactiveAtletas.map((a) => (
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
                <Badge tone="danger">
                  {t("dashboard.inactivity.lastMatch")}:{" "}
                  {a.stats.lastMatchDate
                    ? formatDate(a.stats.lastMatchDate)
                    : t("dashboard.inactivity.never")}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

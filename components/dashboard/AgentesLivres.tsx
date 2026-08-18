"use client";

import Link from "next/link";
import { UserMinus } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { Badge } from "@/components/ui/Badge";
import { freeAgentAtletas, getClubeById } from "@/lib/mock-data";

export function AgentesLivres() {
  const { t } = useT();

  return (
    <WidgetCard
      title={t("dashboard.freeAgents.title")}
      subtitle={t("dashboard.freeAgents.subtitle")}
      icon={UserMinus}
    >
      {freeAgentAtletas.length === 0 ? (
        <p className="text-sm text-muted">{t("dashboard.freeAgents.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {freeAgentAtletas.map((a) => (
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
                <Badge tone="brand">{t("dashboard.freeAgents.badge")}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

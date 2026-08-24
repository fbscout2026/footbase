"use client";

import Link from "next/link";
import { FileClock } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { Badge } from "@/components/ui/Badge";
import type { ContractRow } from "@/lib/services/dashboard";
import { formatMonthYear } from "@/lib/format";

export function RadarContratos({ athletes: expiringContractAtletas }: { athletes: ContractRow[] }) {
  const { t } = useT();

  return (
    <WidgetCard
      title={t("dashboard.contracts.title")}
      subtitle={t("dashboard.contracts.subtitle")}
      icon={FileClock}
      scrollable
    >
      {expiringContractAtletas.length === 0 ? (
        <p className="text-sm text-muted">{t("dashboard.contracts.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {expiringContractAtletas.map((a) => (
            <li key={a.fbId}>
              <Link
                href={`/atletas/${a.fbId}`}
                className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.currentClubName ?? "—"} · {a.currentCategory ?? "—"}
                  </span>
                </span>
                <Badge tone="warning">
                  {a.contractEndDate ? formatMonthYear(a.contractEndDate) : "—"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

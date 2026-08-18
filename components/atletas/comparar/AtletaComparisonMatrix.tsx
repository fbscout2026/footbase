"use client";

import Link from "next/link";
import { Award } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { getClubeById, type MockAtleta } from "@/lib/mock-data";
import {
  comparisonMetrics,
  getWinningBids,
  type ComparisonFormat,
  type ComparisonGroup,
} from "@/lib/atleta-comparison";

const groups: ComparisonGroup[] = ["profile", "performance", "special"];

export function AtletaComparisonMatrix({ atletas }: { atletas: MockAtleta[] }) {
  const { t, locale } = useT();

  if (atletas.length < 2) {
    return (
      <div className="matchday-surface border-dashed p-10 text-center">
        <p className="font-semibold">{t("compare.empty.title")}</p>
        <p className="mt-1 text-sm text-muted">{t("compare.empty.description")}</p>
      </div>
    );
  }

  function formatValue(value: string | number | null, format: ComparisonFormat): string {
    if (value === null) return "—";
    if (format === "foot") return t(`foot.${value}` as TranslationKey);
    if (typeof value === "number") {
      const rendered = new Intl.NumberFormat(locale, {
        maximumFractionDigits: format === "decimal" ? 1 : 0,
      }).format(value);
      if (format === "cm") return `${rendered} cm`;
      if (format === "kg") return `${rendered} kg`;
      return rendered;
    }
    return value;
  }

  return (
    <section className="matchday-surface overflow-hidden">
      <div className="scroll-brand overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 w-52 min-w-52 bg-surface px-4 py-4 text-left text-xs font-semibold uppercase text-muted">
                {t("compare.metric")}
              </th>
              {atletas.map((atleta) => {
                const club = getClubeById(atleta.currentClubId);
                return (
                  <th key={atleta.bid} className="min-w-60 border-l border-border px-4 py-4 text-left align-top">
                    <Link href={`/atletas/${atleta.bid}`} className="group flex items-center gap-3">
                      <ClubeCrest src={club?.webpCrestUrl ?? null} name={club?.name ?? "?"} size={38} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold group-hover:text-brand">{atleta.name}</span>
                        <span className="block text-xs font-normal text-muted">
                          BID {atleta.bid} · {atleta.mainPosition} · {atleta.currentCategory}
                        </span>
                      </span>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <ComparisonGroupRows key={group} group={group} atletas={atletas} formatValue={formatValue} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted">{t("compare.disclaimer")}</p>
    </section>
  );
}

function ComparisonGroupRows({
  group,
  atletas,
  formatValue,
}: {
  group: ComparisonGroup;
  atletas: MockAtleta[];
  formatValue: (value: string | number | null, format: ComparisonFormat) => string;
}) {
  const { t } = useT();
  const metrics = comparisonMetrics.filter((metric) => metric.group === group);

  return (
    <>
      <tr>
        <th
          colSpan={atletas.length + 1}
          className="border-y border-border bg-background px-4 py-2 text-left text-xs font-extrabold uppercase italic tracking-wide text-brand"
        >
          {t(`compare.group.${group}` as TranslationKey)}
        </th>
      </tr>
      {metrics.map((metric) => {
        const winners = getWinningBids(metric, atletas);
        return (
          <tr key={metric.id} className="border-b border-border/60 last:border-0">
            <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-xs font-medium text-muted">
              {t(`compare.metric.${metric.id}` as TranslationKey)}
            </th>
            {atletas.map((atleta) => {
              const value = metric.value(atleta);
              const isWinner = winners.has(atleta.bid);
              return (
                <td
                  key={atleta.bid}
                  className={cn(
                    "border-l border-border px-4 py-3 font-semibold",
                    isWinner && "bg-brand/10 text-brand"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{formatValue(value, metric.format)}</span>
                    {isWinner && (
                      <Badge tone="brand" className="px-1.5 py-0 text-[10px]">
                        <Award size={10} /> {t("compare.best")}
                      </Badge>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

"use client";

import Link from "next/link";
import { ArrowLeft, Trophy, ShieldQuestion, Goal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TorneioDetail as TorneioDetailData } from "@/lib/services/torneios";

export function TorneioDetail({ data }: { data: TorneioDetailData }) {
  const { t } = useT();
  const breadcrumb = [data.continente, data.paisNome, data.federacaoSigla].filter(Boolean).join(" · ");
  const hasMatches = data.matchCount > 0;

  return (
    <div className="space-y-5">
      <Link href="/torneios" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted hover:text-brand">
        <ArrowLeft size={15} />{t("torneios.detail.back")}
      </Link>

      <section className="matchday-surface p-5 sm:p-7">
        <div className="mb-2 flex items-center gap-2 text-brand"><Trophy size={18} /><span className="text-xs font-extrabold uppercase tracking-widest">{breadcrumb || t("torneios.badge")}</span></div>
        <h1 className="matchday-heading text-3xl">{data.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="brand">{data.federacaoNome ?? data.federationText}</Badge>
          {data.category && <Badge tone="neutral">{data.category}</Badge>}
          <Badge tone="neutral">{data.year}</Badge>
        </div>
      </section>

      {!hasMatches ? (
        <section className="matchday-surface p-10 text-center">
          <ShieldQuestion size={28} className="mx-auto text-muted" />
          <p className="mt-3 text-sm text-muted">{t("torneios.detail.noMatches")}</p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="matchday-surface overflow-x-auto lg:col-span-2">
            <h2 className="matchday-heading px-5 pt-5 text-lg">{t("torneios.detail.standings")}</h2>
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-brand/50 bg-background text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5 text-left font-semibold">#</th>
                  <th className="px-2 py-2.5 text-left font-semibold">{t("torneios.detail.col.club")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.played")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.wins")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.draws")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.losses")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.goalsFor")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.goalsAgainst")}</th>
                  <th className="px-2 py-2.5 text-center font-semibold">{t("torneios.detail.col.goalDiff")}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{t("torneios.detail.col.points")}</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((row, i) => (
                  <tr key={row.club.id} className="border-b border-border/60">
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    <td className="px-2 py-2">
                      <Link href={`/clubes/${row.club.id}`} className="flex items-center gap-2 hover:text-brand">
                        <ClubeCrest src={row.club.crestUrl} name={row.club.name} size={20} />
                        <span className="truncate font-medium uppercase">{row.club.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-center">{row.played}</td>
                    <td className="px-2 py-2 text-center">{row.wins}</td>
                    <td className="px-2 py-2 text-center">{row.draws}</td>
                    <td className="px-2 py-2 text-center">{row.losses}</td>
                    <td className="px-2 py-2 text-center">{row.goalsFor}</td>
                    <td className="px-2 py-2 text-center">{row.goalsAgainst}</td>
                    <td className="px-2 py-2 text-center">{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                    <td className="px-3 py-2 text-center font-bold text-brand">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="matchday-surface p-5">
            <div className="mb-1 flex items-center gap-2 text-brand"><Goal size={16} /><h2 className="matchday-heading text-lg">{t("torneios.detail.scorers")}</h2></div>
            {data.topScorers.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("torneios.detail.scorersEmpty")}</p>
            ) : (
              <ol className="mt-2 divide-y divide-border">
                {data.topScorers.map((s, i) => (
                  <li key={s.fbId} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-brand">{i + 1}</span>
                    <Link href={`/atletas/${s.fbId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
                      {s.name}
                    </Link>
                    <span className="shrink-0 text-sm font-bold">{s.goals}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

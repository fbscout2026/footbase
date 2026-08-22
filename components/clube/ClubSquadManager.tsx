"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import type { ClubPanelData } from "@/lib/services/club-panel";
import { formatAthleteCode } from "@/lib/format";
import { Users } from "lucide-react";

// Read-only official squad. Athlete entries/exits come from súmula ingestion and
// the athlete-claim flow — the club does not declare roster changes here.
export function ClubSquadManager({ data }: { data: ClubPanelData }) {
  const { t } = useT();
  return <section className="matchday-surface overflow-hidden">
    <div className="border-b border-border p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><Users size={19} className="text-brand" />{t("clubPanel.squad.official")}</h2>
      <p className="mt-1 text-sm text-muted">{t("clubPanel.squad.officialHelp")}</p>
    </div>
    {data.squad.length === 0
      ? <p className="p-8 text-center text-sm text-muted">{t("clubs.squadEmpty")}</p>
      : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
          <thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3">{t("clubs.athlete")}</th>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">{t("clubs.position")}</th>
            <th className="px-4 py-3">{t("clubs.category")}</th>
            <th className="px-4 py-3">{t("clubPanel.squad.contract")}</th>
          </tr></thead>
          <tbody>{data.squad.map((athlete) => <tr key={athlete.fbId} className="border-b border-border/60">
            <td className="px-4 py-3"><Link href={`/atletas/${athlete.fbId}`} className="font-semibold hover:text-brand">{athlete.name}</Link>{athlete.nickname && <p className="text-xs text-muted">{athlete.nickname}</p>}</td>
            <td className="metric-value px-4 py-3">{formatAthleteCode(athlete.fbId)}</td>
            <td className="px-4 py-3">{athlete.position ?? "—"}</td>
            <td className="px-4 py-3">{athlete.category ?? "—"}</td>
            <td className="px-4 py-3">{athlete.contractEndDate ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>}
  </section>;
}

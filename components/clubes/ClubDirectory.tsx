"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/I18nProvider";
import { filterClubs, type ClubDirectoryFilterState } from "@/lib/club-claim-rules";
import type { ClubSummaryRecord } from "@/lib/services/clubs";

const initialFilters: ClubDirectoryFilterState = { query: "", state: "", federation: "", claimStatus: "" };

export function ClubDirectory({ clubs }: { clubs: ClubSummaryRecord[] }) {
  const { t } = useT();
  const [filters, setFilters] = useState(initialFilters);
  const states = useMemo(() => [...new Set(clubs.map((club) => club.state).filter(Boolean) as string[])].sort(), [clubs]);
  const federations = useMemo(() => [...new Set(clubs.map((club) => club.federation).filter(Boolean) as string[])].sort(), [clubs]);
  const results = useMemo(() => filterClubs(clubs, filters), [clubs, filters]);

  return (
    <div className="space-y-5">
      <section className="matchday-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-brand"><Building2 size={18} /><span className="text-xs font-extrabold uppercase tracking-widest">UC08</span></div>
            <h1 className="matchday-heading text-3xl">{t("clubs.title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("clubs.subtitle")}</p>
          </div>
          <span className="metric-value text-sm text-muted">{results.length} {t("clubs.count")}</span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1.5"><span className="text-xs font-bold uppercase tracking-wide text-muted">{t("common.search")}</span><span className="flex min-h-11 items-center border border-border bg-background px-3 focus-within:border-brand"><Search size={16} className="mr-2 text-muted" /><input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder={t("clubs.searchPlaceholder")} className="w-full bg-transparent text-sm outline-none" /></span></label>
          <Filter label={t("clubs.state")} value={filters.state} onChange={(state) => setFilters({ ...filters, state })} values={states} allLabel={t("clubs.allStates")} />
          <Filter label={t("clubs.federation")} value={filters.federation} onChange={(federation) => setFilters({ ...filters, federation })} values={federations} allLabel={t("clubs.allFederations")} />
          <div className="flex flex-col gap-1.5"><span className="text-xs font-bold uppercase tracking-wide text-muted">{t("clubs.ownership")}</span><Select ariaLabel={t("clubs.ownership")} value={filters.claimStatus} onChange={(claimStatus) => setFilters({ ...filters, claimStatus: claimStatus as ClubDirectoryFilterState["claimStatus"] })} options={[{ value: "", label: t("clubs.allOwnership") }, { value: "unclaimed", label: t("clubs.status.unclaimed") }, { value: "pending", label: t("clubs.status.pending") }, { value: "claimed", label: t("clubs.status.claimed") }]} /></div>
        </div>
      </section>

      <section className="matchday-surface overflow-hidden">
        {results.length === 0 ? <p className="p-10 text-center text-sm text-muted">{t("clubs.empty")}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted"><th className="px-5 py-3">{t("clubs.club")}</th><th className="px-4 py-3">{t("clubs.location")}</th><th className="px-4 py-3">{t("clubs.athletes")}</th><th className="px-4 py-3">{t("clubs.categories")}</th><th className="px-4 py-3">{t("clubs.ownership")}</th></tr></thead><tbody>{results.map((club) => <tr key={club.id} className="border-b border-border/60 transition-colors hover:bg-surface-hover"><td className="px-5 py-4"><Link href={`/clubes/${club.id}`} className="flex min-h-11 items-center gap-3 font-bold uppercase hover:text-brand"><ClubeCrest src={club.crestUrl} name={club.name} size={38} />{club.name}</Link></td><td className="px-4 py-4">{[club.state, club.federation].filter(Boolean).join(" · ") || "—"}</td><td className="metric-value px-4 py-4">{club.athleteCount}</td><td className="px-4 py-4 text-muted">{club.activeCategories.join(", ") || "—"}</td><td className="px-4 py-4"><ClaimBadge status={club.claimStatus} /></td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

export function ClubLoadError({ profile = false }: { profile?: boolean }) {
  const { t } = useT();
  return <div className="matchday-surface p-10 text-center"><h1 className="matchday-heading text-2xl">{t(profile ? "clubs.loadError.profile" : "clubs.loadError.directory")}</h1><p className="mt-2 text-sm text-muted">{t("clubs.loadError.help")}</p></div>;
}

function Filter({ label, value, onChange, values, allLabel }: { label: string; value: string; onChange: (value: string) => void; values: string[]; allLabel: string }) {
  return <div className="flex flex-col gap-1.5"><span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span><Select ariaLabel={label} value={value} onChange={onChange} options={[{ value: "", label: allLabel }, ...values.map((item) => ({ value: item, label: item }))]} /></div>;
}

function ClaimBadge({ status }: { status: ClubSummaryRecord["claimStatus"] }) {
  const { t } = useT();
  return <Badge tone={status === "claimed" ? "brand" : status === "pending" ? "warning" : "neutral"}>{t(`clubs.status.${status}`)}</Badge>;
}

"use client";

import { Badge } from "@/components/ui/Badge";
import { useT } from "@/lib/i18n/I18nProvider";
import type { ClubCategoryRecord, ClubPanelData } from "@/lib/services/club-panel";
import { Trophy } from "lucide-react";

// Read-only categories and tournaments. This data is captured from official
// súmulas (CBF / state federations) by the ingestion service — the club does not
// declare it here.
export function ClubCategoriesManager({ data }: { data: ClubPanelData }) {
  const { t } = useT();
  return <div className="space-y-5">
    {data.categories.length === 0
      ? <section className="matchday-surface p-8 text-center text-sm text-muted">{t("clubPanel.categories.empty")}</section>
      : data.categories.map((category) => <CategorySection key={category.id} category={category} />)}
  </div>;
}

function CategorySection({ category }: { category: ClubCategoryRecord }) {
  const { t } = useT();
  return <section className="matchday-surface overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
      <div>
        <h2 className="matchday-heading flex items-center gap-2 text-xl"><Trophy size={19} className="text-brand" />{category.category}</h2>
        <div className="mt-2 flex gap-2"><SourceBadge source={category.sourceStatus} /><Badge tone={category.status === "active" ? "brand" : undefined}>{t(`clubPanel.categoryStatus.${category.status}`)}</Badge></div>
      </div>
    </div>
    <div className="p-5">{category.tournaments.length === 0
      ? <p className="text-sm text-muted">{t("clubPanel.tournaments.empty")}</p>
      : <div className="space-y-3">{category.tournaments.map((tournament) => <article key={tournament.id} className="border border-border bg-background p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="font-bold">{tournament.name}</h3><p className="text-sm text-muted">{tournament.season}{tournament.startDate ? ` · ${tournament.startDate}` : ""}{tournament.endDate ? ` — ${tournament.endDate}` : ""}</p></div>
            <div className="flex gap-2"><SourceBadge source={tournament.sourceStatus} /><Badge>{t(`clubPanel.tournamentStatus.${tournament.status}`)}</Badge></div>
          </div>
        </article>)}</div>}
    </div>
  </section>;
}

function SourceBadge({ source }: { source: string }) { const { t } = useT(); return <Badge tone={source === "club_declared" ? "warning" : "brand"}>{t(source === "club_declared" ? "clubPanel.source.club" : "clubPanel.source.confirmed")}</Badge>; }

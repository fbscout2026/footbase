"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import type { ClubPanelAccess } from "@/lib/club-panel-rules";
import type { ClubPanelData } from "@/lib/services/club-panel";
import { ClubOverview } from "@/components/clube/ClubOverview";
import { ClubProfileForm } from "@/components/clube/ClubProfileForm";
import { ClubSquadManager } from "@/components/clube/ClubSquadManager";
import { ClubCategoriesManager } from "@/components/clube/ClubCategoriesManager";
import { ClubFavorites } from "@/components/clube/ClubFavorites";
import { Badge } from "@/components/ui/Badge";
import { Building2, Heart, LayoutDashboard, ShieldCheck, Trophy, Users } from "lucide-react";

type Tab = "overview" | "profile" | "squad" | "categories" | "favorites";

export function ClubManagementPanel({ initialData, managedClubs, readOnly }: { initialData: ClubPanelData; managedClubs: Array<{ id: string; name: string }>; readOnly: boolean }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
    { id: "overview", label: t("clubPanel.tabs.overview"), icon: LayoutDashboard },
    { id: "profile", label: t("clubPanel.tabs.profile"), icon: Building2 },
    { id: "squad", label: t("clubPanel.tabs.squad"), icon: Users },
    { id: "categories", label: t("clubPanel.tabs.categories"), icon: Trophy },
    { id: "favorites", label: t("clubPanel.tabs.favorites"), icon: Heart },
  ];

  return <div className="space-y-5">
    {readOnly && <AdminClubSelector clubs={managedClubs} currentClubId={initialData.club.id} />}
    <section className="matchday-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-border bg-background">
            {initialData.club.crestUrl ? <img src={initialData.club.crestUrl} alt="" className="max-h-[68px] max-w-[68px] object-contain" /> : <Building2 className="text-brand" size={34} />}
          </div>
          <div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand"><ShieldCheck size={16} />UC08</p><h1 className="matchday-heading truncate text-3xl">{initialData.club.displayName || initialData.club.name}</h1><p className="mt-1 text-sm text-muted">{t("clubPanel.subtitle")}</p></div>
        </div>
        <Badge tone="brand">{readOnly ? t("clubPanel.readOnly") : t("clubPanel.claimed")}</Badge>
      </div>
    </section>

    <div className="matchday-surface overflow-x-auto" role="tablist" aria-label={t("clubPanel.tabs.label")}>
      <div className="flex min-w-max border-b border-border px-2">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`club-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`club-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} className={`flex min-h-12 items-center gap-2 border-b-2 px-4 text-xs font-extrabold uppercase tracking-wide ${tab === id ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"}`}><Icon size={16} />{label}</button>)}
      </div>
    </div>

    <div id={`club-panel-${tab}`} role="tabpanel" aria-labelledby={`club-tab-${tab}`}>
      {tab === "overview" && <ClubOverview data={initialData} onNavigate={setTab} />}
      {tab === "profile" && <ClubProfileForm data={initialData} readOnly={readOnly} />}
      {tab === "squad" && <ClubSquadManager data={initialData} />}
      {tab === "categories" && <ClubCategoriesManager data={initialData} />}
      {tab === "favorites" && <ClubFavorites favorites={initialData.favorites} favoriteClubs={initialData.favoriteClubs} favoriteTournaments={initialData.favoriteTournaments} ownerId={initialData.club.claimedBy} readOnly={readOnly} />}
    </div>
  </div>;
}

function AdminClubSelector({ clubs, currentClubId }: { clubs: Array<{ id: string; name: string }>; currentClubId: string }) {
  const { t } = useT();
  return <section className="matchday-surface p-4"><div className="flex flex-wrap items-center gap-3"><ShieldCheck size={18} className="text-brand" /><span className="text-sm font-bold uppercase">{t("clubPanel.supervision")}</span>{clubs.map((club) => <Link key={club.id} href={`/clube?club=${club.id}`} className={`min-h-11 border px-3 py-2 text-sm ${club.id === currentClubId ? "border-brand bg-brand/15" : "border-border hover:border-brand"}`}>{club.name}</Link>)}</div></section>;
}

export function ClubPanelUnavailable({ access, clubs, loadFailed = false }: { access: ClubPanelAccess; clubs: Array<{ id: string; name: string }>; loadFailed?: boolean }) {
  const { t } = useT();
  return <section className="matchday-surface p-10 text-center"><Building2 size={38} className="mx-auto text-brand" /><h1 className="matchday-heading mt-4 text-2xl">{t("clubPanel.title")}</h1><p className="mx-auto mt-3 max-w-xl text-sm text-muted">{loadFailed ? t("clubPanel.loadError") : access === "unclaimed" ? t("clubPanel.unclaimed") : t("clubPanel.unavailable")}</p>{access === "unclaimed" && <Link href="/clubes" className="mt-6 inline-flex min-h-11 items-center border border-brand bg-brand px-5 font-extrabold uppercase text-black">{t("clubPanel.findClub")}</Link>}{clubs.length > 0 && <div className="mt-6 flex flex-wrap justify-center gap-2">{clubs.map((club) => <Link key={club.id} href={`/clube?club=${club.id}`} className="border border-border px-3 py-2 hover:border-brand">{club.name}</Link>)}</div>}</section>;
}

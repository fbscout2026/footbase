"use client";

import type { ClubPanelData } from "@/lib/services/club-panel";
import { useT } from "@/lib/i18n/I18nProvider";
import { AlertTriangle, Building2, FileClock, Heart, Trophy, Users } from "lucide-react";

export function ClubOverview({ data, onNavigate }: { data: ClubPanelData; onNavigate: (tab: "profile" | "squad" | "categories" | "favorites") => void }) {
  const { t } = useT();
  const pending = data.rosterRequests.filter((item) => item.status === "pending").length + data.corrections.filter((item) => item.status === "pending").length;
  const activeCategories = data.categories.filter((item) => item.status === "active").length;
  const activeTournaments = data.categories.flatMap((item) => item.tournaments).filter((item) => item.status === "registered" || item.status === "in_progress").length;
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={Users} value={data.squad.length} label={t("clubPanel.metric.athletes")} />
      <Metric icon={Trophy} value={activeCategories} label={t("clubPanel.metric.categories")} />
      <Metric icon={Building2} value={activeTournaments} label={t("clubPanel.metric.tournaments")} />
      <Metric icon={Heart} value={data.favorites.length} label={t("clubPanel.metric.favorites")} />
      <Metric icon={FileClock} value={pending} label={t("clubPanel.metric.pending")} />
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.55fr)]">
      <section className="matchday-surface p-5"><h2 className="matchday-heading text-xl">{t("clubPanel.quickActions")}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><QuickAction onClick={() => onNavigate("profile")} label={t("clubPanel.action.profile")} /><QuickAction onClick={() => onNavigate("squad")} label={t("clubPanel.action.roster")} /><QuickAction onClick={() => onNavigate("categories")} label={t("clubPanel.action.category")} /><QuickAction onClick={() => onNavigate("favorites")} label={t("clubPanel.action.favorites")} /></div></section>
      <section className="matchday-surface p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><AlertTriangle size={19} className="text-brand" />{t("clubPanel.alerts")}</h2>{data.divergences.length === 0 && pending === 0 ? <p className="mt-4 text-sm text-muted">{t("clubPanel.alertsEmpty")}</p> : <div className="mt-4 space-y-2"><p className="border-l-2 border-brand bg-background p-3 text-sm">{pending} {t("clubPanel.pendingReview")}</p>{data.divergences.filter((item) => item.status === "open").map((item) => <p key={item.id} className="border-l-2 border-amber-400 bg-background p-3 text-sm">{t(`clubPanel.domain.${item.domain}`)} · {item.officialSource}</p>)}</div>}</section>
    </div>
  </div>;
}

function Metric({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return <div className="matchday-surface p-4"><Icon size={18} className="text-brand" /><p className="metric-value mt-3 text-3xl font-black">{value}</p><p className="text-xs uppercase tracking-wide text-muted">{label}</p></div>;
}

function QuickAction({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className="min-h-12 border border-border bg-background px-4 text-left text-sm font-extrabold uppercase hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{label}</button>;
}

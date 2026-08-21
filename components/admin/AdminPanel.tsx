"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminClaims } from "@/components/admin/AdminClaims";
import { AdminCorrections } from "@/components/admin/AdminCorrections";
import { AdminIngestion } from "@/components/admin/AdminIngestion";
import { AdminRepresentation } from "@/components/admin/AdminRepresentation";
import { AdminFederations } from "@/components/admin/AdminFederations";
import { AdminDuplicates } from "@/components/admin/AdminDuplicates";
import type { AdminUser } from "@/lib/services/admin-users";
import type { AdminClaim } from "@/lib/services/admin-claims";
import type { AdminCorrection } from "@/lib/services/admin-corrections";
import type { ScrapingLog } from "@/lib/services/admin-ingestion";
import type { RepresentedAthlete, EligibleAgent, TransferRecord } from "@/lib/services/admin-representation";
import type { FederationHierarchy } from "@/lib/services/admin-federations";
import type { PromotionRecord } from "@/lib/services/admin-promotions";
import type { AdminDuplicateCandidate } from "@/lib/services/admin-athlete-duplicates";
import { Activity, ClipboardCheck, Globe2, LayoutDashboard, Repeat, ShieldCheck, Users, Users2 } from "lucide-react";

type Tab = "overview" | "users" | "claims" | "corrections" | "ingestion" | "representation" | "federations" | "duplicates";
type ModuleTab = Exclude<Tab, "overview">;

const MODULES: { id: ModuleTab; icon: typeof Users; titleKey: string; descKey: string }[] = [
  { id: "users", icon: Users, titleKey: "admin.users.title", descKey: "admin.users.desc" },
  { id: "claims", icon: ShieldCheck, titleKey: "admin.claims.title", descKey: "admin.claims.desc" },
  { id: "corrections", icon: ClipboardCheck, titleKey: "admin.corrections.title", descKey: "admin.corrections.desc" },
  { id: "duplicates", icon: Users2, titleKey: "admin.duplicates.title", descKey: "admin.duplicates.desc" },
  { id: "ingestion", icon: Activity, titleKey: "admin.ingestion.title", descKey: "admin.ingestion.desc" },
  { id: "representation", icon: Repeat, titleKey: "admin.representation.title", descKey: "admin.representation.desc" },
  { id: "federations", icon: Globe2, titleKey: "admin.federations.title", descKey: "admin.federations.desc" },
];

export function AdminPanel({ users, claims, corrections, logs, representedAthletes, eligibleAgents, transferHistory, federations, promotionHistory, duplicateCandidates }: { users: AdminUser[] | null; claims: AdminClaim[] | null; corrections: AdminCorrection[] | null; logs: ScrapingLog[] | null; representedAthletes: RepresentedAthlete[] | null; eligibleAgents: EligibleAgent[] | null; transferHistory: TransferRecord[] | null; federations: FederationHierarchy | null; promotionHistory: PromotionRecord[] | null; duplicateCandidates: AdminDuplicateCandidate[] | null }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "overview", label: t("admin.tabs.overview"), icon: LayoutDashboard },
    ...MODULES.map((m) => ({ id: m.id as Tab, label: t(`admin.tabs.${m.id}`), icon: m.icon })),
  ];

  return <div className="space-y-5">
    <section className="matchday-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand"><ShieldCheck size={16} />UC09</p>
          <h1 className="matchday-heading text-3xl">{t("admin.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("admin.subtitle")}</p>
        </div>
        <Badge tone="brand">{t("admin.badge")}</Badge>
      </div>
    </section>

    <div className="matchday-surface overflow-x-auto" role="tablist" aria-label={t("admin.tabs.label")}>
      <div className="flex min-w-max border-b border-border px-2">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`admin-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`admin-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} className={`flex min-h-12 items-center gap-2 border-b-2 px-4 text-xs font-extrabold uppercase tracking-wide ${tab === id ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"}`}><Icon size={16} />{label}</button>)}
      </div>
    </div>

    <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
      {tab === "overview" && <Overview onNavigate={setTab} />}
      {tab === "users" && <AdminUsers users={users} promotionHistory={promotionHistory} />}
      {tab === "claims" && <AdminClaims claims={claims} />}
      {tab === "corrections" && <AdminCorrections corrections={corrections} />}
      {tab === "duplicates" && <AdminDuplicates candidates={duplicateCandidates} />}
      {tab === "ingestion" && <AdminIngestion logs={logs} />}
      {tab === "representation" && <AdminRepresentation athletes={representedAthletes} agents={eligibleAgents} history={transferHistory} />}
      {tab === "federations" && <AdminFederations data={federations} />}
    </div>
  </div>;
}

function Overview({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { t } = useT();
  return <div className="space-y-5">
    <p className="text-sm text-muted">{t("admin.overview.help")}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {MODULES.map(({ id, icon: Icon, titleKey, descKey }) => <button key={id} type="button" onClick={() => onNavigate(id)} className="matchday-surface p-5 text-left transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <Icon size={20} className="text-brand" />
        <h2 className="matchday-heading mt-3 text-lg">{t(titleKey)}</h2>
        <p className="mt-1 text-sm text-muted">{t(descKey)}</p>
      </button>)}
    </div>
  </div>;
}

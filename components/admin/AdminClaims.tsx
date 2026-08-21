"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setClaimStatus, type AdminClaim, type ClaimStatus } from "@/lib/services/admin-claims";
import { formatAthleteCode } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

type Filter = ClaimStatus | "all";
const FILTERS: Filter[] = ["pending", "approved", "rejected", "all"];

export function AdminClaims({ claims }: { claims: AdminClaim[] | null }) {
  const { t } = useT();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const all = claims ?? [];
  const filtered = useMemo(() => (filter === "all" ? all : all.filter((c) => c.status === filter)), [all, filter]);

  async function decide(id: string, status: Exclude<ClaimStatus, "pending">) {
    setBusy(id); setError(false);
    try { await setClaimStatus(client, id, status); router.refresh(); }
    catch { setError(true); }
    finally { setBusy(null); }
  }

  if (claims === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.claims.loadError")}</p></section>;
  }

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><ShieldCheck size={19} className="text-brand" />{t("admin.claims.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.claims.desc")}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("admin.claims.filterLabel")}>
        {FILTERS.map((f) => {
          const count = f === "all" ? all.length : all.filter((c) => c.status === f).length;
          return <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-9 border px-3 text-xs font-extrabold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${filter === f ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-foreground"}`}>{t(`admin.claims.filter.${f}`)} ({count})</button>;
        })}
      </div>
    </section>

    {filtered.length === 0
      ? <section className="matchday-surface p-8 text-center text-sm text-muted">{t("admin.claims.empty")}</section>
      : <div className="space-y-4">{filtered.map((c) => <ClaimCard key={c.id} claim={c} busy={busy === c.id} onDecide={decide} />)}</div>}

    {error && <p role="alert" className="text-sm text-danger">{t("admin.claims.error")}</p>}
  </div>;
}

function ClaimCard({ claim, busy, onDecide }: { claim: AdminClaim; busy: boolean; onDecide: (id: string, status: Exclude<ClaimStatus, "pending">) => void }) {
  const { t } = useT();
  const target = claim.tipo === "atleta"
    ? `${claim.athleteName ?? "—"}${claim.bidAtleta ? ` · ${formatAthleteCode(claim.bidAtleta)}` : ""}${claim.athleteCategory ? ` · ${claim.athleteCategory}` : ""}`
    : `${claim.clubName ?? "—"}${claim.clubState ? ` · ${claim.clubState}` : ""}`;

  return <section className="matchday-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{t(`admin.claims.type.${claim.tipo}`)}</Badge>
        <StatusBadge status={claim.status} />
        <span className="text-xs text-muted">{new Date(claim.createdAt).toLocaleDateString()}</span>
      </div>
    </div>

    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t("admin.claims.requester")}</p>
        <p className="mt-1 font-semibold">{claim.requesterName ?? "—"}</p>
        {claim.requesterOrg && <p className="text-sm text-muted">{claim.requesterOrg}</p>}
        {claim.requesterEmail && <a href={`mailto:${claim.requesterEmail}`} className="text-sm text-brand hover:underline">{claim.requesterEmail}</a>}
      </div>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{claim.tipo === "atleta" ? t("admin.claims.athlete") : t("admin.claims.club")}</p>
        <p className="mt-1 font-semibold">{target}</p>
        {claim.tipo === "clube" && <p className="mt-1 text-xs text-amber-400">{t("admin.claims.compareHint")}</p>}
      </div>
    </div>

    {claim.mensagem && <div className="mt-4"><p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t("admin.claims.justification")}</p><p className="mt-1 whitespace-pre-line text-sm text-muted">{claim.mensagem}</p></div>}

    <div className="mt-4 flex flex-wrap items-center gap-3">
      {claim.documentoUrl && <Link href={claim.documentoUrl} target="_blank" rel="noopener noreferrer" className="min-h-9 border border-border px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide hover:border-brand">{t("admin.claims.viewDocument")}</Link>}
      {claim.status === "pending" && <>
        <Button type="button" disabled={busy} onClick={() => onDecide(claim.id, "approved")}>{t("admin.claims.approve")}</Button>
        <button type="button" disabled={busy} onClick={() => onDecide(claim.id, "rejected")} className="min-h-9 border border-danger/40 px-3 text-xs font-extrabold uppercase text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{t("admin.claims.reject")}</button>
      </>}
    </div>
  </section>;
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const { t } = useT();
  return <Badge tone={status === "approved" ? "brand" : status === "rejected" ? "danger" : "warning"}>{t(`admin.claims.status.${status}`)}</Badge>;
}

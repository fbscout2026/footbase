"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setCorrectionStatus, type AdminCorrection, type CorrectionStatus } from "@/lib/services/admin-corrections";
import { ClipboardCheck } from "lucide-react";

type Filter = CorrectionStatus | "all";
const FILTERS: Filter[] = ["pending", "approved", "rejected", "all"];

export function AdminCorrections({ corrections }: { corrections: AdminCorrection[] | null }) {
  const { t } = useT();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [manualNoticeFor, setManualNoticeFor] = useState<string | null>(null);

  const all = corrections ?? [];
  const filtered = useMemo(() => (filter === "all" ? all : all.filter((c) => c.status === filter)), [all, filter]);

  async function decide(c: AdminCorrection, status: Exclude<CorrectionStatus, "pending">) {
    setBusy(c.id); setError(false); setManualNoticeFor(null);
    try {
      const { applied } = await setCorrectionStatus(client, c.source, c.id, status);
      if (status === "approved" && !applied) setManualNoticeFor(c.id);
      router.refresh();
    }
    catch { setError(true); }
    finally { setBusy(null); }
  }

  if (corrections === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.corrections.loadError")}</p></section>;
  }

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><ClipboardCheck size={19} className="text-brand" />{t("admin.corrections.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.corrections.desc")}</p>
      <p className="mt-1 text-xs text-amber-400">{t("admin.corrections.applyNote")}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("admin.corrections.filterLabel")}>
        {FILTERS.map((f) => {
          const count = f === "all" ? all.length : all.filter((c) => c.status === f).length;
          return <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-9 border px-3 text-xs font-extrabold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${filter === f ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-foreground"}`}>{t(`admin.corrections.filter.${f}`)} ({count})</button>;
        })}
      </div>
    </section>

    {filtered.length === 0
      ? <section className="matchday-surface p-8 text-center text-sm text-muted">{t("admin.corrections.empty")}</section>
      : <div className="space-y-4">{filtered.map((c) => <CorrectionCard key={`${c.source}-${c.id}`} correction={c} busy={busy === c.id} showManualNotice={manualNoticeFor === c.id} onDecide={decide} />)}</div>}

    {error && <p role="alert" className="text-sm text-danger">{t("admin.corrections.error")}</p>}
  </div>;
}

function CorrectionCard({ correction: c, busy, showManualNotice, onDecide }: { correction: AdminCorrection; busy: boolean; showManualNotice: boolean; onDecide: (c: AdminCorrection, status: Exclude<CorrectionStatus, "pending">) => void }) {
  const { t } = useT();
  const isCrest = c.fieldName === "crest";
  return <section className="matchday-surface p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="brand">{t(`admin.corrections.source.${c.source}`)}</Badge>
      <StatusBadge status={c.status} />
      <span className="text-sm font-semibold">{c.targetLabel}</span>
      <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleDateString()}</span>
    </div>

    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t("admin.corrections.field")}</p>
        <p className="mt-1 font-semibold">{c.fieldName}</p>
      </div>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t("admin.corrections.change")}</p>
        <p className="mt-1 text-sm"><span className="text-muted">{c.currentValue ?? "—"}</span> <span className="text-muted">→</span>{" "}
          {isCrest
            ? <Link href={c.suggestedValue} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{t("admin.corrections.viewProposed")}</Link>
            : <span className="font-semibold text-brand">{c.suggestedValue}</span>}
        </p>
      </div>
    </div>

    {c.reason && <div className="mt-4"><p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t("admin.corrections.reason")}</p><p className="mt-1 whitespace-pre-line text-sm text-muted">{c.reason}</p></div>}

    {showManualNotice && <p className="mt-3 text-xs text-warning">{t("admin.corrections.manualApplyNote")}</p>}

    <div className="mt-4 flex flex-wrap items-center gap-3">
      {c.evidenceUrl && <Link href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" className="min-h-9 border border-border px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide hover:border-brand">{t("admin.corrections.viewProof")}</Link>}
      {c.status === "pending" && <>
        <Button type="button" disabled={busy} onClick={() => onDecide(c, "approved")}>{t("admin.corrections.approve")}</Button>
        <button type="button" disabled={busy} onClick={() => onDecide(c, "rejected")} className="min-h-9 border border-danger/40 px-3 text-xs font-extrabold uppercase text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{t("admin.corrections.reject")}</button>
      </>}
    </div>
  </section>;
}

function StatusBadge({ status }: { status: CorrectionStatus }) {
  const { t } = useT();
  return <Badge tone={status === "approved" ? "brand" : status === "rejected" ? "danger" : "warning"}>{t(`admin.corrections.status.${status}`)}</Badge>;
}

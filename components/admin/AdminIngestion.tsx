"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import type { ScrapingLog, ScrapingStatus } from "@/lib/services/admin-ingestion";
import { Activity } from "lucide-react";

const TONE: Record<ScrapingStatus, "brand" | "warning" | "danger" | "neutral"> = {
  success: "brand",
  running: "neutral",
  partial: "warning",
  failed: "danger",
};

// Read-only monitor of súmula ingestion runs.
export function AdminIngestion({ logs }: { logs: ScrapingLog[] | null }) {
  const { t } = useT();
  if (logs === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.ingestion.loadError")}</p></section>;
  }
  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><Activity size={19} className="text-brand" />{t("admin.ingestion.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.ingestion.desc")}</p>
    </section>
    <section className="matchday-surface overflow-hidden">
      {logs.length === 0
        ? <p className="p-8 text-center text-sm text-muted">{t("admin.ingestion.empty")}</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">{t("admin.ingestion.col.source")}</th>
              <th className="px-4 py-3">{t("admin.ingestion.col.status")}</th>
              <th className="px-4 py-3">{t("admin.ingestion.col.records")}</th>
              <th className="px-4 py-3">{t("admin.ingestion.col.started")}</th>
              <th className="px-4 py-3">{t("admin.ingestion.col.finished")}</th>
              <th className="px-4 py-3">{t("admin.ingestion.col.error")}</th>
            </tr></thead>
            <tbody>{logs.map((l) => <tr key={l.id} className="border-b border-border/60">
              <td className="px-4 py-3 font-semibold">{l.source}</td>
              <td className="px-4 py-3"><Badge tone={TONE[l.status]}>{t(`admin.ingestion.status.${l.status}`)}</Badge></td>
              <td className="metric-value px-4 py-3">{l.recordsIngested}</td>
              <td className="px-4 py-3">{new Date(l.startedAt).toLocaleString()}</td>
              <td className="px-4 py-3">{l.finishedAt ? new Date(l.finishedAt).toLocaleString() : "—"}</td>
              <td className="max-w-xs px-4 py-3 text-danger">{l.errorMessage ?? "—"}</td>
            </tr>)}</tbody>
          </table></div>}
    </section>
  </div>;
}

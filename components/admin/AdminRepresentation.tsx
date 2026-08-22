"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { createClient } from "@/lib/supabase/client";
import { transferRepresentation, type RepresentedAthlete, type EligibleAgent, type TransferRecord } from "@/lib/services/admin-representation";
import { formatAthleteCode } from "@/lib/format";
import { Repeat, UserCog } from "lucide-react";

export function AdminRepresentation({ athletes, agents, history }: { athletes: RepresentedAthlete[] | null; agents: EligibleAgent[] | null; history: TransferRecord[] | null }) {
  const { t } = useT();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);

  const [fbId, setBid] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (athletes === null || agents === null || history === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.representation.loadError")}</p></section>;
  }

  const selectedAthlete = athletes.find((a) => String(a.fbId) === fbId) ?? null;
  const agentOptions = agents.filter((a) => a.id !== selectedAthlete?.agentId).map((a) => ({ value: a.id, label: a.agencyName ? `${a.fullName} · ${a.agencyName}` : a.fullName }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      await transferRepresentation(client, Number(fbId), newAgentId, justificativa, comprovanteUrl);
      setSuccess(true);
      setBid(""); setNewAgentId(""); setJustificativa(""); setComprovanteUrl("");
      router.refresh();
    } catch {
      setError(t("admin.representation.error"));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = fbId && newAgentId && justificativa.trim().length >= 20 && /^https?:\/\//.test(comprovanteUrl);

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><Repeat size={19} className="text-brand" />{t("admin.representation.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.representation.desc")}</p>

      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-muted">{t("admin.representation.athlete")}</span>
          <Select ariaLabel={t("admin.representation.athlete")} value={fbId} onChange={(v) => { setBid(v); setNewAgentId(""); }}
            placeholder={t("admin.representation.athletePlaceholder")}
            options={athletes.map((a) => ({ value: String(a.fbId), label: `${a.name} · ${formatAthleteCode(a.fbId)}${a.category ? ` · ${a.category}` : ""}`, hint: a.agentName ?? undefined }))} />
        </label>

        {selectedAthlete && <p className="text-sm text-muted sm:col-span-2">{t("admin.representation.currentAgent")}: <strong className="text-foreground">{selectedAthlete.agentName ?? "—"}</strong></p>}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{t("admin.representation.newAgent")}</span>
          <Select ariaLabel={t("admin.representation.newAgent")} value={newAgentId} onChange={setNewAgentId}
            placeholder={t("admin.representation.newAgentPlaceholder")} disabled={!fbId} options={agentOptions} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{t("admin.representation.evidence")}</span>
          <input type="url" required maxLength={1000} placeholder="https://" value={comprovanteUrl} onChange={(e) => setComprovanteUrl(e.target.value)}
            className="min-h-11 border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-muted">{t("admin.representation.justification")}</span>
          <textarea required minLength={20} maxLength={2000} rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
            className="border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
        </label>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={!canSubmit || saving}>{saving ? t("common.loading") : t("admin.representation.submit")}</Button>
          {success && <span className="ml-3 text-sm text-brand">{t("admin.representation.success")}</span>}
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </form>
    </section>

    <section className="matchday-surface p-5">
      <h3 className="matchday-heading flex items-center gap-2 text-lg"><UserCog size={17} className="text-brand" />{t("admin.representation.history")}</h3>
      {history.length === 0
        ? <p className="mt-3 text-sm text-muted">{t("admin.representation.historyEmpty")}</p>
        : <div className="mt-3 space-y-3">{history.map((r) => <div key={r.id} className="border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{r.athleteName ?? formatAthleteCode(r.fbIdAtleta)}</p>
              <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{r.agenteAnteriorName ?? t("admin.representation.noPreviousAgent")} → <strong className="text-foreground">{r.agenteNovoName ?? "—"}</strong></p>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{r.justificativa}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <Link href={r.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-brand hover:underline">{t("admin.representation.viewDocument")}</Link>
              <span className="text-muted">{t("admin.representation.by")} {r.adminName ?? "—"}</span>
            </div>
          </div>)}</div>}
    </section>
  </div>;
}

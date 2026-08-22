"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CORRECTION_FIELDS, validateCorrection, type CorrectionField } from "@/lib/agent-panel-rules";
import { createClient } from "@/lib/supabase/client";
import { createCorrectionRequest, type AgentAthleteRecord, type CorrectionRequestRecord } from "@/lib/services/agent-panel";
import { useT } from "@/lib/i18n/I18nProvider";
import { formatAthleteCode } from "@/lib/format";

export function CorrectionForm({ userId, athletes, corrections, readOnly, onCreated }: { userId: string; athletes: AgentAthleteRecord[]; corrections: CorrectionRequestRecord[]; readOnly: boolean; onCreated: (record: CorrectionRequestRecord) => void }) {
  const { t } = useT(); const client = useMemo(() => createClient(), []);
  const [fbId, setBid] = useState(athletes[0] ? String(athletes[0].fbId) : "");
  const [field, setField] = useState<CorrectionField>("name");
  const [saving, setSaving] = useState(false); const [error, setError] = useState(false);

  function currentValue(athlete: AgentAthleteRecord | undefined, key: CorrectionField): string | null {
    if (!athlete) return null;
    const values: Record<CorrectionField, unknown> = { fifa_id: athlete.fifaId, name: athlete.name, birth_date: athlete.birthDate, nacionalidade: athlete.nationality, tem_passaporte: athlete.hasPassport, passaporte: athlete.passport, main_position: athlete.mainPosition, inicio_carreira: athlete.careerStart, contract_end_date: athlete.contractEndDate, current_club_id: athlete.currentClubId, current_category: athlete.currentCategory, experiencia_internacional: athlete.internationalExperience, jogos_suspenso: athlete.suspendedGames, performance_data: null };
    const value = values[key]; return value === null || value === undefined ? null : String(value);
  }

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form); const athlete = athletes.find((item) => String(item.fbId) === fbId);
    if (!athlete) return;
    setSaving(true); setError(false);
    try {
      const validated = validateCorrection({ field, suggestedValue: String(data.get("suggested") ?? ""), reason: String(data.get("reason") ?? ""), proofUrl: String(data.get("proof") ?? "") });
      const record = await createCorrectionRequest(client, { userId, fbId: athlete.fbId, field: validated.field, currentValue: currentValue(athlete, validated.field), suggestedValue: validated.suggestedValue, reason: validated.reason, proofUrl: validated.proofUrl });
      onCreated(record); form.reset(); setField("name");
    } catch { setError(true); } finally { setSaving(false); }
  }

  return <div className="mt-4 space-y-5">
    {!readOnly && athletes.length > 0 && <form className="space-y-3 border-b border-border pb-5" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
      <div><p className="mb-1.5 text-sm font-medium text-muted">{t("agent.correction.athlete")}</p><Select value={fbId} onChange={setBid} ariaLabel={t("agent.correction.athlete")} options={athletes.map((athlete) => ({ value: String(athlete.fbId), label: `${athlete.name} · ${athlete.fbId}` }))} disabled={saving} /></div>
      <div><p className="mb-1.5 text-sm font-medium text-muted">{t("agent.correction.field")}</p><Select value={field} onChange={(value) => setField(value as CorrectionField)} ariaLabel={t("agent.correction.field")} options={CORRECTION_FIELDS.map((value) => ({ value, label: t(`agent.correction.fields.${value}`) }))} disabled={saving} /></div>
      <div className="border border-border bg-background px-3 py-2 text-xs"><span className="text-muted">{t("agent.correction.current")}: </span>{currentValue(athletes.find((item) => String(item.fbId) === fbId), field) ?? "—"}</div>
      <Input id="correction-suggested" name="suggested" label={t("agent.correction.suggested")} disabled={saving} required />
      <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-muted">{t("agent.correction.reason")}</span><textarea name="reason" rows={3} maxLength={2000} required disabled={saving} className="border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand" /></label>
      <Input id="correction-proof" name="proof" type="url" label={t("agent.correction.proof")} disabled={saving} />
      <div className="flex items-center gap-3"><Button type="submit" disabled={saving}>{t("agent.correction.send")}</Button>{error && <span className="text-sm text-danger">{t("agent.saveError")}</span>}</div>
    </form>}
    <div><h3 className="text-sm font-extrabold uppercase">{t("agent.correction.history")}</h3>{corrections.length === 0 ? <p className="mt-3 text-sm text-muted">{t("agent.correction.empty")}</p> : <ul className="mt-3 space-y-3">{corrections.map((item) => <li key={item.id} className="border border-border bg-background p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-bold">{t(`agent.correction.fields.${item.field}`)} · {formatAthleteCode(item.fbId)}</p><p className="mt-1 text-xs text-muted">{item.suggestedValue}</p></div><Badge tone={item.status === "approved" ? "brand" : item.status === "rejected" ? "danger" : "warning"}>{t(`agent.correction.status.${item.status}`)}</Badge></div></li>)}</ul>}</div>
  </div>;
}

"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { normalizeOptionalText, normalizeYouTubeUrl, validateAthleteEdit, type DominantFoot, type PositionCode } from "@/lib/agent-panel-rules";
import { formatAthleteCode } from "@/lib/format";
import { updateClaimedAthlete, type AgentAthleteRecord } from "@/lib/services/agent-panel";

const POSITIONS: PositionCode[] = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];

export function AgentAthleteEditor({ athlete, onClose, onSaved }: { athlete: AgentAthleteRecord; onClose: () => void; onSaved: (athlete: AgentAthleteRecord) => void }) {
  const { t } = useT();
  const client = useMemo(() => createClient(), []);
  const [foot, setFoot] = useState(athlete.dominantFoot ?? "");
  const [secondary, setSecondary] = useState(athlete.secondaryPosition ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setSaving(true); setError(false);
    try {
      const input = validateAthleteEdit({
        apelido: normalizeOptionalText(String(data.get("apelido") ?? ""), 120),
        dominant_foot: (foot || null) as DominantFoot | null,
        height_cm: data.get("height") ? Number(data.get("height")) : null,
        weight_kg: data.get("weight") ? Number(data.get("weight")) : null,
        posicao_secundaria: (secondary || null) as PositionCode | null,
        youtube_video_url: normalizeYouTubeUrl(String(data.get("youtube") ?? "")),
      });
      await updateClaimedAthlete(client, athlete.bid, input);
      onSaved({ ...athlete, apelido: input.apelido, dominantFoot: input.dominant_foot, heightCm: input.height_cm, weightKg: input.weight_kg, secondaryPosition: input.posicao_secundaria, youtubeVideoUrl: input.youtube_video_url });
    } catch { setError(true); } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="athlete-editor-title" className="matchday-surface max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 id="athlete-editor-title" className="matchday-heading text-2xl">{t("agent.editAthlete")}</h2><p className="text-sm text-muted">{athlete.name} · {formatAthleteCode(athlete.bid)}</p></div><button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-11 w-11 items-center justify-center border border-border hover:border-brand"><X size={18} /></button></div>
      <div className="mt-5 border border-border bg-background p-4 text-sm"><p className="font-bold uppercase">{t("agent.locked.title")}</p><p className="mt-1 text-muted">{t("agent.locked.help")}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted">{t("agent.profile.name")}</dt><dd>{athlete.name}</dd></div><div><dt className="text-muted">{t("agent.athletes.position")}</dt><dd>{athlete.mainPosition ?? "—"}</dd></div><div><dt className="text-muted">{t("agent.athletes.category")}</dt><dd>{athlete.currentCategory ?? "—"}</dd></div><div><dt className="text-muted">{t("agent.birthDate")}</dt><dd>{athlete.birthDate}</dd></div></dl></div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
        <Input id="athlete-nickname" name="apelido" label={t("agent.field.nickname")} defaultValue={athlete.apelido ?? ""} disabled={saving} />
        <div><p className="mb-1.5 text-sm font-medium text-muted">{t("agent.field.foot")}</p><Select value={foot} onChange={setFoot} ariaLabel={t("agent.field.foot")} options={[{ value: "", label: t("common.notInformed") }, { value: "left", label: t("foot.left") }, { value: "right", label: t("foot.right") }, { value: "both", label: t("foot.both") }]} disabled={saving} /></div>
        <Input id="athlete-height" name="height" type="number" min={100} max={220} label={t("agent.field.height")} defaultValue={athlete.heightCm ?? ""} disabled={saving} />
        <Input id="athlete-weight" name="weight" type="number" min={30} max={150} label={t("agent.field.weight")} defaultValue={athlete.weightKg ?? ""} disabled={saving} />
        <div><p className="mb-1.5 text-sm font-medium text-muted">{t("agent.field.secondary")}</p><Select value={secondary} onChange={setSecondary} ariaLabel={t("agent.field.secondary")} options={[{ value: "", label: t("common.notInformed") }, ...POSITIONS.map((value) => ({ value, label: value }))]} disabled={saving} /></div>
        <Input id="athlete-youtube" name="youtube" type="url" label={t("agent.field.youtube")} defaultValue={athlete.youtubeVideoUrl ?? ""} disabled={saving} />
        <details className="border border-border bg-background p-4 sm:col-span-2"><summary className="cursor-pointer font-bold uppercase text-brand">{t("agent.youtube.title")}</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted"><li>{t("agent.youtube.step1")}</li><li>{t("agent.youtube.step2")}</li><li>{t("agent.youtube.step3")}</li></ol></details>
        <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={saving}>{t("common.save")}</Button><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>{error && <span className="text-sm text-danger">{t("agent.saveError")}</span>}</div>
      </form>
    </div>
  </div>;
}

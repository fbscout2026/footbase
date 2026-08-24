"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { useSession } from "@/lib/auth/SessionProvider";
import { useT } from "@/lib/i18n/I18nProvider";
import { normalizeEmail, normalizeHttpUrl, normalizeOptionalText, normalizePhone, normalizeRequiredText, normalizeState } from "@/lib/club-panel-rules";
import { createClient } from "@/lib/supabase/client";
import { createClubCorrection, type ClubPanelData, updateClubOperationalProfile } from "@/lib/services/club-panel";
import { Building2, ImageUp, ShieldAlert } from "lucide-react";

export function ClubProfileForm({ data, readOnly }: { data: ClubPanelData; readOnly: boolean }) {
  const { t } = useT();
  const { userId } = useSession();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);

  async function saveProfile(form: HTMLFormElement) {
    if (readOnly) return;
    const fields = new FormData(form);
    setSaving(true); setMessage(null);
    try {
      await updateClubOperationalProfile(client, data.club.id, {
        display_name: normalizeOptionalText(String(fields.get("displayName") ?? ""), 160),
        description: normalizeOptionalText(String(fields.get("description") ?? ""), 1200),
        headquarters_address: normalizeOptionalText(String(fields.get("address") ?? ""), 300),
        headquarters_city: normalizeOptionalText(String(fields.get("city") ?? ""), 120),
        headquarters_state: normalizeState(String(fields.get("state") ?? "")),
        phone: normalizePhone(String(fields.get("phone") ?? "")),
        whatsapp: normalizePhone(String(fields.get("whatsapp") ?? "")),
        contact_email: normalizeEmail(String(fields.get("email") ?? "")),
        website_url: normalizeHttpUrl(String(fields.get("website") ?? "")),
        instagram_url: normalizeHttpUrl(String(fields.get("instagram") ?? "")),
      });
      setMessage("saved"); router.refresh();
    } catch { setMessage("error"); }
    finally { setSaving(false); }
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.55fr)]">
    <section className="matchday-surface p-5 sm:p-6"><h2 className="matchday-heading flex items-center gap-2 text-xl"><Building2 size={19} className="text-brand" />{t("clubPanel.profile.operational")}</h2><p className="mt-1 text-sm text-muted">{t("clubPanel.profile.operationalHelp")}</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void saveProfile(event.currentTarget); }}>
        <Input id="club-display-name" name="displayName" label={t("clubPanel.profile.displayName")} defaultValue={data.club.displayName ?? ""} disabled={readOnly || saving} />
        <Input id="club-email" name="email" type="email" label={t("clubPanel.profile.email")} defaultValue={data.club.contactEmail ?? ""} disabled={readOnly || saving} />
        <Input id="club-address" name="address" label={t("clubPanel.profile.address")} defaultValue={data.club.headquartersAddress ?? ""} disabled={readOnly || saving} className="sm:col-span-2" />
        <Input id="club-city" name="city" label={t("clubPanel.profile.city")} defaultValue={data.club.headquartersCity ?? ""} disabled={readOnly || saving} />
        <Input id="club-state" name="state" label={t("clubPanel.profile.state")} defaultValue={data.club.headquartersState ?? ""} maxLength={2} disabled={readOnly || saving} />
        <Input id="club-phone" name="phone" label={t("clubPanel.profile.phone")} defaultValue={data.club.phone ?? ""} disabled={readOnly || saving} />
        <Input id="club-whatsapp" name="whatsapp" label="WhatsApp" defaultValue={data.club.whatsapp ?? ""} disabled={readOnly || saving} />
        <Input id="club-website" name="website" type="url" label={t("clubPanel.profile.website")} defaultValue={data.club.websiteUrl ?? ""} disabled={readOnly || saving} />
        <Input id="club-instagram" name="instagram" type="url" label="Instagram" defaultValue={data.club.instagramUrl ?? ""} disabled={readOnly || saving} />
        <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-medium text-muted">{t("clubPanel.profile.description")}</span><textarea name="description" rows={5} maxLength={1200} defaultValue={data.club.description ?? ""} disabled={readOnly || saving} className="border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60" /></label>
        {!readOnly && <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? t("common.loading") : t("common.save")}</Button>{message && <span role="status" className={`text-sm ${message === "error" ? "text-danger" : "text-brand"}`}>{t(message === "error" ? "clubPanel.saveError" : "clubPanel.saved")}</span>}</div>}
      </form>
    </section>
    <div className="space-y-5"><CrestDisplay currentUrl={data.club.crestUrl} /><OfficialCorrection data={data} userId={userId} readOnly={readOnly} /></div>
  </div>;
}

// Read-only crest. Captured automatically from official sources by the ingestion
// service. The club cannot upload; it may only SUGGEST a different version through
// the institutional correction (field "crest") below.
function CrestDisplay({ currentUrl }: { currentUrl: string | null }) {
  const { t } = useT();
  return <section className="matchday-surface p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><ImageUp size={19} className="text-brand" />{t("clubPanel.crest.title")}</h2><div className="mt-4 flex items-center gap-4"><div className="flex h-24 w-24 items-center justify-center border border-border bg-background">{currentUrl ? <img src={currentUrl} alt={t("clubPanel.crest.alt")} className="max-h-20 max-w-20 object-contain" /> : <Building2 size={30} className="text-muted" />}</div><div className="text-sm text-muted"><p>{t("clubPanel.crest.readonlyHelp")}</p></div></div></section>;
}

function OfficialCorrection({ data, userId, readOnly }: { data: ClubPanelData; userId: string; readOnly: boolean }) {
  const { t } = useT(); const router = useRouter(); const client = useMemo(() => createClient(), []); const [error, setError] = useState(false); const [saving, setSaving] = useState(false); const [fieldName, setFieldName] = useState("name");
  async function submit(form: HTMLFormElement) { const fields = new FormData(form); setSaving(true); setError(false); try { await createClubCorrection(client, { clubId: data.club.id, userId, fieldName, suggestedValue: normalizeRequiredText(String(fields.get("suggestedValue") ?? ""), 1, 500), reason: normalizeRequiredText(String(fields.get("reason") ?? ""), 20, 2000), evidenceUrl: normalizeHttpUrl(String(fields.get("evidenceUrl") ?? ""), 1000) }); form.reset(); setFieldName("name"); router.refresh(); } catch { setError(true); } finally { setSaving(false); } }
  return <section className="matchday-surface p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><ShieldAlert size={19} className="text-brand" />{t("clubPanel.correction.title")}</h2><p className="mt-2 text-sm text-muted">{t("clubPanel.correction.help")}</p><div className="mt-3 flex flex-wrap gap-2"><Badge>{data.club.name}</Badge>{data.club.cnpj && <Badge>{data.club.cnpj}</Badge>}<Badge>{data.club.federation ?? "—"}</Badge></div>{!readOnly && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label className="block text-sm text-muted">{t("clubPanel.correction.field")}<div className="mt-1"><Select ariaLabel={t("clubPanel.correction.field")} value={fieldName} onChange={setFieldName} options={[{ value: "name", label: t("clubPanel.official.name") }, { value: "cnpj", label: "CNPJ" }, { value: "state", label: t("clubPanel.profile.state") }, { value: "federacao", label: t("clubs.federation") }, { value: "crest", label: t("clubPanel.official.crest") }]} /></div></label><Input id="club-suggested" name="suggestedValue" label={t("clubPanel.correction.suggested")} required /><label className="block text-sm text-muted">{t("clubPanel.correction.reason")}<textarea name="reason" minLength={20} maxLength={2000} required rows={3} className="mt-1 w-full border border-border bg-background p-3 text-foreground" /></label><Input id="club-correction-evidence" name="evidenceUrl" type="url" label={t("clubPanel.evidence")} /><Button type="submit" disabled={saving}>{t("clubPanel.correction.submit")}</Button>{error && <p role="alert" className="text-sm text-danger">{t("clubPanel.saveError")}</p>}</form>}<div className="mt-4 space-y-2">{data.corrections.map((item) => <div key={item.id} className="border border-border bg-background p-3 text-sm"><div className="flex justify-between gap-3"><strong>{item.fieldName}</strong><StatusBadge status={item.status} /></div><p className="mt-1 text-muted">{item.currentValue ?? "—"} → {item.suggestedValue}</p></div>)}</div></section>;
}

function StatusBadge({ status }: { status: string }) { const { t } = useT(); return <Badge tone={status === "approved" ? "brand" : status === "rejected" ? "danger" : "warning"}>{t(`clubPanel.status.${status}`)}</Badge>; }

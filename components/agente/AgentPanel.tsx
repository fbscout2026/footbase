"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AgentAthleteEditor } from "@/components/agente/AgentAthleteEditor";
import { CorrectionForm } from "@/components/agente/CorrectionForm";
import { useSession } from "@/lib/auth/SessionProvider";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { normalizeOptionalText } from "@/lib/agent-panel-rules";
import { updateAgentProfile, type AgentAthleteRecord, type AgentPanelData, type AgentProfileRecord } from "@/lib/services/agent-panel";
import { formatAthleteCode } from "@/lib/format";
import { BriefcaseBusiness, CheckCircle2, FilePenLine, Heart, Pencil, ShieldCheck, Users } from "lucide-react";

export function AgentPanel({
  initialData,
  agents,
  readOnly,
  loadFailed = false,
}: {
  initialData: AgentPanelData | null;
  agents: AgentProfileRecord[];
  readOnly: boolean;
  loadFailed?: boolean;
}) {
  const { t } = useT();
  const session = useSession();
  const client = useMemo(() => createClient(), []);
  const [data, setData] = useState(initialData);
  const [editingAthlete, setEditingAthlete] = useState<AgentAthleteRecord | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState(false);

  if (!data) {
    return (
      <div className="matchday-surface p-10 text-center">
        <ShieldCheck size={34} className="mx-auto text-brand" />
        <h1 className="matchday-heading mt-4 text-2xl">{loadFailed ? t("agent.loadError") : t("agent.noProfile")}</h1>
        {agents.length > 0 && <AgentSelector agents={agents} currentUserId={null} />}
        {loadFailed && <Button className="mt-5" onClick={() => location.reload()}>{t("common.retry")}</Button>}
      </div>
    );
  }

  async function saveProfile(form: HTMLFormElement) {
    if (readOnly) return;
    const current = data;
    if (!current) return;
    const fields = new FormData(form);
    setSavingProfile(true);
    setProfileError(false);
    try {
      const input = {
        fullName: String(fields.get("fullName") ?? "").trim(),
        agencyName: normalizeOptionalText(String(fields.get("agencyName") ?? ""), 160),
        markets: String(fields.get("markets") ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20),
        instagram: normalizeOptionalText(String(fields.get("instagram") ?? ""), 120),
        phone: normalizeOptionalText(String(fields.get("phone") ?? ""), 40),
        contactEmail: normalizeOptionalText(String(fields.get("contactEmail") ?? ""), 254),
        bio: normalizeOptionalText(String(fields.get("bio") ?? ""), 800),
      };
      if (!input.fullName) throw new Error("name-required");
      await updateAgentProfile(client, current.agent.id, input);
      setData((latest) => latest ? { ...latest, agent: { ...latest.agent, ...input } } : latest);
    } catch {
      setProfileError(true);
    } finally {
      setSavingProfile(false);
    }
  }

  const pending = data.corrections.filter((item) => item.status === "pending").length;

  return (
    <div className="space-y-5">
      {session.role === "admin" && <AgentSelector agents={agents} currentUserId={data.agent.userId} />}

      <section className="matchday-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-brand"><BriefcaseBusiness size={18} /><span className="text-xs font-extrabold uppercase tracking-widest">UC07</span></div>
            <h1 className="matchday-heading text-3xl">{t("agent.title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("agent.subtitle")}</p>
          </div>
          <Badge tone={data.agent.verifiedStatus === "verified" ? "brand" : data.agent.verifiedStatus === "rejected" ? "danger" : "warning"}>
            {t(`agent.verified.${data.agent.verifiedStatus}`)}
          </Badge>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric icon={Users} value={data.athletes.length} label={t("agent.metric.athletes")} />
          <Metric icon={Heart} value={data.favoriteCount} label={t("agent.metric.favorites")} />
          <Metric icon={FilePenLine} value={pending} label={t("agent.metric.pending")} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.55fr)]">
        <section className="matchday-surface p-5">
          <h2 className="matchday-heading text-xl">{t("agent.profile.title")}</h2>
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void saveProfile(event.currentTarget); }}>
            <Input id="agent-full-name" name="fullName" label={t("agent.profile.name")} defaultValue={data.agent.fullName} disabled={readOnly || savingProfile} required />
            <Input id="agent-agency" name="agencyName" label={t("agent.profile.agency")} defaultValue={data.agent.agencyName ?? ""} disabled={readOnly || savingProfile} />
            <Input id="agent-license" label={t("agent.profile.license")} value={data.agent.licenseLevel ?? t("common.notInformed")} disabled />
            <Input id="agent-markets" name="markets" label={t("agent.profile.markets")} defaultValue={data.agent.markets.join(", ")} disabled={readOnly || savingProfile} />
            <Input id="agent-instagram" name="instagram" label="Instagram" defaultValue={data.agent.instagram ?? ""} disabled={readOnly || savingProfile} />
            <Input id="agent-phone" name="phone" label={t("agent.profile.phone")} defaultValue={data.agent.phone ?? ""} disabled={readOnly || savingProfile} />
            <Input id="agent-email" name="contactEmail" type="email" label={t("agent.profile.email")} defaultValue={data.agent.contactEmail ?? ""} disabled={readOnly || savingProfile} />
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-medium text-muted">{t("agent.profile.bio")}</span><textarea name="bio" rows={4} maxLength={800} defaultValue={data.agent.bio ?? ""} disabled={readOnly || savingProfile} className="border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60" /></label>
            {!readOnly && <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={savingProfile}>{t("common.save")}</Button>{profileError && <span className="text-sm text-danger">{t("agent.saveError")}</span>}</div>}
          </form>
        </section>

        <section className="matchday-surface p-5">
          <h2 className="matchday-heading text-xl">{t("agent.correction.title")}</h2>
          <CorrectionForm
            userId={data.agent.userId}
            athletes={data.athletes}
            corrections={data.corrections}
            readOnly={readOnly}
            onCreated={(correction) => setData({ ...data, corrections: [correction, ...data.corrections] })}
          />
        </section>
      </div>

      <section className="matchday-surface overflow-hidden">
        <div className="border-b border-border p-5"><h2 className="matchday-heading text-xl">{t("agent.athletes.title")}</h2><p className="mt-1 text-sm text-muted">{t("agent.athletes.help")}</p></div>
        {data.athletes.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("agent.athletes.empty")}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3">{t("agent.athletes.athlete")}</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">{t("agent.athletes.position")}</th><th className="px-4 py-3">{t("agent.athletes.category")}</th><th className="px-4 py-3">{t("agent.athletes.physical")}</th><th className="px-4 py-3 text-right">{t("common.actions")}</th></tr></thead><tbody>{data.athletes.map((athlete) => <tr key={athlete.bid} className="border-b border-border/60"><td className="px-4 py-3"><Link href={`/atletas/${athlete.bid}`} className="font-semibold hover:text-brand">{athlete.name}</Link>{athlete.apelido && <p className="text-xs text-muted">{athlete.apelido}</p>}</td><td className="px-4 py-3 metric-value">{formatAthleteCode(athlete.bid)}</td><td className="px-4 py-3">{athlete.mainPosition}{athlete.secondaryPosition ? ` / ${athlete.secondaryPosition}` : ""}</td><td className="px-4 py-3">{athlete.currentCategory ?? "—"}</td><td className="px-4 py-3">{athlete.heightCm ?? "—"} cm · {athlete.weightKg ?? "—"} kg</td><td className="px-4 py-3 text-right">{readOnly ? <Link href={`/atletas/${athlete.bid}`} className="font-bold uppercase text-brand">{t("common.view")}</Link> : <button type="button" onClick={() => setEditingAthlete(athlete)} className="inline-flex min-h-11 items-center gap-2 border border-border px-3 font-bold uppercase hover:border-brand"><Pencil size={15} />{t("common.edit")}</button>}</td></tr>)}</tbody></table></div>
        )}
      </section>

      {editingAthlete && <AgentAthleteEditor athlete={editingAthlete} onClose={() => setEditingAthlete(null)} onSaved={(athlete) => { setData({ ...data, athletes: data.athletes.map((item) => item.bid === athlete.bid ? athlete : item) }); setEditingAthlete(null); }} />}
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return <div className="border border-border bg-background p-4"><Icon size={18} className="text-brand" /><p className="metric-value mt-3 text-3xl font-black">{value}</p><p className="text-xs uppercase tracking-wide text-muted">{label}</p></div>;
}

function AgentSelector({ agents, currentUserId }: { agents: AgentProfileRecord[]; currentUserId: string | null }) {
  const { t } = useT();
  return <section className="matchday-surface p-4"><div className="flex flex-wrap items-center gap-3"><ShieldCheck size={18} className="text-brand" /><span className="text-sm font-bold uppercase">{t("agent.supervision")}</span><div className="flex flex-wrap gap-2">{agents.map((agent) => <Link key={agent.id} href={`/agente?user=${agent.userId}`} className={`border px-3 py-2 text-sm ${currentUserId === agent.userId ? "border-brand bg-brand/15" : "border-border hover:border-brand"}`}>{agent.fullName}</Link>)}</div></div></section>;
}

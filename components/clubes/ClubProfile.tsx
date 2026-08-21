"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, ShieldCheck, Users } from "lucide-react";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSession } from "@/lib/auth/SessionProvider";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { normalizeClaimDocumentUrl, normalizeClaimMessage, type ClubClaimViewState } from "@/lib/club-claim-rules";
import { createClubClaim, type ClubProfileData } from "@/lib/services/clubs";
import { formatAthleteCode } from "@/lib/format";

export function ClubProfile({ initialData }: { initialData: ClubProfileData }) {
  const { t } = useT();
  const session = useSession();
  const [data, setData] = useState(initialData);
  const club = data.club;

  return (
    <div className="space-y-5">
      <section className="matchday-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4"><ClubeCrest src={club.crestUrl} name={club.name} size={72} /><div><div className="mb-2 flex items-center gap-2 text-brand"><Building2 size={17} /><span className="text-xs font-extrabold uppercase tracking-widest">{t("clubs.profile")}</span></div><h1 className="matchday-heading text-3xl sm:text-4xl uppercase">{club.name}</h1><p className="mt-1 text-sm text-muted">{[club.state, club.federation].filter(Boolean).join(" · ") || t("common.notInformed")}</p></div></div>
          <Badge tone={club.claimStatus === "claimed" ? "brand" : club.claimStatus === "pending" ? "warning" : "neutral"}>{t(`clubs.status.${club.claimStatus}`)}</Badge>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric value={club.athleteCount} label={t("clubs.athletes")} /><Metric value={club.activeCategories.length} label={t("clubs.categories")} /><Metric value={club.tournaments.length} label={t("clubs.tournaments")} /></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
        <section className="matchday-surface overflow-hidden"><div className="flex items-center gap-2 border-b border-border p-5"><Users size={18} className="text-brand" /><h2 className="matchday-heading text-xl">{t("clubs.squad")}</h2></div>{data.squad.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("clubs.squadEmpty")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted"><th className="px-5 py-3">{t("clubs.athlete")}</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">{t("clubs.position")}</th><th className="px-4 py-3">{t("clubs.category")}</th></tr></thead><tbody>{data.squad.map((athlete) => <tr key={athlete.bid} className="border-b border-border/60"><td className="px-5 py-4"><Link href={`/atletas/${athlete.bid}`} className="font-bold hover:text-brand">{athlete.name}</Link>{athlete.nickname && <p className="text-xs text-muted">{athlete.nickname}</p>}</td><td className="metric-value px-4 py-4">{formatAthleteCode(athlete.bid)}</td><td className="px-4 py-4">{athlete.mainPosition ?? "—"}</td><td className="px-4 py-4">{athlete.category ?? "—"}</td></tr>)}</tbody></table></div>}</section>
        <div className="space-y-5"><InfoPanel title={t("clubs.categories")} values={club.activeCategories} empty={t("clubs.noCategories")} /><InfoPanel title={t("clubs.tournaments")} values={club.tournaments} empty={t("clubs.noTournaments")} /><ClaimPanel state={data.claimViewState} ownRequest={data.ownRequest} clubId={club.id} onSubmitted={(request) => setData({ ...data, ownRequest: request, claimViewState: "own-pending", club: { ...club, claimStatus: "pending" } })} userId={session.userId} /></div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) { return <div className="border border-border bg-background p-4"><p className="metric-value text-3xl font-black">{value}</p><p className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</p></div>; }
function InfoPanel({ title, values, empty }: { title: string; values: string[]; empty: string }) { return <section className="matchday-surface p-5"><h2 className="matchday-heading text-lg">{title}</h2>{values.length ? <div className="mt-3 flex flex-wrap gap-2">{values.map((value) => <Badge key={value}>{value}</Badge>)}</div> : <p className="mt-2 text-sm text-muted">{empty}</p>}</section>; }

function ClaimPanel({ state, ownRequest, clubId, userId, onSubmitted }: { state: ClubClaimViewState; ownRequest: ClubProfileData["ownRequest"]; clubId: string; userId: string; onSubmitted: (request: NonNullable<ClubProfileData["ownRequest"]>) => void }) {
  const { t } = useT(); const client = useMemo(() => createClient(), []); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit(form: HTMLFormElement) { setSaving(true); setError(""); try { const fields = new FormData(form); const request = await createClubClaim(client, { userId, clubId, documentUrl: normalizeClaimDocumentUrl(String(fields.get("documentUrl") ?? "")), message: normalizeClaimMessage(String(fields.get("message") ?? "")) }); onSubmitted(request); } catch (reason) { const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : reason instanceof Error ? reason.message : "unknown"; const validationCodes = new Set(["document-required", "document-too-long", "invalid-document-url", "message-too-short", "message-too-long"]); setError(code === "23505" ? t("clubs.claim.duplicate") : validationCodes.has(code) ? t(`clubs.claim.error.${code}`) : t("clubs.claim.error.unknown")); } finally { setSaving(false); } }
  return <section className="matchday-surface p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-brand" /><h2 className="matchday-heading text-lg">{t("clubs.claim.title")}</h2></div>{state === "eligible" ? <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><p className="text-sm text-muted">{t("clubs.claim.help")}</p><Input id="claim-document" name="documentUrl" type="url" label={t("clubs.claim.document")} placeholder="https://" maxLength={1000} required /><label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-muted">{t("clubs.claim.message")}</span><textarea name="message" minLength={20} maxLength={2000} rows={5} required className="border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand" /></label><Button type="submit" disabled={saving}>{saving ? t("common.loading") : t("clubs.claim.submit")}</Button>{error && <p role="alert" className="text-sm text-danger">{error}</p>}</form> : <ClaimState state={state} ownRequest={ownRequest} />}</section>;
}

function ClaimState({ state, ownRequest }: { state: ClubClaimViewState; ownRequest: ClubProfileData["ownRequest"] }) { const { t } = useT(); return <div className="mt-4 space-y-3"><p className="text-sm text-muted">{t(`clubs.claim.state.${state}`)}</p>{ownRequest && <a href={ownRequest.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-border px-3 text-sm font-bold hover:border-brand"><ExternalLink size={15} />{t("clubs.claim.viewDocument")}</a>}</div>; }

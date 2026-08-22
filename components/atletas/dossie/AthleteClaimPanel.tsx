"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/lib/auth/SessionProvider";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { normalizeClaimDocumentUrl, normalizeClaimMessage } from "@/lib/athlete-claim-rules";
import { createAthleteClaim, loadAthleteClaimContext, type AthleteClaimContext } from "@/lib/services/athlete-claims";

export function AthleteClaimPanel({ fbId }: { fbId: number }) {
  const { t } = useT();
  const session = useSession();
  const client = useMemo(() => createClient(), []);
  const [context, setContext] = useState<AthleteClaimContext | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setContext(await loadAthleteClaimContext(client, { fbId, userId: session.userId, role: session.role }));
    } catch {
      setContext(null);
      setError(t("athleteClaim.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [fbId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(form: HTMLFormElement) {
    setSaving(true); setError("");
    try {
      const fields = new FormData(form);
      const request = await createAthleteClaim(client, {
        fbId, userId: session.userId,
        documentUrl: normalizeClaimDocumentUrl(String(fields.get("documentUrl") ?? "")),
        message: normalizeClaimMessage(String(fields.get("message") ?? "")),
      });
      setContext({ claimStatus: "pending", viewState: "own-pending", ownRequest: request });
      setExpanded(false);
    } catch (reason) {
      const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : reason instanceof Error ? reason.message : "unknown";
      const validation = new Set(["document-required", "document-too-long", "invalid-document-url", "message-too-short", "message-too-long"]);
      setError(code === "23505" ? t("athleteClaim.duplicate") : validation.has(code) ? t(`clubs.claim.error.${code}`) : t("athleteClaim.submitError"));
    } finally { setSaving(false); }
  }

  if (loading) return <p className="mt-2 text-xs text-muted" aria-live="polite">{t("common.loading")}</p>;
  if (!context) return <div className="mt-2"><p role="alert" className="text-xs text-danger">{error}</p><Button variant="secondary" className="mt-2 px-3 py-2" onClick={() => void reload()}>{t("common.retry")}</Button></div>;
  if (context.viewState === "own-claimed") return <div className="mt-2 flex flex-col items-end gap-2"><Badge tone="brand">{t("dossie.claimStatus.claimed")}</Badge><Button href="/agente">{t("dossie.manage")}</Button></div>;

  const canSubmit = context.viewState === "eligible" || context.viewState === "rejected";
  return (
    <div className="mt-2 max-w-md text-left">
      <div className="mb-2 text-right"><Badge tone={context.claimStatus === "claimed" ? "brand" : context.claimStatus === "pending" ? "warning" : "neutral"}>{t(`dossie.claimStatus.${context.claimStatus}`)}</Badge></div>
      {canSubmit && !expanded && <Button onClick={() => setExpanded(true)}>{context.viewState === "rejected" ? t("athleteClaim.resubmit") : t("dossie.claim")}</Button>}
      {canSubmit && expanded && <form className="border border-border bg-background p-4" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><div className="mb-3 flex items-center gap-2"><ShieldCheck size={17} className="text-brand" /><p className="text-sm font-extrabold uppercase">{t("athleteClaim.title")}</p></div><Input id={`athlete-proof-${fbId}`} name="documentUrl" type="url" label={t("clubs.claim.document")} placeholder="https://" maxLength={1000} required /><label className="mt-3 flex flex-col gap-1.5"><span className="text-sm font-medium text-muted">{t("clubs.claim.message")}</span><textarea name="message" minLength={20} maxLength={2000} rows={4} required className="border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" /></label><div className="mt-3 flex flex-wrap gap-2"><Button type="submit" disabled={saving}>{saving ? t("common.loading") : t("clubs.claim.submit")}</Button><Button type="button" variant="secondary" onClick={() => setExpanded(false)} disabled={saving}>{t("common.cancel")}</Button></div>{error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}</form>}
      {!canSubmit && <div className="border border-border bg-background p-3"><p className="text-sm text-muted">{t(`athleteClaim.state.${context.viewState}`)}</p>{context.ownRequest && <a href={context.ownRequest.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold text-brand"><ExternalLink size={15} />{t("clubs.claim.viewDocument")}</a>}</div>}
      {canSubmit && context.viewState === "rejected" && !expanded && <p className="mt-1 text-xs text-muted">{t("athleteClaim.rejectedHelp")}</p>}
    </div>
  );
}

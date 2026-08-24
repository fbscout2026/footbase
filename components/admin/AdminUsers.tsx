"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/I18nProvider";
import { useSession } from "@/lib/auth/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { setAccountStatus, rejectUserWithReason, type AdminUser, type UserStatus } from "@/lib/services/admin-users";
import { promoteToAdmin, type PromotionRecord } from "@/lib/services/admin-promotions";
import { UserCheck, ShieldPlus } from "lucide-react";

type Filter = UserStatus | "all";
const FILTERS: Filter[] = ["pending", "approved", "rejected", "all"];

export function AdminUsers({ users, promotionHistory }: { users: AdminUser[] | null; promotionHistory: PromotionRecord[] | null }) {
  const { t } = useT();
  const { userId } = useSession();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const [promoteTarget, setPromoteTarget] = useState<AdminUser | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState("");

  const [rejectTarget, setRejectTarget] = useState<AdminUser | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState("");

  const all = users ?? [];
  const filtered = useMemo(() => (filter === "all" ? all : all.filter((u) => u.accountStatus === filter)), [all, filter]);

  async function update(target: string, status: UserStatus) {
    setBusy(target); setError(false);
    try { await setAccountStatus(client, target, status); router.refresh(); }
    catch { setError(true); }
    finally { setBusy(null); }
  }

  async function confirmPromote() {
    if (!promoteTarget) return;
    setPromoting(true); setPromoteError("");
    try {
      await promoteToAdmin(client, promoteTarget.userId, justificativa);
      setPromoteTarget(null); setJustificativa("");
      router.refresh();
    } catch {
      setPromoteError(t("admin.users.promoteError"));
    } finally {
      setPromoting(false);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setRejecting(true); setRejectError("");
    try {
      await rejectUserWithReason(client, rejectTarget.userId, rejectReason);
      setRejectTarget(null); setRejectReason("");
      router.refresh();
    } catch {
      setRejectError(t("admin.users.rejectError"));
    } finally {
      setRejecting(false);
    }
  }

  if (users === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.users.loadError")}</p></section>;
  }

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><UserCheck size={19} className="text-brand" />{t("admin.users.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.users.desc")}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("admin.users.filterLabel")}>
        {FILTERS.map((f) => {
          const count = f === "all" ? all.length : all.filter((u) => u.accountStatus === f).length;
          return <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`min-h-9 border px-3 text-xs font-extrabold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${filter === f ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-foreground"}`}>{t(`admin.users.filter.${f}`)} ({count})</button>;
        })}
      </div>
    </section>

    {promoteTarget && (
      <section className="matchday-surface border-2 border-brand p-5">
        <h3 className="matchday-heading flex items-center gap-2 text-lg"><ShieldPlus size={18} className="text-brand" />{t("admin.users.promoteTitle")}</h3>
        <p className="mt-1 text-sm text-muted">{t("admin.users.promoteConfirm")} <strong className="text-foreground">{promoteTarget.fullName ?? promoteTarget.email ?? promoteTarget.userId}</strong></p>
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{t("admin.users.promoteJustification")}</span>
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} minLength={20} maxLength={2000} rows={3} required
            className="border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={promoting || justificativa.trim().length < 20} onClick={confirmPromote}>{promoting ? t("common.loading") : t("admin.users.promoteSubmit")}</Button>
          <Button type="button" variant="secondary" disabled={promoting} onClick={() => { setPromoteTarget(null); setJustificativa(""); setPromoteError(""); }}>{t("common.cancel")}</Button>
        </div>
        {promoteError && <p role="alert" className="mt-2 text-sm text-danger">{promoteError}</p>}
      </section>
    )}

    {rejectTarget && (
      <section className="matchday-surface border-2 border-danger p-5">
        <h3 className="matchday-heading flex items-center gap-2 text-lg text-danger">{t("admin.users.rejectTitle")}</h3>
        <p className="mt-1 text-sm text-muted">{t("admin.users.rejectConfirm")} <strong className="text-foreground">{rejectTarget.fullName ?? rejectTarget.email ?? rejectTarget.userId}</strong></p>
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{t("admin.users.rejectReason")}</span>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} minLength={20} maxLength={2000} rows={3} required
            className="border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={rejecting || rejectReason.trim().length < 20} onClick={confirmReject}
            className="min-h-9 border border-danger/40 px-3 text-xs font-extrabold uppercase text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{rejecting ? t("common.loading") : t("admin.users.rejectSubmit")}</button>
          <Button type="button" variant="secondary" disabled={rejecting} onClick={() => { setRejectTarget(null); setRejectReason(""); setRejectError(""); }}>{t("common.cancel")}</Button>
        </div>
        {rejectError && <p role="alert" className="mt-2 text-sm text-danger">{rejectError}</p>}
      </section>
    )}

    <section className="matchday-surface overflow-hidden">
      {filtered.length === 0
        ? <p className="p-8 text-center text-sm text-muted">{t("admin.users.empty")}</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">{t("admin.users.col.name")}</th>
              <th className="px-4 py-3">{t("admin.users.col.email")}</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">{t("admin.users.col.role")}</th>
              <th className="px-4 py-3">{t("admin.users.col.organization")}</th>
              <th className="px-4 py-3">{t("admin.users.col.created")}</th>
              <th className="px-4 py-3">{t("admin.users.col.status")}</th>
              <th className="px-4 py-3">{t("common.actions")}</th>
            </tr></thead>
            <tbody>{filtered.map((u) => <tr key={u.userId} className="border-b border-border/60">
              <td className="px-4 py-3 font-semibold">{u.fullName ?? "—"}</td>
              <td className="px-4 py-3">{u.email ? <a href={`mailto:${u.email}`} className="text-brand hover:underline">{u.email}</a> : "—"}</td>
              <td className="px-4 py-3">{u.whatsapp ? <a href={`https://wa.me/${u.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{u.whatsapp}</a> : "—"}</td>
              <td className="px-4 py-3"><Badge>{t(`role.${u.role}`)}</Badge></td>
              <td className="px-4 py-3">{u.organization ?? "—"}</td>
              <td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-3"><StatusBadge status={u.accountStatus} /></td>
              <td className="px-4 py-3">
                {u.userId === userId
                  ? <span className="text-xs text-muted">{t("admin.users.you")}</span>
                  : <div className="flex flex-wrap gap-2">
                      {u.accountStatus !== "approved" && <Button type="button" disabled={busy === u.userId} onClick={() => update(u.userId, "approved")}>{t("admin.users.approve")}</Button>}
                      {u.accountStatus !== "rejected" && <button type="button" disabled={busy === u.userId} onClick={() => { setRejectTarget(u); setRejectReason(""); setRejectError(""); }} className="min-h-9 border border-danger/40 px-3 text-xs font-extrabold uppercase text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{t("admin.users.reject")}</button>}
                      {u.role !== "admin" && u.accountStatus === "approved" && <button type="button" onClick={() => { setPromoteTarget(u); setJustificativa(""); setPromoteError(""); }} className="min-h-9 border border-brand/40 px-3 text-xs font-extrabold uppercase text-brand hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("admin.users.promote")}</button>}
                    </div>}
              </td>
            </tr>)}</tbody>
          </table></div>}
      {error && <p role="alert" className="border-t border-border p-4 text-sm text-danger">{t("admin.users.error")}</p>}
    </section>

    {promotionHistory !== null && (
      <section className="matchday-surface p-5">
        <h3 className="matchday-heading flex items-center gap-2 text-lg"><ShieldPlus size={17} className="text-brand" />{t("admin.users.promoteHistory")}</h3>
        {promotionHistory.length === 0
          ? <p className="mt-3 text-sm text-muted">{t("admin.users.promoteHistoryEmpty")}</p>
          : <div className="mt-3 space-y-3">{promotionHistory.map((p) => <div key={p.id} className="border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{p.userName ?? p.userId}</p>
                <span className="text-xs text-muted">{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{p.justificativa}</p>
              <p className="mt-2 text-xs text-muted">{t("admin.representation.by")} {p.promovidoPorName ?? p.promovidoPor}</p>
            </div>)}</div>}
      </section>
    )}
  </div>;
}

function StatusBadge({ status }: { status: UserStatus }) {
  const { t } = useT();
  return <Badge tone={status === "approved" ? "brand" : status === "rejected" ? "danger" : "warning"}>{t(`admin.users.status.${status}`)}</Badge>;
}

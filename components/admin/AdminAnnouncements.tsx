"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/I18nProvider";
import { useSession } from "@/lib/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, type Announcement } from "@/lib/services/admin-announcements";
import { Megaphone, Pencil, Trash2, X } from "lucide-react";

export function AdminAnnouncements({ announcements }: { announcements: Announcement[] | null }) {
  const { t } = useT();
  const session = useSession();
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function save(input: { title: string; body: string; linkUrl: string | null }) {
    setBusy("form"); setError(false);
    try {
      if (editing && editing !== "new") await updateAnnouncement(client, editing.id, input);
      else await createAnnouncement(client, { ...input, createdBy: session.userId });
      setEditing(null);
      router.refresh();
    } catch { setError(true); }
    finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy(id); setError(false);
    try { await deleteAnnouncement(client, id); router.refresh(); }
    catch { setError(true); }
    finally { setBusy(null); }
  }

  if (announcements === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.announcements.loadError")}</p></section>;
  }

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="matchday-heading flex items-center gap-2 text-xl"><Megaphone size={19} className="text-brand" />{t("admin.announcements.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("admin.announcements.desc")}</p>
        </div>
        {editing === null && <Button type="button" onClick={() => setEditing("new")}>{t("admin.announcements.new")}</Button>}
      </div>
    </section>

    {editing !== null && <AnnouncementForm initial={editing === "new" ? null : editing} busy={busy === "form"} onCancel={() => setEditing(null)} onSave={save} />}

    {announcements.length === 0
      ? <section className="matchday-surface p-8 text-center text-sm text-muted">{t("admin.announcements.empty")}</section>
      : <div className="space-y-3">{announcements.map((a) => (
          <section key={a.id} className="matchday-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-muted">{a.body}</p>
                {a.linkUrl && <Link href={a.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-brand hover:underline">{a.linkUrl}</Link>}
                <p className="mt-2 text-xs text-muted">{new Date(a.publishedAt).toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setEditing(a)} aria-label={t("common.edit")} className="flex h-9 w-9 items-center justify-center border border-border text-muted hover:border-brand hover:text-brand"><Pencil size={15} /></button>
                <button type="button" disabled={busy === a.id} onClick={() => remove(a.id)} aria-label={t("common.delete")} className="flex h-9 w-9 items-center justify-center border border-border text-muted hover:border-danger hover:text-danger disabled:opacity-60"><Trash2 size={15} /></button>
              </div>
            </div>
          </section>
        ))}</div>}

    {error && <p role="alert" className="text-sm text-danger">{t("admin.announcements.error")}</p>}
  </div>;
}

function AnnouncementForm({ initial, busy, onCancel, onSave }: {
  initial: Announcement | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { title: string; body: string; linkUrl: string | null }) => void;
}) {
  const { t } = useT();
  return <section className="matchday-surface p-5">
    <div className="flex items-center justify-between">
      <h3 className="matchday-heading text-lg">{initial ? t("admin.announcements.edit") : t("admin.announcements.new")}</h3>
      <button type="button" onClick={onCancel} aria-label={t("common.cancel")} className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground"><X size={16} /></button>
    </div>
    <form
      className="mt-4 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const title = String(fields.get("title") ?? "").trim();
        const body = String(fields.get("body") ?? "").trim();
        const linkUrl = String(fields.get("linkUrl") ?? "").trim();
        if (!title || !body) return;
        onSave({ title, body, linkUrl: linkUrl || null });
      }}
    >
      <Input id="announcement-title" name="title" label={t("admin.announcements.form.title")} defaultValue={initial?.title ?? ""} maxLength={160} disabled={busy} required />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">{t("admin.announcements.form.body")}</span>
        <textarea name="body" rows={4} maxLength={4000} defaultValue={initial?.body ?? ""} disabled={busy} required className="border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60" />
      </label>
      <Input id="announcement-link" name="linkUrl" type="url" label={t("admin.announcements.form.link")} defaultValue={initial?.linkUrl ?? ""} disabled={busy} />
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 border border-border px-4 text-sm font-bold uppercase hover:border-brand disabled:opacity-60">{t("common.cancel")}</button>
      </div>
    </form>
  </section>;
}

"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Announcement } from "@/lib/services/admin-announcements";

export function NovidadesList({ announcements }: { announcements: Announcement[] | null }) {
  const { t } = useT();

  return (
    <div className="space-y-5">
      <section className="matchday-surface p-5 sm:p-7">
        <div className="flex items-center gap-2 text-brand"><Megaphone size={18} /><span className="text-xs font-extrabold uppercase tracking-widest">{t("novidades.kicker")}</span></div>
        <h1 className="matchday-heading mt-2 text-3xl">{t("novidades.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("novidades.subtitle")}</p>
      </section>

      {announcements === null && (
        <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("novidades.loadError")}</p></section>
      )}

      {announcements !== null && announcements.length === 0 && (
        <section className="matchday-surface p-10 text-center"><p className="text-sm text-muted">{t("novidades.empty")}</p></section>
      )}

      {announcements !== null && announcements.length > 0 && (
        <div className="space-y-4">
          {announcements.map((a) => (
            <section key={a.id} className="matchday-surface p-5 sm:p-6">
              <p className="text-xs text-muted">{new Date(a.publishedAt).toLocaleDateString()}</p>
              <h2 className="matchday-heading mt-1 text-xl">{a.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{a.body}</p>
              {a.linkUrl && (
                <Link href={a.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-bold uppercase text-brand hover:underline">
                  {t("novidades.viewMore")}
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

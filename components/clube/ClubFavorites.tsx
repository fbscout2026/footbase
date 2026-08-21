"use client";

import Link from "next/link";
import type { ClubFavoriteRecord } from "@/lib/services/club-panel";
import { useT } from "@/lib/i18n/I18nProvider";
import { formatAthleteCode } from "@/lib/format";
import { Heart } from "lucide-react";

export function ClubFavorites({ favorites }: { favorites: ClubFavoriteRecord[] }) {
  const { t } = useT();
  return <section className="matchday-surface overflow-hidden"><div className="border-b border-border p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><Heart size={19} className="text-brand" />{t("clubPanel.favorites.title")}</h2><p className="mt-1 text-sm text-muted">{t("clubPanel.favorites.help")}</p></div>{favorites.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("clubPanel.favorites.empty")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3">{t("clubs.athlete")}</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">{t("clubs.position")}</th><th className="px-4 py-3">{t("clubs.category")}</th><th className="px-4 py-3">{t("clubPanel.favorites.rating")}</th><th className="px-4 py-3">{t("clubPanel.favorites.notes")}</th></tr></thead><tbody>{favorites.map((favorite) => <tr key={favorite.id} className="border-b border-border/60"><td className="px-4 py-3"><Link href={`/atletas/${favorite.bid}`} className="font-semibold hover:text-brand">{favorite.athleteName}</Link>{favorite.athleteNickname && <p className="text-xs text-muted">{favorite.athleteNickname}</p>}</td><td className="metric-value px-4 py-3">{formatAthleteCode(favorite.bid)}</td><td className="px-4 py-3">{favorite.position ?? "—"}</td><td className="px-4 py-3">{favorite.category ?? "—"}</td><td className="px-4 py-3 font-bold text-brand">{favorite.rating}</td><td className="max-w-xs px-4 py-3 text-muted">{favorite.notes ?? "—"}</td></tr>)}</tbody></table></div>}</section>;
}

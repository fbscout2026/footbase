"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClubFavoriteClubRecord, ClubFavoriteRecord, ClubFavoriteTournamentRecord } from "@/lib/services/club-panel";
import { removeClubFavorite } from "@/lib/services/club-favorites";
import { removeTournamentFavorite } from "@/lib/services/tournament-favorites";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { formatAthleteCode } from "@/lib/format";
import { Heart, Shield, Trophy, X } from "lucide-react";

export function ClubFavorites({
  favorites,
  favoriteClubs,
  favoriteTournaments,
  ownerId,
  readOnly,
}: {
  favorites: ClubFavoriteRecord[];
  favoriteClubs: ClubFavoriteClubRecord[];
  favoriteTournaments: ClubFavoriteTournamentRecord[];
  ownerId: string | null;
  readOnly: boolean;
}) {
  const { t } = useT();
  const client = useMemo(() => createClient(), []);
  const [clubs, setClubs] = useState(favoriteClubs);
  const [tournaments, setTournaments] = useState(favoriteTournaments);

  async function unfavoriteClub(clubId: string) {
    if (!ownerId || readOnly) return;
    const prev = clubs;
    setClubs(clubs.filter((c) => c.clubId !== clubId));
    try { await removeClubFavorite(client, ownerId, clubId); } catch { setClubs(prev); }
  }

  async function unfavoriteTournament(torneioId: string) {
    if (!ownerId || readOnly) return;
    const prev = tournaments;
    setTournaments(tournaments.filter((t) => t.torneioId !== torneioId));
    try { await removeTournamentFavorite(client, ownerId, torneioId); } catch { setTournaments(prev); }
  }

  return <div className="space-y-5">
    <section className="matchday-surface overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><Heart size={19} className="text-brand" />{t("clubPanel.favorites.title")}</h2><p className="mt-1 text-sm text-muted">{t("clubPanel.favorites.help")}</p></div>
      {favorites.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("clubPanel.favorites.empty")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3">{t("clubs.athlete")}</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">{t("clubs.position")}</th><th className="px-4 py-3">{t("clubs.category")}</th><th className="px-4 py-3">{t("clubPanel.favorites.rating")}</th><th className="px-4 py-3">{t("clubPanel.favorites.notes")}</th></tr></thead><tbody>{favorites.map((favorite) => <tr key={favorite.id} className="border-b border-border/60"><td className="px-4 py-3"><Link href={`/atletas/${favorite.fbId}`} className="font-semibold hover:text-brand">{favorite.athleteName}</Link>{favorite.athleteNickname && <p className="text-xs text-muted">{favorite.athleteNickname}</p>}</td><td className="metric-value px-4 py-3">{formatAthleteCode(favorite.fbId)}</td><td className="px-4 py-3">{favorite.position ?? "—"}</td><td className="px-4 py-3">{favorite.category ?? "—"}</td><td className="px-4 py-3 font-bold text-brand">{favorite.rating}</td><td className="max-w-xs px-4 py-3 text-muted">{favorite.notes ?? "—"}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="matchday-surface overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><Shield size={19} className="text-brand" />{t("clubPanel.favoriteClubs.title")}</h2><p className="mt-1 text-sm text-muted">{t("clubPanel.favoriteClubs.help")}</p></div>
      {clubs.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("clubPanel.favoriteClubs.empty")}</p> : <ul className="divide-y divide-border">{clubs.map((fav) => <li key={fav.id} className="flex items-center gap-3 px-5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background">{fav.crestUrl ? <img src={fav.crestUrl} alt="" className="max-h-7 max-w-7 object-contain" /> : <Shield size={16} className="text-muted" />}</div>
        <Link href={`/clubes/${fav.clubId}`} className="flex-1 font-semibold hover:text-brand">{fav.name}</Link>
        {!readOnly && <button type="button" onClick={() => unfavoriteClub(fav.clubId)} aria-label={t("clubPanel.favoriteClubs.remove")} className="flex h-8 w-8 items-center justify-center border border-border text-muted hover:border-danger hover:text-danger"><X size={14} /></button>}
      </li>)}</ul>}
    </section>

    <section className="matchday-surface overflow-hidden">
      <div className="border-b border-border p-5"><h2 className="matchday-heading flex items-center gap-2 text-xl"><Trophy size={19} className="text-brand" />{t("clubPanel.favoriteTournaments.title")}</h2><p className="mt-1 text-sm text-muted">{t("clubPanel.favoriteTournaments.help")}</p></div>
      {tournaments.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("clubPanel.favoriteTournaments.empty")}</p> : <ul className="divide-y divide-border">{tournaments.map((fav) => <li key={fav.id} className="flex items-center gap-3 px-5 py-3">
        <Link href={`/torneios/${fav.torneioId}`} className="flex-1 font-semibold hover:text-brand">{fav.name}{(fav.category || fav.year) && <span className="ml-2 text-xs font-normal text-muted">{[fav.category, fav.year].filter(Boolean).join(" · ")}</span>}</Link>
        {!readOnly && <button type="button" onClick={() => unfavoriteTournament(fav.torneioId)} aria-label={t("clubPanel.favoriteTournaments.remove")} className="flex h-8 w-8 items-center justify-center border border-border text-muted hover:border-danger hover:text-danger"><X size={14} /></button>}
      </li>)}</ul>}
    </section>
  </div>;
}

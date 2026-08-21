import type { SupabaseClient } from "@supabase/supabase-js";
import { computePerformanceIndex } from "@/lib/atleta-extra";
import { loadAtletasByBids, loadRecentStatsByBids, type AtletaRecord, type RecentStats } from "@/lib/services/atletas";
import type { FavoriteRecord } from "@/lib/services/favorites";
import type { RankingCandidate } from "@/lib/prancheta-ranking";
import type { TacticalPosition } from "@/lib/prancheta-formations";

// Titulares são escolhidos pelo desempenho nos últimos 5 jogos de cada
// atleta, não a temporada inteira (Session 55, pedido explícito do usuário)
// — forma atual pesa mais que um começo de temporada forte do qual o atleta
// já caiu de rendimento.
const RECENT_FORM_WINDOW = 5;

const EMPTY_RECENT_STATS: RecentStats = {
  totalMatches: 0, totalMinutes: 0, totalGoals: 0, totalAssists: 0,
  totalYellowCards: 0, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0,
};

const TACTICAL_POSITIONS = new Set<TacticalPosition>(["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"]);
function asTacticalPosition(p: string | null): TacticalPosition | null {
  return p && (TACTICAL_POSITIONS as Set<string>).has(p) ? (p as TacticalPosition) : null;
}

export interface FavoritesBoardData {
  candidates: RankingCandidate[];
  athletes: Map<number, AtletaRecord>;
}

/** A favorited athlete with no known main position (real scraped athletes,
 * unlike the old mock fixtures, usually only have one when they're a
 * goalkeeper — the only role the súmula marks) can't be placed on the board at
 * all, so it's skipped rather than guessed — same "never fabricate" rule as
 * everywhere else real data replaced the mock fixtures. Still returned in
 * `athletes` (for display, e.g. an already-saved slot referencing them) — only
 * excluded from the ranking candidate list. */
export async function loadFavoritesBoardData(client: SupabaseClient, favorites: FavoriteRecord[]): Promise<FavoritesBoardData> {
  const ratingByBid = new Map(favorites.map((f) => [f.bid, f.rating]));
  const bids = favorites.map((f) => f.bid);
  const [athleteList, recentStatsByBid] = await Promise.all([
    loadAtletasByBids(client, bids),
    loadRecentStatsByBids(client, bids, RECENT_FORM_WINDOW),
  ]);
  const athletes = new Map(athleteList.map((a) => [a.bid, a]));

  const candidates = athleteList.flatMap((athlete) => {
    const mainPosition = asTacticalPosition(athlete.mainPosition);
    if (!mainPosition) return [];
    const recent = recentStatsByBid.get(athlete.bid) ?? EMPTY_RECENT_STATS;
    const evolution = computePerformanceIndex({ mainPosition: athlete.mainPosition, stats: recent });
    return [{
      bid: athlete.bid,
      mainPosition,
      secondaryPosition: asTacticalPosition(athlete.posicaoSecundaria),
      favoriteRating: ratingByBid.get(athlete.bid) ?? 0,
      matches: recent.totalMatches,
      minutes: recent.totalMinutes,
      goals: recent.totalGoals,
      assists: recent.totalAssists,
      yellowCards: recent.totalYellowCards,
      redCards: recent.totalRedCards,
      suspensions: athlete.jogosSuspenso,
      cleanSheets: recent.totalCleanSheets,
      aboveCategory: recent.timesPlayedAboveCategory,
      evolution,
    } satisfies RankingCandidate];
  });

  return { candidates, athletes };
}

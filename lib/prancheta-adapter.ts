import type { SupabaseClient } from "@supabase/supabase-js";
import { computePerformanceIndex } from "@/lib/atleta-extra";
import { loadAtletasByBids, type AtletaRecord } from "@/lib/services/atletas";
import type { FavoriteRecord } from "@/lib/services/favorites";
import type { RankingCandidate } from "@/lib/prancheta-ranking";
import type { TacticalPosition } from "@/lib/prancheta-formations";

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
  const athleteList = await loadAtletasByBids(client, favorites.map((f) => f.bid));
  const athletes = new Map(athleteList.map((a) => [a.bid, a]));

  const candidates = athleteList.flatMap((athlete) => {
    const mainPosition = asTacticalPosition(athlete.mainPosition);
    if (!mainPosition) return [];
    const evolution = computePerformanceIndex(athlete);
    return [{
      bid: athlete.bid,
      mainPosition,
      secondaryPosition: asTacticalPosition(athlete.posicaoSecundaria),
      favoriteRating: ratingByBid.get(athlete.bid) ?? 0,
      matches: athlete.stats.totalMatches,
      minutes: athlete.stats.totalMinutes,
      goals: athlete.stats.totalGoals,
      assists: athlete.stats.totalAssists,
      yellowCards: athlete.stats.totalYellowCards,
      redCards: athlete.stats.totalRedCards,
      suspensions: athlete.jogosSuspenso,
      cleanSheets: athlete.stats.totalCleanSheets,
      aboveCategory: athlete.stats.timesPlayedAboveCategory,
      evolution,
    } satisfies RankingCandidate];
  });

  return { candidates, athletes };
}

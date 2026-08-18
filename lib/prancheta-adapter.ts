import { getEvolucao } from "@/lib/atleta-extra";
import { getAtletaByBid } from "@/lib/mock-data";
import type { FavoriteRecord } from "@/lib/services/favorites";
import type { RankingCandidate } from "@/lib/prancheta-ranking";

export function favoritesToRankingCandidates(favorites: FavoriteRecord[]): RankingCandidate[] {
  return favorites.flatMap((favorite) => {
    const athlete = getAtletaByBid(favorite.bid);
    if (!athlete) return [];
    const evolution = getEvolucao(athlete).at(-1)?.value ?? 0;
    return [{
      bid: athlete.bid,
      mainPosition: athlete.mainPosition,
      secondaryPosition: athlete.posicaoSecundaria,
      favoriteRating: favorite.rating,
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
}

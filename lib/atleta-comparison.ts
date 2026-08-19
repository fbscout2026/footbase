import type { AtletaRecord } from "@/lib/services/atletas";
import { computePerformanceIndex } from "@/lib/atleta-extra";
import { selectWinningIds, serializeComparisonBidList } from "@/lib/comparison-rules";

export type ComparisonGroup = "profile" | "performance" | "special";
export type ComparisonDirection = "higher" | "lower";
export type ComparisonFormat = "text" | "number" | "cm" | "kg" | "decimal" | "foot";

export type ComparisonMetricId =
  | "position" | "age" | "category" | "club" | "height" | "weight"
  | "foot" | "nationality" | "matches" | "minutes" | "goals" | "assists"
  | "goalContributions" | "minutesPerMatch" | "yellowCards" | "redCards"
  | "suspensions" | "aboveCategory" | "cleanSheets" | "evolution";

export interface ComparisonMetric {
  id: ComparisonMetricId;
  group: ComparisonGroup;
  format: ComparisonFormat;
  direction?: ComparisonDirection;
  value: (atleta: AtletaRecord) => string | number | null;
}

export const comparisonMetrics: ComparisonMetric[] = [
  { id: "position", group: "profile", format: "text", value: (a) => a.mainPosition },
  { id: "age", group: "profile", format: "number", value: (a) => a.age },
  { id: "category", group: "profile", format: "text", value: (a) => a.currentCategory },
  { id: "club", group: "profile", format: "text", value: (a) => a.currentClubName ?? "—" },
  { id: "height", group: "profile", format: "cm", value: (a) => a.heightCm },
  { id: "weight", group: "profile", format: "kg", value: (a) => a.weightKg },
  { id: "foot", group: "profile", format: "foot", value: (a) => a.dominantFoot },
  { id: "nationality", group: "profile", format: "text", value: (a) => a.nacionalidade },
  { id: "matches", group: "performance", format: "number", direction: "higher", value: (a) => a.stats.totalMatches },
  { id: "minutes", group: "performance", format: "number", direction: "higher", value: (a) => a.stats.totalMinutes },
  { id: "goals", group: "performance", format: "number", direction: "higher", value: (a) => a.stats.totalGoals },
  { id: "assists", group: "performance", format: "number", direction: "higher", value: (a) => a.stats.totalAssists },
  { id: "goalContributions", group: "performance", format: "number", direction: "higher", value: (a) => a.stats.totalGoals + a.stats.totalAssists },
  {
    id: "minutesPerMatch", group: "performance", format: "decimal", direction: "higher",
    value: (a) => a.stats.totalMatches > 0 ? a.stats.totalMinutes / a.stats.totalMatches : null,
  },
  { id: "yellowCards", group: "performance", format: "number", direction: "lower", value: (a) => a.stats.totalYellowCards },
  { id: "redCards", group: "performance", format: "number", direction: "lower", value: (a) => a.stats.totalRedCards },
  { id: "suspensions", group: "performance", format: "number", direction: "lower", value: (a) => a.jogosSuspenso },
  { id: "aboveCategory", group: "performance", format: "number", direction: "higher", value: (a) => a.stats.timesPlayedAboveCategory },
  {
    id: "cleanSheets", group: "special", format: "number", direction: "higher",
    value: (a) => a.mainPosition === "GK" ? a.stats.totalCleanSheets : null,
  },
  {
    id: "evolution", group: "special", format: "number", direction: "higher",
    value: (a) => computePerformanceIndex(a),
  },
];

// No longer whitelists against a preloaded athlete list (the real dataset is
// 3,000+ athletes — fetching every bid just to validate membership doesn't
// scale). Format/dedup/limit(3) still applies; a bid that doesn't actually
// exist simply returns no row when the real athletes are fetched downstream —
// the same effective result, just resolved lazily instead of eagerly.
export function parseComparisonBids(raw: string | null, limit = 3): number[] {
  if (!raw) return [];
  const unique: number[] = [];
  for (const part of raw.split(",")) {
    const bid = Number(part.trim());
    if (Number.isInteger(bid) && bid > 0 && !unique.includes(bid)) {
      unique.push(bid);
      if (unique.length === limit) break;
    }
  }
  return unique;
}

export function serializeComparisonBids(bids: number[]): string {
  return serializeComparisonBidList(bids);
}

export function getWinningBids(metric: ComparisonMetric, atletas: AtletaRecord[]): Set<number> {
  if (!metric.direction || atletas.length < 2) return new Set();

  return selectWinningIds(
    metric.direction,
    atletas.map((atleta) => {
      const value = metric.value(atleta);
      return { id: atleta.bid, value: typeof value === "number" ? value : null };
    })
  );
}

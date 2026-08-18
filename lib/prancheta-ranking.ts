import type { FormationSlot, TacticalPosition } from "./prancheta-formations";

export interface RankingCandidate {
  bid: number;
  mainPosition: TacticalPosition;
  secondaryPosition: TacticalPosition | null;
  favoriteRating: number;
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  suspensions: number;
  cleanSheets: number;
  aboveCategory: number;
  evolution: number;
}

export interface RankedCandidate {
  candidate: RankingCandidate;
  score: number;
  secondary: boolean;
}

export interface LineupSelection {
  slot: FormationSlot;
  bid: number;
  score: number;
}

function per90(value: number, minutes: number): number {
  return minutes > 0 ? (value * 90) / minutes : 0;
}

function minMax(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return max === 0 ? 0 : 1;
  return (value - min) / (max - min);
}

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function isCompatible(candidate: RankingCandidate, slot: FormationSlot): boolean {
  return slot.acceptedPositions.includes(candidate.mainPosition)
    || (candidate.secondaryPosition !== null && slot.acceptedPositions.includes(candidate.secondaryPosition));
}

function isSecondary(candidate: RankingCandidate, slot: FormationSlot): boolean {
  return !slot.acceptedPositions.includes(candidate.mainPosition)
    && candidate.secondaryPosition !== null
    && slot.acceptedPositions.includes(candidate.secondaryPosition);
}

function groupFor(position: TacticalPosition): "gk" | "def" | "mid" | "att" {
  if (position === "GK") return "gk";
  if (["CB", "LB", "RB"].includes(position)) return "def";
  if (["DM", "CM", "AM"].includes(position)) return "mid";
  return "att";
}

export function rankCandidatesForSlot(
  allCandidates: RankingCandidate[],
  slot: FormationSlot
): RankedCandidate[] {
  const eligible = allCandidates.filter((candidate) => isCompatible(candidate, slot));
  const metric = (selector: (candidate: RankingCandidate) => number) =>
    eligible.map(selector);
  const normalize = (candidate: RankingCandidate, selector: (value: RankingCandidate) => number) =>
    minMax(selector(candidate), metric(selector));
  const discipline = (candidate: RankingCandidate) =>
    candidate.yellowCards + candidate.redCards * 4 + candidate.suspensions * 2;
  const group = groupFor(slot.position);

  return eligible
    .map((candidate): RankedCandidate => {
      const evolution = normalize(candidate, (value) => value.evolution);
      const minutesPerMatch = normalize(candidate, (value) =>
        value.matches > 0 ? value.minutes / value.matches : 0
      );
      const matches = normalize(candidate, (value) => value.matches);
      const above = normalize(candidate, (value) => value.aboveCategory);
      const disciplinePenalty = normalize(candidate, discipline);
      let score: number;

      if (group === "gk") {
        const cleanSheetRate = normalize(candidate, (value) =>
          value.matches > 0 ? value.cleanSheets / value.matches : 0
        );
        score = evolution * 35 + cleanSheetRate * 35 + minutesPerMatch * 20 + above * 10
          - disciplinePenalty * 10;
      } else if (group === "def") {
        score = evolution * 40 + minutesPerMatch * 25 + matches * 15 + above * 20
          - disciplinePenalty * 15;
      } else if (group === "mid") {
        const assists90 = normalize(candidate, (value) => per90(value.assists, value.minutes));
        const contributions90 = normalize(candidate, (value) =>
          per90(value.goals + value.assists, value.minutes)
        );
        score = evolution * 35 + assists90 * 25 + contributions90 * 20
          + minutesPerMatch * 10 + above * 10 - disciplinePenalty * 12;
      } else {
        const goals90 = normalize(candidate, (value) => per90(value.goals, value.minutes));
        const contributions90 = normalize(candidate, (value) =>
          per90(value.goals + value.assists, value.minutes)
        );
        const assists90 = normalize(candidate, (value) => per90(value.assists, value.minutes));
        score = evolution * 35 + goals90 * 30 + contributions90 * 20
          + assists90 * 5 + above * 10 - disciplinePenalty * 12;
      }

      const secondary = isSecondary(candidate, slot);
      return { candidate, secondary, score: clampScore(score * (secondary ? 0.92 : 1)) };
    })
    .sort((a, b) =>
      b.score - a.score
      || b.candidate.favoriteRating - a.candidate.favoriteRating
      || b.candidate.minutes - a.candidate.minutes
      || a.candidate.bid - b.candidate.bid
    );
}

export function buildBestLineup(
  candidates: RankingCandidate[],
  slots: FormationSlot[]
): LineupSelection[] {
  const orderedByScarcity = [...slots].sort((a, b) =>
    rankCandidatesForSlot(candidates, a).length - rankCandidatesForSlot(candidates, b).length
  );
  const used = new Set<number>();
  const selections: LineupSelection[] = [];

  for (const slot of orderedByScarcity) {
    const ranked = rankCandidatesForSlot(candidates, slot);
    const winner = ranked.find((entry) => !used.has(entry.candidate.bid));
    if (!winner) continue;
    used.add(winner.candidate.bid);
    selections.push({ slot, bid: winner.candidate.bid, score: winner.score });
  }

  const order = new Map(slots.map((slot, index) => [slot.id, index]));
  return selections.sort((a, b) => (order.get(a.slot.id) ?? 0) - (order.get(b.slot.id) ?? 0));
}

export function rankBench(
  candidates: RankingCandidate[],
  starterBids: ReadonlySet<number>
): RankingCandidate[] {
  return candidates
    .filter((candidate) => !starterBids.has(candidate.bid))
    .sort((a, b) =>
      b.favoriteRating - a.favoriteRating
      || b.evolution - a.evolution
      || b.minutes - a.minutes
      || a.bid - b.bid
    );
}

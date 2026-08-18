// FOOTBASE Phase 6.x — FERJ runtime reconciliation (pure, no IO).
//
// Same purpose and shape as `reconciliation-fpf.ts`: semantic sanity checks a CORRECT
// extraction always satisfies, catching a layout change or degraded parse (either the
// PDF súmula's or the match page HTML's) BEFORE anything is written. A non-empty
// result blocks a live write; on dry-run it's surfaced as a warning.

import type { FerjParsedMatch } from "./parse-ferj-events.ts";

export function reconcileFerjParsedMatch(m: FerjParsedMatch): string[] {
  const errors: string[] = [];

  if (m.homeScore != null && m.awayScore != null) {
    const expected = m.homeScore + m.awayScore;
    const totalGoals = m.appearances.reduce((n, a) => n + a.goals, 0) + (m.ownGoals ?? 0);
    if (totalGoals !== expected) {
      errors.push(`goals recorded on players (${totalGoals}) do not match the final score (${expected})`);
    }
  }

  if (m.appearances.length === 0) {
    errors.push("no appearances parsed — roster/event sections likely not recognized");
  } else if (m.appearances.length > 44) {
    errors.push(`implausible appearance count (${m.appearances.length}) — likely a parse error`);
  }

  const totalAssists = m.appearances.reduce((n, a) => n + a.assists, 0);
  if (totalAssists > 0) {
    errors.push(`unexpected assists total (${totalAssists}) — assists are not in either source`);
  }

  if (m.appearances.some((a) => !a.bira)) {
    errors.push("an appearance is missing its bira — likely a parse error");
  }

  return errors;
}

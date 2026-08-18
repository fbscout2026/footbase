// FOOTBASE Phase 6.5 — runtime reconciliation (pure, no IO).
//
// Semantic sanity checks that a CORRECT extraction always satisfies. `validate.ts`
// checks structure/ranges (mirrors DB constraints); reconciliation checks that the
// numbers make SENSE together — the guard that catches a layout change or a degraded
// parse BEFORE anything is written. On a live run a non-empty result blocks the write
// (the job is marked failed and retried); on a dry-run it is surfaced as a warning.
//
// Kept source-agnostic (operates on `ParsedMatch`), so it protects every adapter.

import type { ParsedMatch } from "./types.ts";

export function reconcileParsedMatch(m: ParsedMatch): string[] {
  const errors: string[] = [];

  // Goals recorded on players (+ own goals, which are deliberately never credited to
  // any player's personal tally) must add up to the final score. A mismatch is the
  // classic symptom of a shifted column / changed layout.
  if (m.homeScore != null && m.awayScore != null) {
    const expected = m.homeScore + m.awayScore;
    const totalGoals = m.appearances.reduce((n, a) => n + a.goals, 0) + (m.ownGoals ?? 0);
    if (totalGoals !== expected) {
      errors.push(`goals recorded on players (${totalGoals}) do not match the final score (${expected})`);
    }
  }

  // A real match has players; an empty or absurd roster means the parse degraded.
  if (m.appearances.length === 0) {
    errors.push("no appearances parsed — roster section likely not recognized");
  } else if (m.appearances.length > 44) {
    errors.push(`implausible appearance count (${m.appearances.length}) — likely a parse error`);
  }

  // Assists are not present in CBF súmulas; a non-zero assist total signals a
  // misaligned column bleeding into the assists field.
  const totalAssists = m.appearances.reduce((n, a) => n + a.assists, 0);
  if (totalAssists > 0) {
    errors.push(`unexpected assists total (${totalAssists}) — assists are not in the súmula`);
  }

  return errors;
}

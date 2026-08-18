// FOOTBASE Phase 6.x — FPF runtime reconciliation (pure, no IO).
//
// Same purpose and shape as `reconciliation.ts` (CBF): semantic sanity checks that a
// CORRECT extraction always satisfies, catching a layout change or degraded parse
// BEFORE anything is written. A non-empty result blocks a live write (job marked
// failed/retried); on dry-run it's surfaced as a warning. Kept as a separate module
// (not a generic function over both shapes) because `FpfParsedMatch` is intentionally
// not `ParsedMatch` — FPF identifies players by "Registro", not a CBF bid (see
// `parse-fpf-sumula.ts`), so the two source shapes never get accidentally conflated.
//
// One check CBF's reconciliation has that this one deliberately omits: clean_sheet
// sanity. The FPF súmula has no goalkeeper marker, so `parse-fpf-events.ts` always
// emits `cleanSheet: false` — that's an accepted, documented limitation of the source,
// not a parse failure, so reconciliation must never flag it.

import type { FpfParsedMatch } from "./parse-fpf-sumula.ts";

export function reconcileFpfParsedMatch(m: FpfParsedMatch): string[] {
  const errors: string[] = [];

  // Goals recorded on players (+ own goals, never credited to any player's personal
  // tally) must add up to the final score. A mismatch is the classic symptom of a
  // shifted column / changed layout.
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

  // Assists are not present in FPF súmulas either; a non-zero total signals a
  // misaligned column bleeding into the assists field.
  const totalAssists = m.appearances.reduce((n, a) => n + a.assists, 0);
  if (totalAssists > 0) {
    errors.push(`unexpected assists total (${totalAssists}) — assists are not in the súmula`);
  }

  // Every appearance must resolve to a real "Registro" — an empty one means the roster
  // regex matched a row it shouldn't have (e.g. bled into the wrong section).
  if (m.appearances.some((a) => !a.registro)) {
    errors.push("an appearance is missing its registro — likely a parse error");
  }

  return errors;
}

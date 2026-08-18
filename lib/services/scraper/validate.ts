import type { ParsedMatch } from "./types.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Pure structural/range validation of a ParsedMatch, mirroring the DB constraints
// on partidas_sumula / atuacoes_sumula. Returns a list of human-readable errors
// (empty = valid). No DB access — safe to unit test and to run inside dry-run.
export function validateParsedMatch(m: ParsedMatch): string[] {
  const errors: string[] = [];
  const t = m.tournament;
  if (!t || !t.name?.trim()) errors.push("tournament.name is required");
  if (!t?.federation?.trim()) errors.push("tournament.federation is required");
  if (!t?.category?.trim()) errors.push("tournament.category is required");
  if (!Number.isInteger(t?.year) || t.year < 1900 || t.year > 2100) errors.push("tournament.year is invalid");

  if (!ISO_DATE.test(m.matchDate ?? "")) errors.push("matchDate must be an ISO date (YYYY-MM-DD)");
  if (!m.matchCategory?.trim()) errors.push("matchCategory is required");

  for (const side of ["home", "away"] as const) {
    const c = m[side];
    if (!c?.sourceKey?.trim()) errors.push(`${side}.sourceKey is required`);
    if (!c?.name?.trim()) errors.push(`${side}.name is required`);
  }
  if (m.home?.sourceKey && m.home.sourceKey === m.away?.sourceKey) errors.push("home and away clubs must differ");

  for (const side of ["homeScore", "awayScore"] as const) {
    const s = m[side];
    if (s != null && (!Number.isInteger(s) || s < 0)) errors.push(`${side} must be a non-negative integer`);
  }

  const seenBids = new Set<number>();
  m.appearances.forEach((a, i) => {
    const at = `appearances[${i}]`;
    if (!Number.isInteger(a.bid) || a.bid <= 0) errors.push(`${at}.bid is invalid`);
    else if (seenBids.has(a.bid)) errors.push(`${at}.bid ${a.bid} is duplicated in this match`);
    else seenBids.add(a.bid);
    if (!a.playerCategory?.trim()) errors.push(`${at}.playerCategory is required`);
    if (!Number.isInteger(a.minutesPlayed) || a.minutesPlayed < 0 || a.minutesPlayed > 130) errors.push(`${at}.minutesPlayed must be 0..130`);
    if (!Number.isInteger(a.goals) || a.goals < 0) errors.push(`${at}.goals must be >= 0`);
    if (!Number.isInteger(a.assists) || a.assists < 0) errors.push(`${at}.assists must be >= 0`);
    if (![0, 1, 2].includes(a.yellowCards)) errors.push(`${at}.yellowCards must be 0, 1 or 2`);
    if (![0, 1].includes(a.redCards)) errors.push(`${at}.redCards must be 0 or 1`);
    if (typeof a.cleanSheet !== "boolean") errors.push(`${at}.cleanSheet must be boolean`);
  });

  return errors;
}

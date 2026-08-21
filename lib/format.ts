// Lightweight, locale-agnostic date formatters for ISO "YYYY-MM-DD" strings.
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Session 55: user-facing display for `atletas.bid`. The underlying value is
// unchanged (still the same bigint — CBF's real 6-digit id for most athletes today,
// or a provisional id for anyone resolved without one, see
// lib/services/scraper/provisional-athlete.ts) — this only changes what a person
// SEES. "BID" is CBF-specific jargon (Boletim de Identificação do jogador) that
// makes no sense to an athlete/club outside Brazil's own federation system; a
// neutral "FB-" prefixed code reads as a real platform identity everywhere,
// without implying anything about which federation or country an athlete is from.
export function formatAthleteCode(bid: number): string {
  return `FB-${bid}`;
}

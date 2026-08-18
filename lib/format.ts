// Lightweight, locale-agnostic date formatters for ISO "YYYY-MM-DD" strings.
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

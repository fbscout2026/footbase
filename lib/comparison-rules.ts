export type NumericDirection = "higher" | "lower";

export function parseComparisonBidList(
  raw: string | null,
  availableBids: ReadonlySet<number>,
  limit = 3
): number[] {
  if (!raw) return [];
  const unique: number[] = [];

  for (const part of raw.split(",")) {
    const bid = Number(part.trim());
    if (Number.isInteger(bid) && availableBids.has(bid) && !unique.includes(bid)) {
      unique.push(bid);
      if (unique.length === limit) break;
    }
  }

  return unique;
}

export function serializeComparisonBidList(bids: number[], limit = 3): string {
  return bids.slice(0, limit).join(",");
}

export function selectWinningIds(
  direction: NumericDirection,
  entries: Array<{ id: number; value: number | null }>
): Set<number> {
  const numeric = entries.filter(
    (entry): entry is { id: number; value: number } => typeof entry.value === "number"
  );

  if (numeric.length === 0) return new Set();
  const values = numeric.map((entry) => entry.value);
  const best = direction === "higher" ? Math.max(...values) : Math.min(...values);
  return new Set(numeric.filter((entry) => entry.value === best).map((entry) => entry.id));
}

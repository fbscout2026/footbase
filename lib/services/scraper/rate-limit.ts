// FOOTBASE Phase 6.x — rate limiting for the live executor (pure timing, no IO).
//
// CLAUDE.md's operational design: "rate-limit ~1-2 req/s + retry/backoff" per source,
// so the scraper never hammers a federation's server (avoids triggering a stricter
// bot-detection response, and is simply the polite way to run unattended automation).
// This module is the one place that decides how long to wait between items — every
// discovery/download loop in the executor MUST route through `forEachRateLimited`
// instead of its own ad-hoc delay, so the pacing policy stays in one auditable place.

/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RateLimitOptions {
  /** Minimum delay between items, in ms. Default 700ms ≈ under 1.5 req/s. */
  minDelayMs?: number;
  /** Extra random delay added on top of minDelayMs, in ms (jitter avoids a robotic,
   * perfectly periodic request pattern). Default 300ms. */
  jitterMs?: number;
}

/**
 * Runs `fn` over `items` SEQUENTIALLY (never in parallel — parallel requests to the
 * same source defeat the point of rate limiting), waiting `minDelayMs..minDelayMs+
 * jitterMs` between each call. A single item's failure is caught and reported via its
 * result entry rather than aborting the whole run — one bad súmula must never stop
 * the rest of the batch (same "isolate failures" principle as `scraping_jobs`).
 */
export async function forEachRateLimited<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: RateLimitOptions = {},
): Promise<{ item: T; result: R | null; error: string | null }[]> {
  const minDelayMs = opts.minDelayMs ?? 700;
  const jitterMs = opts.jitterMs ?? 300;
  const out: { item: T; result: R | null; error: string | null }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    try {
      const result = await fn(item, i);
      out.push({ item, result, error: null });
    } catch (e) {
      out.push({ item, result: null, error: e instanceof Error ? e.message : String(e) });
    }
    if (i < items.length - 1) {
      await sleep(minDelayMs + Math.random() * jitterMs);
    }
  }
  return out;
}

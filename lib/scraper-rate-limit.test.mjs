import { test } from "node:test";
import assert from "node:assert/strict";
import { forEachRateLimited, sleep } from "./services/scraper/rate-limit.ts";

test("runs items sequentially, never in parallel", async () => {
  const running = { count: 0, maxConcurrent: 0 };
  const items = [1, 2, 3];
  await forEachRateLimited(
    items,
    async (item) => {
      running.count++;
      running.maxConcurrent = Math.max(running.maxConcurrent, running.count);
      await sleep(5);
      running.count--;
      return item * 2;
    },
    { minDelayMs: 1, jitterMs: 0 },
  );
  assert.equal(running.maxConcurrent, 1);
});

test("preserves item order and maps results correctly", async () => {
  const results = await forEachRateLimited([1, 2, 3], async (n) => n * 10, { minDelayMs: 1, jitterMs: 0 });
  assert.deepEqual(results.map((r) => r.result), [10, 20, 30]);
  assert.ok(results.every((r) => r.error === null));
});

test("one item's failure is isolated — the rest of the batch still runs", async () => {
  const results = await forEachRateLimited(
    [1, 2, 3],
    async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    },
    { minDelayMs: 1, jitterMs: 0 },
  );
  assert.equal(results[0].result, 1);
  assert.equal(results[0].error, null);
  assert.equal(results[1].result, null);
  assert.equal(results[1].error, "boom");
  assert.equal(results[2].result, 3); // never aborted by item 2's failure
});

test("waits at least minDelayMs between items", async () => {
  const timestamps = [];
  await forEachRateLimited(
    [1, 2, 3],
    async (n) => {
      timestamps.push(Date.now());
      return n;
    },
    { minDelayMs: 30, jitterMs: 0 },
  );
  assert.ok(timestamps[1] - timestamps[0] >= 28); // small tolerance for timer slop
  assert.ok(timestamps[2] - timestamps[1] >= 28);
});

test("does not wait after the last item (no trailing delay)", async () => {
  const start = Date.now();
  await forEachRateLimited([1], async (n) => n, { minDelayMs: 500, jitterMs: 0 });
  assert.ok(Date.now() - start < 200);
});

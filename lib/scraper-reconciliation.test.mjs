import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfSumula } from "./services/scraper/parse-cbf-sumula.ts";
import { reconcileParsedMatch } from "./services/scraper/reconciliation.ts";

const fixture = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/sumula-5642183.txt", import.meta.url)),
  "utf8",
);
const { match } = parseCbfSumula(fixture);

test("a correctly parsed match reconciles cleanly", () => {
  assert.deepEqual(reconcileParsedMatch(match), []);
});

test("flags goals that do not add up to the final score", () => {
  const broken = { ...match, homeScore: 5, awayScore: 4 }; // real total is 4
  const errs = reconcileParsedMatch(broken);
  assert.ok(errs.some((e) => e.includes("do not match the final score")));
});

test("flags an empty roster (degraded parse)", () => {
  const broken = { ...match, appearances: [], homeScore: 0, awayScore: 0 };
  assert.ok(reconcileParsedMatch(broken).some((e) => e.includes("no appearances")));
});

test("flags unexpected assists (misaligned column)", () => {
  const bumped = match.appearances.map((a, i) => (i === 0 ? { ...a, assists: 1 } : a));
  const broken = { ...match, appearances: bumped };
  assert.ok(reconcileParsedMatch(broken).some((e) => e.includes("assists")));
});

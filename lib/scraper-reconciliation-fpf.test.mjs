import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFpfSumula } from "./services/scraper/parse-fpf-sumula.ts";
import { reconcileFpfParsedMatch } from "./services/scraper/reconciliation-fpf.ts";

const fixture = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fpf-sumula-534-2026.txt", import.meta.url)),
  "utf8",
);
const { match } = parseFpfSumula(fixture, { sourceUrl: "https://conteudo.fpf.org.br/sumulas/2026/1833/534.pdf" });

test("a correctly parsed FPF match reconciles cleanly", () => {
  assert.deepEqual(reconcileFpfParsedMatch(match), []);
});

test("flags goals that do not add up to the final score", () => {
  const broken = { ...match, homeScore: 9, awayScore: 9 }; // real total is 3
  const errs = reconcileFpfParsedMatch(broken);
  assert.ok(errs.some((e) => e.includes("do not match the final score")));
});

test("flags an empty roster (degraded parse)", () => {
  const broken = { ...match, appearances: [], homeScore: 0, awayScore: 0 };
  assert.ok(reconcileFpfParsedMatch(broken).some((e) => e.includes("no appearances")));
});

test("flags unexpected assists (misaligned column)", () => {
  const bumped = match.appearances.map((a, i) => (i === 0 ? { ...a, assists: 1 } : a));
  const broken = { ...match, appearances: bumped };
  assert.ok(reconcileFpfParsedMatch(broken).some((e) => e.includes("assists")));
});

test("flags an appearance missing its registro", () => {
  const bumped = match.appearances.map((a, i) => (i === 0 ? { ...a, registro: "" } : a));
  const broken = { ...match, appearances: bumped };
  assert.ok(reconcileFpfParsedMatch(broken).some((e) => e.includes("registro")));
});

test("never flags clean_sheet=false — it's an accepted source limitation, not a parse failure", () => {
  assert.ok(match.appearances.every((a) => a.cleanSheet === false));
  assert.deepEqual(reconcileFpfParsedMatch(match), []);
});

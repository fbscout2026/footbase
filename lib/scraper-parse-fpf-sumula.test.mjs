import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFpfSumula } from "./services/scraper/parse-fpf-sumula.ts";

const text = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fpf-sumula-534-2026.txt", import.meta.url)),
  "utf8",
);
const sumula = parseFpfSumula(text, { sourceUrl: "https://conteudo.fpf.org.br/sumulas/2026/1833/534.pdf" });

test("parses the match header and tournament (SUB-17, no dash in the source)", () => {
  assert.deepEqual(sumula.match.tournament, { name: "Paulista - SUB17", federation: "FPF", year: 2026, category: "SUB-17" });
  assert.equal(sumula.match.matchCategory, "SUB-17");
  assert.equal(sumula.match.matchDate, "2026-08-08");
  assert.equal(sumula.match.rodada, "14");
  assert.equal(sumula.match.sourceUrl, "https://conteudo.fpf.org.br/sumulas/2026/1833/534.pdf");
});

test("parses both team names with a provisional source key (no discovery injected in this test)", () => {
  assert.deepEqual(sumula.match.home, { name: "Olímpia", sourceKey: "fpf-club:olimpia" });
  assert.deepEqual(sumula.match.away, { name: "Votuporanguense", sourceKey: "fpf-club:votuporanguense" });
});

test("uses the real injected source keys when the discovery layer supplies them", () => {
  const withKeys = parseFpfSumula(text, { homeSourceKey: "fpf:3309", awaySourceKey: "fpf:9500" });
  assert.equal(withKeys.match.home.sourceKey, "fpf:3309");
  assert.equal(withKeys.match.away.sourceKey, "fpf:9500");
});

test("derives the final score from 'Resultado do 2º Tempo' (cumulative, not just 2nd-half)", () => {
  assert.equal(sumula.match.homeScore, 3);
  assert.equal(sumula.match.awayScore, 0);
});

test("splits the alternating two-column roster into 11 starters per side", () => {
  assert.equal(sumula.roster.home.length, 20);
  assert.equal(sumula.roster.away.length, 20);
  assert.equal(sumula.roster.home.filter((p) => p.starter).length, 11);
  assert.equal(sumula.roster.away.filter((p) => p.starter).length, 11);
});

test("parses shirt, name and federative registro per player (no CBF bid in this source)", () => {
  const first = sumula.roster.home[0];
  assert.equal(first.shirt, 12);
  assert.equal(first.registro, "656616/26");
  assert.match(first.name, /^Gabriel Marques/);
});

test("athletes list carries registro + name for every roster player", () => {
  assert.equal(sumula.match.athletes.length, 40);
  assert.ok(sumula.match.athletes.every((a) => a.registro && a.name));
});

test("goals reconcile with the final score", () => {
  const total = sumula.match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(total, 3);
});

test("yellow/red cards match the 'Advertências'/'Expulsões' sections", () => {
  const yellow = sumula.match.appearances.reduce((sum, a) => sum + a.yellowCards, 0);
  const red = sumula.match.appearances.reduce((sum, a) => sum + a.redCards, 0);
  assert.equal(yellow, 4);
  assert.equal(red, 0); // "NÃO HOUVE EXPULSÕES"
});

test("captures the real 'Motivo:' reason text for each card (Session 55)", () => {
  const miguel = sumula.match.appearances.find((a) => a.registro === "657816/26");
  assert.deepEqual(miguel.yellowCardReasons, ["Por tirar a camisa após a marcação do gol."]);
  assert.equal(miguel.redCardReasons, undefined);
});

test("minutes are absolute match-time (not half-relative like the CBF súmula) and never exceed a sane cap", () => {
  for (const a of sumula.match.appearances) {
    assert.ok(a.minutesPlayed >= 0 && a.minutesPlayed <= 130, `minutesPlayed out of range: ${a.minutesPlayed}`);
  }
  // Shirt 12 home (Gabriel Marques) came off at match-minute 69 ("69:00" "2T") as a starter.
  const gabriel = sumula.match.appearances.find((a) => a.registro === "656616/26");
  assert.equal(gabriel.minutesPlayed, 69);
});

test("clean_sheet is always false — this súmula has no goalkeeper marker to compute it safely", () => {
  assert.ok(sumula.match.appearances.every((a) => a.cleanSheet === false));
});

test("reserves who never entered the match get no atuação", () => {
  const reserveShirts = sumula.roster.home.filter((p) => !p.starter).map((p) => p.registro);
  // Shirt 22 (Pedro de Oliveira Maria, away reserve) never appears in Substituições.
  const neverPlayed = sumula.roster.away.find((p) => p.shirt === 22);
  assert.ok(neverPlayed);
  assert.ok(!sumula.match.appearances.some((a) => a.registro === neverPlayed.registro));
});

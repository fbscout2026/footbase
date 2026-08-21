import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFmfSumula } from "./services/scraper/parse-fmf-sumula.ts";

const text = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fmf-sumula-44868.txt", import.meta.url)),
  "utf8",
);

const sourceUrl = "https://sge.fmf.com.br/sumulas/Sumula_Jogo_44868_F10.pdf";
const { match, roster, isWalkover } = parseFmfSumula(text, { sourceUrl });

const glitchText = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fmf-sumula-45091-bidless-glitch.txt", import.meta.url)),
  "utf8",
);
const glitch = parseFmfSumula(glitchText, { sourceUrl: "https://sge.fmf.com.br/sumulas/Sumula_Jogo_45091_F10.pdf" });

test("parses the header: competição, category, year, rodada", () => {
  assert.equal(match.tournament.name, "SUB 15 - 1ª DIVISÃO");
  assert.equal(match.tournament.federation, "FMF");
  assert.equal(match.tournament.year, 2026);
  assert.equal(match.matchCategory, "SUB-15");
  assert.equal(match.rodada, "14");
  assert.equal(match.matchDate, "2026-08-15");
});

test("derives team names and final score from the 'Resultado do Jogo' confirmation line, not the half-time line", () => {
  assert.equal(match.home.name, "CONTAGEM ESPORTE CLUBE");
  assert.equal(match.away.name, "ASSOCIACAO DESPORTIVA INTERNACIONAL DE MINAS");
  assert.equal(match.homeScore, 1);
  assert.equal(match.awayScore, 6);
  assert.equal(match.sourceUrl, sourceUrl);
});

test("splits the roster into grouped blocks (titulares/titulares/substitutos/substitutos), not alternating rows", () => {
  assert.equal(roster.home.length, 19); // 11 titulares + 8 reservas
  assert.equal(roster.away.length, 18); // 11 titulares + 7 reservas
  assert.equal(roster.home.filter((p) => p.starter).length, 11);
  assert.equal(roster.away.filter((p) => p.starter).length, 11);
});

test("resolves the real CBF bid straight from the roster's 'CBF' column — no crosswalk needed", () => {
  const miguel = roster.home.find((p) => p.shirt === 1);
  assert.equal(miguel.bid, 927300);
  assert.ok(match.athletes.some((a) => a.bid === 927300));
});

test("recovers the full name when the apelido is a real prefix of the glued blob", () => {
  const miguel = match.athletes.find((a) => a.bid === 927300);
  assert.equal(miguel.name, "Miguel Feliciano Pongelupe");
});

test("keeps the raw glued string when the apelido is not a literal prefix (e.g. mid-name nickname)", () => {
  const tiago = match.athletes.find((a) => a.bid === 927276);
  assert.equal(tiago.name, "PortugalTiago Portugal Moraes");
});

test("marks the captain without corrupting the name/bid split", () => {
  const davi = roster.home.find((p) => p.shirt === 5);
  assert.equal(davi.captain, true);
  assert.equal(davi.bid, 926283);
  const athleteDavi = match.athletes.find((a) => a.bid === 926283);
  assert.equal(athleteDavi.name, "Davi Henrique Antunes Derze");
});

test("a roster row with no trailing bid is excluded from athletes/appearances without swallowing the next player", () => {
  const adrian = roster.home.find((p) => p.shirt === 18 && p.gluedName.startsWith("Adrian"));
  assert.ok(adrian);
  assert.equal(adrian.bid, null);
  assert.ok(!match.athletes.some((a) => a.name === "Adrian Leonardo Moreira Oliveira"));
  // The player after Adrian in the same block (shirt 25) must still parse correctly.
  const luizMiguel = roster.home.find((p) => p.shirt === 25);
  assert.equal(luizMiguel.bid, 960767);
});

test("goals (personal, excluding own goals) reconcile with the final score", () => {
  const personalGoals = match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(match.ownGoals, 0);
  assert.equal(personalGoals + match.ownGoals, match.homeScore + match.awayScore);
});

test("yellow/red cards match the 'Cartões' sections", () => {
  const yellow = match.appearances.reduce((sum, a) => sum + a.yellowCards, 0);
  const red = match.appearances.reduce((sum, a) => sum + a.redCards, 0);
  assert.equal(yellow, 2);
  assert.equal(red, 0);
});

test("captures the card reason (Session 55) — FMF's bare '- reason;' line, not CBF's 'Motivo:' label", () => {
  const julio = match.appearances.find((a) => a.bid === 928451);
  assert.deepEqual(julio.yellowCardReasons, ["desrespeito ao jogo"]);
  assert.equal(julio.redCardReasons, undefined);
});

test("substitution timing uses the glued time+period token ('13:002T') and the bare ANT/INT/TER markers", () => {
  // Substituted in at half-time (INT) — enters at minute 45, plays to full time.
  const luizMiguelSub = match.appearances.find((a) => a.bid === 960767);
  assert.equal(luizMiguelSub.minutesPlayed, 45);
  // Substituted in at 2T 13:00 = minute 58, plays to full time (90) → 32 minutes.
  const gabrielLucas = match.appearances.find((a) => a.bid === 966144);
  assert.equal(gabrielLucas.minutesPlayed, 32);
});

test("reserves who never entered the match get no atuação", () => {
  assert.equal(match.appearances.length, 34);
  assert.ok(match.appearances.length < roster.home.length + roster.away.length - 1); // -1 for the bid-less reserve
});

test("assists are always 0 — not present in the FMF súmula", () => {
  assert.ok(match.appearances.every((a) => a.assists === 0));
});

// Regression, real fixture (Sumula_Jogo_45091, found live in dry-run — Session 54,
// continuation): a player with no CBF bid at all has a stray 2-line placeholder in
// that column's place ("845.86" then a lone "9") instead of a name+bid. Before the
// fix, this desynced the shirt/name pairing and silently dropped the NEXT player
// (a real, bid-having scorer) from the roster entirely.
test("a bid-less player's placeholder lines don't desync the pairing and swallow the next real player", () => {
  const home = glitch.roster.home;
  const daviLucas = home.find((p) => p.shirt === 6);
  assert.ok(daviLucas);
  assert.equal(daviLucas.bid, null); // genuinely no CBF bid in the source
  const renato = home.find((p) => p.shirt === 7);
  assert.ok(renato, "shirt 7 (Renato) must not have been swallowed by the glitch lines");
  assert.equal(renato.bid, 837274);
});

test("a goal scored by a real, resolvable player after a bid-less teammate is still counted", () => {
  const renato = glitch.match.appearances.find((a) => a.bid === 837274);
  assert.ok(renato);
  assert.equal(renato.goals, 1);
});

test("goals reconcile once bid-less players' undercount is accounted for (allowPartialAppearances)", () => {
  const personalGoals = glitch.match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(personalGoals + glitch.match.ownGoals, glitch.match.homeScore + glitch.match.awayScore);
});

// Regression, real fixture (Sumula_Jogo_44762, found live in dry-run — Session 54,
// continuation): a walkover ("W.O.") match has an official administrative score but
// no real gameplay — the "Gols" section is legitimately empty. `parseFmfSumula` must
// flag this so the caller can relax goal reconciliation instead of treating a
// correctly-empty goals section as a degraded parse.
test("a walkover match is flagged, keeps its official score, and has an empty roster of events", () => {
  const wo = parseFmfSumula(
    readFileSync(fileURLToPath(new URL("./services/scraper/__fixtures__/fmf-sumula-44762-walkover.txt", import.meta.url)), "utf8"),
    { sourceUrl: "https://sge.fmf.com.br/sumulas/Retificadas/Sumula_Jogo_44762_F10_1.pdf" },
  );
  assert.equal(wo.isWalkover, true);
  assert.equal(wo.match.homeScore, 0);
  assert.equal(wo.match.awayScore, 3);
  assert.equal(wo.match.appearances.length, 0);
  assert.equal(wo.match.ownGoals, 0);
});

test("a normal (non-walkover) match is never flagged", () => {
  assert.equal(isWalkover, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfSumula } from "./services/scraper/parse-cbf-sumula.ts";
import { validateParsedMatch } from "./services/scraper/validate.ts";

const fixture = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/sumula-5642183.txt", import.meta.url)),
  "utf8",
);

const { match, roster } = parseCbfSumula(fixture, {
  sourceUrl: "https://conteudo.cbf.com.br/sumulas/2026/5642183se.pdf",
});

test("parses the match header and tournament", () => {
  assert.deepEqual(match.tournament, {
    name: "Campeonato Brasileiro - Sub-20",
    federation: "CBF",
    year: 2026,
    category: "SUB-20",
  });
  assert.equal(match.matchDate, "2026-07-01");
  assert.equal(match.matchCategory, "SUB-20");
  assert.equal(match.rodada, "19");
  assert.equal(match.sourceUrl, "https://conteudo.cbf.com.br/sumulas/2026/5642183se.pdf");
});

test("parses both clubs with UF and provisional source keys", () => {
  assert.equal(match.home.name, "Flamengo");
  assert.equal(match.home.state, "RJ");
  assert.equal(match.home.sourceKey, "cbf-club:flamengo-rj");
  assert.equal(match.away.name, "Avaí");
  assert.equal(match.away.state, "SC");
  assert.equal(match.away.sourceKey, "cbf-club:avai-sc");
});

test("parses the final score", () => {
  assert.equal(match.homeScore, 2);
  assert.equal(match.awayScore, 2);
});

test("parses the full roster keyed by 6-digit CBF id", () => {
  assert.equal(roster.home.length, 23);
  assert.equal(roster.away.length, 19);
  assert.equal(match.athletes.length, 42);
  // Every BID is a 6-digit number and unique across the match.
  const bids = match.athletes.map((a) => a.bid);
  assert.ok(bids.every((b) => b >= 100000 && b <= 999999));
  assert.equal(new Set(bids).size, bids.length);
});

test("builds appearances only for players who actually played (6.3)", () => {
  // 22 starters (11+11) + 12 substitutes who came on = 34 played.
  assert.equal(match.appearances.length, 34);
  const bids = match.appearances.map((a) => a.bid);
  assert.equal(new Set(bids).size, bids.length);
  // Reserve GKs never entered → no atuação.
  assert.ok(!bids.includes(796959));
  assert.ok(!bids.includes(645155));
});

const ap = (bid) => match.appearances.find((a) => a.bid === bid);

test("goals reconcile with the final score", () => {
  const homeBids = new Set(roster.home.map((p) => p.bid));
  let homeGoals = 0;
  let awayGoals = 0;
  for (const a of match.appearances) {
    if (homeBids.has(a.bid)) homeGoals += a.goals;
    else awayGoals += a.goals;
  }
  assert.equal(homeGoals, match.homeScore);
  assert.equal(awayGoals, match.awayScore);
  // Named scorers: Pablo Lúcio (Flamengo #8) and Kevin (Avaí #11).
  assert.equal(ap(675359).goals, 1); // Pablo Lucio
  assert.equal(ap(763958).goals, 1); // Kevin da Silva Soares
});

test("counts yellow cards and no red cards", () => {
  const yellows = match.appearances.reduce((n, a) => n + a.yellowCards, 0);
  const reds = match.appearances.reduce((n, a) => n + a.redCards, 0);
  assert.equal(yellows, 6);
  assert.equal(reds, 0);
  assert.equal(ap(646443).yellowCards, 1); // Kaio Nobrega Siqueira
});

test("captures the real 'Motivo:' reason text for each card (Session 55)", () => {
  // Word-wrapped across two lines in the real PDF text — collapsed into one clean string.
  assert.deepEqual(ap(646443).yellowCardReasons, [
    "A1.13. Dar uma entrada contra um adversário de maneira temerária na disputa da bola - Dar uma entrada temerária na disputa de bola",
  ]);
  assert.equal(ap(646443).redCardReasons, undefined);
});

test("reconstructs minutes from the substitution timeline", () => {
  // João Pedro (Flamengo #3) started and was subbed off at 12' of the 2nd half.
  assert.equal(ap(622355).minutesPlayed, 57);
  // Diego Queiroz (Flamengo #14) came on at 12' of the 2nd half.
  assert.equal(ap(695065).minutesPlayed, 33);
  // Kevin (Avaí #11) started and left at 27' of the 2nd half.
  assert.equal(ap(763958).minutesPlayed, 72);
  // A starter never subbed plays the full match.
  assert.equal(ap(946547).minutesPlayed, 90); // SAYAGO
});

test("clean sheet is false for keepers who conceded", () => {
  // Both teams scored twice, so neither starting keeper kept a clean sheet.
  assert.equal(ap(718455).cleanSheet, false); // Flamengo GK
  assert.equal(ap(745634).cleanSheet, false); // Avaí GK
  // Field players are never credited a clean sheet.
  assert.equal(ap(946547).cleanSheet, false);
});

test("flags goalkeepers and starter/reserve status", () => {
  const gkStarter = roster.home.find((p) => p.bid === 718455);
  assert.ok(gkStarter);
  assert.equal(gkStarter.shirt, 1);
  assert.equal(gkStarter.isGoalkeeper, true);
  assert.equal(gkStarter.starter, true);
  assert.ok(gkStarter.displayName.includes("Werneck"));

  const gkReserve = roster.home.find((p) => p.bid === 796959);
  assert.ok(gkReserve);
  assert.equal(gkReserve.isGoalkeeper, true);
  assert.equal(gkReserve.starter, false);

  const fieldStarter = roster.home.find((p) => p.bid === 946547); // SAYAGO, shirt 11
  assert.equal(fieldStarter.isGoalkeeper, false);
  assert.equal(fieldStarter.starter, true);
});

test("the produced ParsedMatch passes structural validation", () => {
  assert.deepEqual(validateParsedMatch(match), []);
});

test("injected CBF profiles make athletes seedable (canonical name + birth date)", () => {
  const enriched = parseCbfSumula(fixture, {
    profiles: [{ bid: 718455, name: "Gabriel Laizo Werneck", birthDate: "2006-03-14", mainPosition: "Goleiro" }],
  });
  const gk = enriched.match.athletes.find((a) => a.bid === 718455);
  assert.equal(gk.name, "Gabriel Laizo Werneck");
  assert.equal(gk.birthDate, "2006-03-14");
  // Athletes without a profile stay provisional (no birth date → not seeded).
  const other = enriched.match.athletes.find((a) => a.bid === 697298);
  assert.equal(other.birthDate, null);
});

test("caller-supplied club source keys override the provisional ones", () => {
  const injected = parseCbfSumula(fixture, {
    homeSourceKey: "cbf:6157",
    awaySourceKey: "cbf:6206",
  });
  assert.equal(injected.match.home.sourceKey, "cbf:6157");
  assert.equal(injected.match.away.sourceKey, "cbf:6206");
});

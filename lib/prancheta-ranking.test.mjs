import test from "node:test";
import assert from "node:assert/strict";
import { FORMATIONS, FORMATION_SLOTS } from "./prancheta-formations.ts";
import { buildBestLineup, rankBench, rankCandidatesForSlot } from "./prancheta-ranking.ts";

function athlete(bid, position, overrides = {}) {
  return {
    bid,
    mainPosition: position,
    secondaryPosition: null,
    favoriteRating: 50,
    matches: 10,
    minutes: 800,
    goals: 1,
    assists: 1,
    yellowCards: 1,
    redCards: 0,
    suspensions: 0,
    cleanSheets: 0,
    aboveCategory: 0,
    evolution: 60,
    ...overrides,
  };
}

test("todas as formações possuem onze slots únicos", () => {
  for (const formation of FORMATIONS) {
    const slots = FORMATION_SLOTS[formation];
    assert.equal(slots.length, 11);
    assert.equal(new Set(slots.map((slot) => slot.id)).size, 11);
  }
});

test("cada formação aceita apenas as funções previstas no contrato", () => {
  const expected = {
    "4-3-3": ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "RW", "ST", "LW"],
    "4-4-2": ["GK", "RB", "CB", "CB", "LB", "RW", "CM", "CM", "LW", "ST", "ST"],
    "3-5-2": ["GK", "CB", "CB", "CB", "RW", "DM", "CM", "AM", "LW", "ST", "ST"],
    "4-2-3-1": ["GK", "RB", "CB", "CB", "LB", "DM", "DM", "RW", "AM", "LW", "ST"],
  };
  for (const formation of FORMATIONS) {
    assert.deepEqual(FORMATION_SLOTS[formation].map((slot) => slot.position), expected[formation]);
  }
  assert.deepEqual(FORMATION_SLOTS["4-2-3-1"][5].acceptedPositions, ["DM"]);
  assert.deepEqual(FORMATION_SLOTS["4-2-3-1"][6].acceptedPositions, ["DM", "CM"]);
});

test("montagem não repete atletas e deixa vagas sem candidato compatível", () => {
  const candidates = [athlete(1, "GK"), athlete(2, "CB"), athlete(3, "ST")];
  const lineup = buildBestLineup(candidates, FORMATION_SLOTS["4-3-3"]);
  assert.equal(lineup.length, 3);
  assert.equal(new Set(lineup.map((entry) => entry.bid)).size, 3);
});

test("posição principal vence secundária com desempenho equivalente", () => {
  const slot = FORMATION_SLOTS["4-3-3"].find((entry) => entry.position === "ST");
  assert.ok(slot);
  const ranked = rankCandidatesForSlot([
    athlete(1, "ST", { favoriteRating: 50 }),
    athlete(2, "LW", { secondaryPosition: "ST", favoriteRating: 100 }),
  ], slot);
  assert.equal(ranked[0].candidate.bid, 1);
  assert.equal(ranked[1].secondary, true);
});

test("desempenho superior lidera e disciplina aplica penalidade", () => {
  const slot = FORMATION_SLOTS["4-3-3"].find((entry) => entry.position === "ST");
  assert.ok(slot);
  const ranked = rankCandidatesForSlot([
    athlete(1, "ST", { goals: 12, assists: 5, evolution: 80 }),
    athlete(2, "ST", { goals: 2, assists: 1, evolution: 55 }),
    athlete(3, "ST", { goals: 12, assists: 5, evolution: 80, redCards: 3, suspensions: 4 }),
  ], slot);
  assert.equal(ranked[0].candidate.bid, 1);
  assert.ok(ranked.find((entry) => entry.candidate.bid === 3).score < ranked[0].score);
});

test("banco exclui titulares e ordena por nota", () => {
  const bench = rankBench([
    athlete(1, "GK", { favoriteRating: 100 }),
    athlete(2, "CB", { favoriteRating: 70 }),
    athlete(3, "ST", { favoriteRating: 90 }),
  ], new Set([1]));
  assert.deepEqual(bench.map((entry) => entry.bid), [3, 2]);
});

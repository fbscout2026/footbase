import { test } from "node:test";
import assert from "node:assert/strict";
import { validateParsedMatch } from "./services/scraper/validate.ts";

function validMatch() {
  return {
    tournament: { name: "Copa Teste", federation: "CBF", year: 2026, category: "SUB-17" },
    matchDate: "2026-05-10",
    matchCategory: "SUB-17",
    rodada: "1",
    home: { sourceKey: "cbf:100", name: "Clube A", state: "SP", federacao: "FPF" },
    away: { sourceKey: "cbf:200", name: "Clube B", state: "RJ", federacao: "FERJ" },
    homeScore: 2,
    awayScore: 1,
    sourceUrl: "https://example.org/sumula.pdf",
    athletes: [{ bid: 111, name: "Atleta Um", birthDate: "2009-01-01" }],
    appearances: [
      { bid: 111, playerCategory: "SUB-17", minutesPlayed: 90, goals: 1, assists: 0, yellowCards: 1, redCards: 0, cleanSheet: false },
    ],
  };
}

test("a well-formed match has no validation errors", () => {
  assert.deepEqual(validateParsedMatch(validMatch()), []);
});

test("flags missing tournament fields and bad date", () => {
  const m = validMatch();
  m.tournament.name = "";
  m.tournament.year = 1800;
  m.matchDate = "10/05/2026";
  const errs = validateParsedMatch(m);
  assert.ok(errs.some((e) => e.includes("tournament.name")));
  assert.ok(errs.some((e) => e.includes("tournament.year")));
  assert.ok(errs.some((e) => e.includes("matchDate")));
});

test("flags identical home/away clubs", () => {
  const m = validMatch();
  m.away.sourceKey = m.home.sourceKey;
  assert.ok(validateParsedMatch(m).some((e) => e.includes("must differ")));
});

test("flags out-of-range appearance stats and duplicate BID", () => {
  const m = validMatch();
  m.appearances = [
    { bid: 111, playerCategory: "SUB-17", minutesPlayed: 200, goals: -1, assists: 0, yellowCards: 3, redCards: 2, cleanSheet: false },
    { bid: 111, playerCategory: "SUB-17", minutesPlayed: 90, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheet: true },
  ];
  const errs = validateParsedMatch(m);
  assert.ok(errs.some((e) => e.includes("minutesPlayed")));
  assert.ok(errs.some((e) => e.includes("goals")));
  assert.ok(errs.some((e) => e.includes("yellowCards")));
  assert.ok(errs.some((e) => e.includes("redCards")));
  assert.ok(errs.some((e) => e.includes("duplicated")));
});

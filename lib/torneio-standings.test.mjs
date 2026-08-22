import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings, computeTopScorers } from "./torneio-standings.ts";

const clubs = new Map([
  ["a", { id: "a", name: "Alpha", crestUrl: null }],
  ["b", { id: "b", name: "Bravo", crestUrl: null }],
  ["c", { id: "c", name: "Charlie", crestUrl: null }],
]);

test("computeStandings: win/draw/loss points and goal difference", () => {
  const matches = [
    { homeClubId: "a", awayClubId: "b", homeScore: 2, awayScore: 0 }, // A wins
    { homeClubId: "b", awayClubId: "c", homeScore: 1, awayScore: 1 }, // draw
    { homeClubId: "c", awayClubId: "a", homeScore: 0, awayScore: 3 }, // A wins
  ];
  const table = computeStandings(matches, clubs);

  const a = table.find((r) => r.club.id === "a");
  assert.equal(a.played, 2);
  assert.equal(a.wins, 2);
  assert.equal(a.draws, 0);
  assert.equal(a.losses, 0);
  assert.equal(a.goalsFor, 5);
  assert.equal(a.goalsAgainst, 0);
  assert.equal(a.goalDiff, 5);
  assert.equal(a.points, 6);

  const b = table.find((r) => r.club.id === "b");
  assert.equal(b.points, 1);
  assert.equal(b.wins, 0);
  assert.equal(b.draws, 1);
  assert.equal(b.losses, 1);
});

test("computeStandings: sorted by points, then goal difference, then goals for, then name", () => {
  const matches = [
    { homeClubId: "a", awayClubId: "b", homeScore: 1, awayScore: 1 },
    { homeClubId: "c", awayClubId: "b", homeScore: 1, awayScore: 1 },
  ];
  const table = computeStandings(matches, clubs);
  // B drew both matches (2 points) and leads; A and C each drew once (1 point, 0 goal
  // diff, 1 goal for) — tie broken by name (Alpha < Charlie).
  assert.deepEqual(
    table.map((r) => r.club.id),
    ["b", "a", "c"],
  );
});

test("computeStandings: a scheduled match (null scores) is excluded, not treated as 0x0", () => {
  const matches = [{ homeClubId: "a", awayClubId: "b", homeScore: null, awayScore: null }];
  const table = computeStandings(matches, clubs);
  assert.equal(table.length, 0);
});

test("computeStandings: a club not in the lookup map still gets a row (fallback name = id)", () => {
  const matches = [{ homeClubId: "x", awayClubId: "y", homeScore: 1, awayScore: 0 }];
  const table = computeStandings(matches, clubs);
  assert.equal(table.length, 2);
  assert.equal(table.find((r) => r.club.id === "x").club.name, "x");
});

test("computeTopScorers: sums goals per athlete across appearances, sorted descending", () => {
  const appearances = [
    { fbId: 1, name: "Zico", goals: 2 },
    { fbId: 2, name: "Pele", goals: 1 },
    { fbId: 1, name: "Zico", goals: 1 }, // same athlete, another match
    { fbId: 3, name: "Ronaldo", goals: 0 }, // no goals — excluded
  ];
  const scorers = computeTopScorers(appearances);
  assert.deepEqual(scorers, [
    { fbId: 1, name: "Zico", goals: 3 },
    { fbId: 2, name: "Pele", goals: 1 },
  ]);
});

test("computeTopScorers: ties broken by name", () => {
  const appearances = [
    { fbId: 1, name: "Zico", goals: 2 },
    { fbId: 2, name: "Ademir", goals: 2 },
  ];
  const scorers = computeTopScorers(appearances);
  assert.deepEqual(
    scorers.map((s) => s.name),
    ["Ademir", "Zico"],
  );
});

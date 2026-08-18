import { test } from "node:test";
import assert from "node:assert/strict";
import { ferjAthletesToCandidates, planFerjIdentitySeed } from "./services/scraper/plan-ferj-identity-seed.ts";

const athletes = [
  { bira: "241936", name: "NICHOLAS SILVA MOREIRA" },
  { bira: "243929", name: "AMAURY DA SILVA FERREIRA" },
];

test("ferjAthletesToCandidates maps bira+name into identity candidates, never a CBF bid", () => {
  const candidates = ferjAthletesToCandidates(athletes, "ferj:64");
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0].candidate, {
    fonte: "ferj",
    externalId: "241936",
    cbfBid: null,
    name: "NICHOLAS SILVA MOREIRA",
    birthDate: null,
  });
  assert.deepEqual(candidates[0].club, { sourceKey: "ferj:64", externalId: "64" });
});

test("an already-mapped bira resolves for free (no review, no duplicate mapping)", () => {
  const candidates = ferjAthletesToCandidates(athletes, "ferj:64");
  const plan = planFerjIdentitySeed(candidates, {
    existingAthletes: [{ bid: 718455, name: "Nicholas Silva Moreira", birthDate: "2011-05-01" }],
    mappings: [{ fonte: "ferj", externalId: "241936", bid: 718455 }],
  });
  assert.deepEqual(plan.mappingsToAdd, []);
  assert.equal(plan.review.some((r) => r.externalId === "241936"), false);
});

test("a brand-new bira with no name hit goes to review, never fabricates a bid", () => {
  const candidates = ferjAthletesToCandidates(athletes, "ferj:64");
  const plan = planFerjIdentitySeed(candidates, { existingAthletes: [], mappings: [] });
  assert.equal(plan.mappingsToAdd.length, 0);
  assert.equal(plan.review.length, 2);
  assert.ok(plan.review.every((r) => r.reason.includes("no CBF bid available yet")));
});

test("a name-only hit (no birth_date on this source) goes to review, never auto-merges", () => {
  const candidates = ferjAthletesToCandidates(athletes, "ferj:64");
  const plan = planFerjIdentitySeed(candidates, {
    existingAthletes: [{ bid: 718455, name: "Nicholas Silva Moreira", birthDate: "2011-05-01" }],
    mappings: [],
  });
  const nicholas = plan.review.find((r) => r.externalId === "241936");
  assert.ok(nicholas);
  assert.ok(nicholas.reason.includes("no birth_date"));
  assert.deepEqual(nicholas.candidates, [718455]);
  assert.equal(plan.mappingsToAdd.length, 0);
});

test("a resolved candidate records the (ferj, bira) -> bid mapping exactly once even if seen twice", () => {
  const candidates = [
    ...ferjAthletesToCandidates([athletes[0]], "ferj:64"),
    ...ferjAthletesToCandidates([athletes[0]], "ferj:64"), // same player, e.g. two matches in the same run
  ];
  const plan = planFerjIdentitySeed(candidates, {
    existingAthletes: [],
    mappings: [{ fonte: "ferj", externalId: "241936", bid: 718455 }],
  });
  assert.equal(plan.mappingsToAdd.length, 0); // already mapped — nothing new to add
});

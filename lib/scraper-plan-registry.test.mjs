import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfRegistry } from "./services/scraper/parse-cbf-registry.ts";
import { planRegistrySeed } from "./services/scraper/plan-registry-seed.ts";

const payload = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./services/scraper/__fixtures__/cbf-registry-serie-a-p1.json", import.meta.url)),
    "utf8",
  ),
);
const registry = parseCbfRegistry(payload); // 4 clubs, 6 athletes

// DB state: Flamengo already exists; Rossi (815100) already exists AND is mapped;
// Ademir (438212) has a profile with a birth date; the rest are missing + no profile.
const ctx = {
  existingClubs: [{ sourceKey: "cbf:20016", name: "Flamengo", state: "RJ" }],
  existingAthletes: [{ bid: 815100, name: "Rossi Antigo", birthDate: "1996-05-12" }],
  mappings: [{ fonte: "cbf", externalId: "815100", bid: 815100 }],
  profiles: [{ bid: 438212, birthDate: "2001-01-11", name: "Ademir da Silva Santos Junior" }],
};

const plan = planRegistrySeed(registry, ctx);

test("splits clubs into insert vs update and lists crests to process", () => {
  assert.equal(plan.clubsToInsert.length, 3); // Bahia, Palmeiras, Fluminense
  assert.equal(plan.clubsToUpdate.length, 1); // Flamengo (already exists)
  assert.equal(plan.clubsToUpdate[0].sourceKey, "cbf:20016");
  assert.equal(plan.crestsToProcess.length, 4);
});

test("seeds every missing athlete (birth date optional, backfilled later)", () => {
  // 6 total − 1 existing (Rossi) = 5 missing → all seeded now.
  assert.equal(plan.athletesToSeed.length, 5);
  const ademir = plan.athletesToSeed.find((s) => s.bid === 438212);
  assert.equal(ademir.birthDate, "2001-01-11"); // has a profile
  const noProfile = plan.athletesToSeed.find((s) => s.bid === 829578);
  assert.equal(noProfile.birthDate, null); // seeded with null, backfilled later
});

test("refreshes existing athlete factual fields (source wins, absent preserved)", () => {
  assert.equal(plan.athletesToRefresh.length, 1);
  const r = plan.athletesToRefresh[0];
  assert.equal(r.bid, 815100);
  assert.equal(r.fields.name, "Agustin Daniel Rossi"); // registry name overwrites
  assert.equal(r.fields.birthDate, undefined); // no profile → birth date preserved, not nulled
});

test("enqueues birth-date backfill for seeded athletes lacking a profile", () => {
  // Ademir has a profile; the other 4 seeded need a birth date backfilled.
  assert.deepEqual(plan.birthDateNeeded.sort((a, b) => a - b), [186325, 756284, 829578, 869605]);
});

test("adds mappings for existing/seeded bids and never duplicates", () => {
  // Rossi already mapped → excluded; the 5 freshly seeded athletes get a mapping.
  assert.equal(plan.mappingsToAdd.length, 5);
  const bids = plan.mappingsToAdd.map((m) => m.bid).sort((a, b) => a - b);
  assert.deepEqual(bids, [186325, 438212, 756284, 829578, 869605]);
  assert.ok(!bids.includes(815100)); // already mapped
});

test("no ambiguous/review items for CBF (every athlete carries its bid)", () => {
  assert.equal(plan.review.length, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFpfAtletas } from "./services/scraper/parse-fpf-atletas.ts";
import { planFpfIdentitySeed } from "./services/scraper/plan-fpf-identity-seed.ts";

const payload = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./services/scraper/__fixtures__/fpf-atletas-clube-3307-amador.json", import.meta.url)),
    "utf8",
  ),
);
const candidates = parseFpfAtletas(payload); // 8 athletes, club fpf:3307

test("parses every row into an identity candidate with no CBF bid", () => {
  assert.equal(candidates.length, 8);
  for (const { candidate, club } of candidates) {
    assert.equal(candidate.fonte, "fpf");
    assert.equal(candidate.cbfBid, null);
    assert.equal(club.sourceKey, "fpf:3307");
  }
});

test("normalizes DataNascimento to a plain ISO date", () => {
  const alex = candidates.find((c) => c.candidate.externalId === "530973");
  assert.equal(alex.candidate.birthDate, "2012-03-01");
});

test("skips malformed rows without throwing", () => {
  const broken = parseFpfAtletas({
    Retorno: [
      { IdAtleta: 1, IdClube: 3307, Nome: "Sem data", DataNascimento: null },
      { IdAtleta: null, IdClube: 3307, Nome: "Sem id" },
      { IdAtleta: 2, IdClube: null, Nome: "Sem clube" },
      {},
    ],
  });
  assert.equal(broken.length, 1); // only "Sem data" has id+club+name (birth date is optional)
  assert.equal(broken[0].candidate.birthDate, null);
});

test("ignores a payload with no Retorno array", () => {
  assert.deepEqual(parseFpfAtletas({}), []);
  assert.deepEqual(parseFpfAtletas(null), []);
});

// --- planner --------------------------------------------------------------------

test("name+birth_date match requires an EXACT existing birth_date (no auto-backfill from a name-only hit)", () => {
  // resolveAthleteIdentity only returns 'matched' when both sides already agree on
  // birth_date — an existing athlete with an unknown birth_date can never "match" this
  // way (there is nothing to compare against), so it correctly falls to 'ambiguous'
  // (admin review), never a silent auto-merge on name alone.
  const plan = planFpfIdentitySeed(candidates, {
    existingAthletes: [{ bid: 700001, name: "André Henrique Rodrigues de Araújo Filho", birthDate: "" }],
    mappings: [],
  });
  assert.equal(plan.birthDateBackfill.length, 0);
  assert.equal(plan.mappingsToAdd.length, 0);
  assert.ok(plan.review.some((r) => r.externalId === "531657"));
});

test("backfills birth_date once an (fpf, externalId) mapping already exists and the field is still empty", () => {
  // The realistic path to a first-time mapping is admin review (see the test above);
  // once `atleta_fontes` has it, later runs recognize the candidate via the mapping
  // (no name/birth_date comparison needed) and can safely fill a still-missing field.
  const plan = planFpfIdentitySeed(candidates, {
    existingAthletes: [{ bid: 700001, name: "André Henrique Rodrigues de Araújo Filho", birthDate: "" }],
    mappings: [{ fonte: "fpf", externalId: "531657", bid: 700001 }],
  });
  assert.equal(plan.birthDateBackfill.length, 1);
  assert.deepEqual(plan.birthDateBackfill[0], { bid: 700001, birthDate: "2008-06-02" });
  assert.equal(plan.mappingsToAdd.length, 0); // already mapped, never duplicated
});

test("never overwrites an athlete that already has a confirmed birth_date", () => {
  const plan = planFpfIdentitySeed(candidates, {
    existingAthletes: [{ bid: 700001, name: "André Henrique Rodrigues de Araújo Filho", birthDate: "1999-01-01" }],
    mappings: [],
  });
  // Name+birthDate must match to resolve at all — "1999-01-01" doesn't match the FPF
  // row (2008-06-02), so this candidate resolves ambiguous/new, never a silent overwrite.
  assert.equal(plan.birthDateBackfill.length, 0);
});

test("never fabricates a new atletas row for a candidate found only via FPF", () => {
  const plan = planFpfIdentitySeed(candidates, { existingAthletes: [], mappings: [] });
  assert.equal(plan.birthDateBackfill.length, 0);
  assert.equal(plan.mappingsToAdd.length, 0);
  assert.equal(plan.review.length, 8);
  assert.ok(plan.review.every((r) => r.reason.includes("no CBF bid")));
});

test("proposes nacionalidade/contractEndDate refresh from a profile, source always wins", () => {
  const gabriel = candidates.find((c) => c.candidate.externalId === "531657"); // André Henrique...
  const plan = planFpfIdentitySeed([gabriel], {
    existingAthletes: [{ bid: 700001, name: "André Henrique Rodrigues de Araújo Filho", birthDate: "2008-06-02" }],
    mappings: [{ fonte: "fpf", externalId: "531657", bid: 700001 }],
    profiles: [
      {
        idAtleta: "531657",
        registro: "999999",
        name: "André Henrique Rodrigues de Araújo Filho",
        birthDate: "2008-06-02",
        nacionalidade: "Brasileira",
        contractEndDate: "2028-12-31",
        clubSourceKey: "fpf:3307",
      },
    ],
  });
  assert.equal(plan.profileRefresh.length, 1);
  assert.deepEqual(plan.profileRefresh[0], { bid: 700001, fields: { nacionalidade: "Brasileira", contractEndDate: "2028-12-31" } });
});

test("reuses an existing (fpf, externalId) mapping instead of re-adding it", () => {
  const plan = planFpfIdentitySeed(candidates, {
    existingAthletes: [{ bid: 700001, name: "André Henrique Rodrigues de Araújo Filho", birthDate: "2008-06-02" }],
    mappings: [{ fonte: "fpf", externalId: "531657", bid: 700001 }],
  });
  assert.equal(plan.mappingsToAdd.length, 0); // already mapped
  assert.equal(plan.birthDateBackfill.length, 0); // already had that exact birth_date
});

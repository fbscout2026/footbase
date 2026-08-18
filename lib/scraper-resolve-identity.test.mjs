import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAthleteIdentity, normalizeName } from "./services/scraper/resolve-athlete-identity.ts";

const existing = [
  { bid: 718455, name: "Gabriel Laizo Werneck", birthDate: "2006-03-14" },
  { bid: 222222, name: "João Silva", birthDate: "2007-01-01" },
  { bid: 333333, name: "Joao Silva", birthDate: "2008-02-02" }, // same normalized name, other dob
  { bid: 444444, name: "Ana Souza", birthDate: "2009-09-09" },
  { bid: 555555, name: "Ana Souza", birthDate: "2009-09-09" }, // true duplicate name+dob
];
const mappings = [{ fonte: "fpf", externalId: "X99", bid: 222222 }];
const ctx = { existing, mappings };

test("a source-provided CBF bid settles identity immediately", () => {
  const r = resolveAthleteIdentity({ fonte: "cbf", externalId: "718455", cbfBid: 718455, name: "irrelevante" }, ctx);
  assert.equal(r.kind, "bid");
  assert.equal(r.bid, 718455);
  assert.equal(r.confidence, "exact");
});

test("an existing atleta_fontes mapping is reused (idempotent)", () => {
  const r = resolveAthleteIdentity({ fonte: "fpf", externalId: "X99", name: "qualquer nome" }, ctx);
  assert.equal(r.kind, "mapped");
  assert.equal(r.bid, 222222);
});

test("a single name + birth_date hit is a match (admin confirms, not auto-merged)", () => {
  const r = resolveAthleteIdentity(
    { fonte: "fpf", externalId: "NEW1", name: "Gabriel Laízo Werneck", birthDate: "2006-03-14" },
    ctx,
  );
  assert.equal(r.kind, "matched");
  assert.equal(r.bid, 718455);
  assert.equal(r.confidence, "matched");
});

test("two people sharing name + birth_date are ambiguous (never merged)", () => {
  const r = resolveAthleteIdentity({ fonte: "fpf", externalId: "NEW2", name: "Ana Souza", birthDate: "2009-09-09" }, ctx);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates.sort(), [444444, 555555]);
});

test("name matches but birth_date differs → ambiguous (not a merge)", () => {
  const r = resolveAthleteIdentity({ fonte: "fpf", externalId: "NEW3", name: "João Silva", birthDate: "2099-01-01" }, ctx);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates.sort(), [222222, 333333]);
});

test("no bid, no mapping, birth_date present but nobody matches → new", () => {
  const r = resolveAthleteIdentity({ fonte: "fpf", externalId: "NEW4", name: "Zé Ninguém", birthDate: "2005-05-05" }, ctx);
  assert.equal(r.kind, "new");
});

test("no birth_date with a name hit cannot be confirmed → ambiguous (admin review)", () => {
  const r = resolveAthleteIdentity({ fonte: "fpf", externalId: "NEW5", name: "João Silva" }, ctx);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates.sort(), [222222, 333333]);
});

test("no birth_date and no name hit → new", () => {
  const r = resolveAthleteIdentity({ fonte: "fpf", externalId: "NEW6", name: "Fulano Inexistente" }, ctx);
  assert.equal(r.kind, "new");
});

test("normalizeName is accent/case/space insensitive", () => {
  assert.equal(normalizeName("João  Sïlva"), normalizeName("joao silva"));
  assert.equal(normalizeName("ÁÉÍÓÚ Ç"), "aeiou c");
});

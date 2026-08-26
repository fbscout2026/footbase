import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveClubIdentity, normalizeName } from "./services/scraper/resolve-club-identity.ts";

const existing = [
  { id: "club-cbf-porto-vitoria", name: "Porto Vitória F. C.", state: "ES", crestHash: "hash-porto-vitoria" },
  { id: "club-democrata-fc", name: "Democrata Futebol Clube", state: "MG", crestHash: "hash-democrata-fc" },
  { id: "club-democrata-ec", name: "Esporte Clube Democrata", state: "MG", crestHash: "hash-democrata-ec" },
  { id: "club-vasco", name: "Vasco da Gama", state: "RJ", crestHash: "hash-vasco" },
  { id: "club-no-crest", name: "Clube Sem Escudo Ainda", state: "ES", crestHash: null },
];
const mappings = [{ fonte: "fes", externalId: "porto-vitoria-f-c", clubId: "club-cbf-porto-vitoria" }];
const ctx = { existing, mappings };

test("an existing clube_fontes mapping is reused (idempotent)", () => {
  const r = resolveClubIdentity({ fonte: "fes", externalId: "porto-vitoria-f-c", name: "qualquer nome", state: "ES", crestHash: null }, ctx);
  assert.equal(r.kind, "mapped");
  assert.equal(r.clubId, "club-cbf-porto-vitoria");
});

test("identical crest hash auto-confirms across sources even when the name differs (SAF variant pattern)", () => {
  const r = resolveClubIdentity({ fonte: "cbf", externalId: "999", name: "Vasco da Gama Saf", state: "RJ", crestHash: "hash-vasco" }, ctx);
  assert.equal(r.kind, "matched");
  assert.equal(r.clubId, "club-vasco");
  assert.equal(r.confidence, "matched");
});

test("crest hash match is rejected when state conflicts", () => {
  const r = resolveClubIdentity({ fonte: "cbf", externalId: "999", name: "Vasco da Gama Saf", state: "SP", crestHash: "hash-vasco" }, ctx);
  assert.notEqual(r.kind, "matched");
});

test("crest hash confirms even against a candidate found via a completely different name (no name check on this tier)", () => {
  const r = resolveClubIdentity({ fonte: "fmf", externalId: "123", name: "Nome Totalmente Diferente", state: "RJ", crestHash: "hash-vasco" }, ctx);
  assert.equal(r.kind, "matched");
  assert.equal(r.clubId, "club-vasco");
});

test("name + state match alone, without crest confirmation, is never auto-merged — always ambiguous", () => {
  const r = resolveClubIdentity({ fonte: "cbf", externalId: "1", name: "Porto Vitória F. C.", state: "ES", crestHash: null }, ctx);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates, ["club-cbf-porto-vitoria"]);
});

test("name + state match where the crest DIFFERS is also ambiguous, never merged", () => {
  const r = resolveClubIdentity({ fonte: "cbf", externalId: "1", name: "Porto Vitória F. C.", state: "ES", crestHash: "hash-completely-different" }, ctx);
  assert.equal(r.kind, "ambiguous");
});

test("Democrata Futebol Clube vs Esporte Clube Democrata never cross-confirm — different real clubs, different crests", () => {
  const r1 = resolveClubIdentity({ fonte: "fgf", externalId: "1", name: "Democrata Fc", state: "MG", crestHash: "hash-democrata-fc" }, ctx);
  assert.equal(r1.kind, "matched");
  assert.equal(r1.clubId, "club-democrata-fc");

  const r2 = resolveClubIdentity({ fonte: "fgf", externalId: "2", name: "Ec Democrata", state: "MG", crestHash: "hash-democrata-ec" }, ctx);
  assert.equal(r2.kind, "matched");
  assert.equal(r2.clubId, "club-democrata-ec");
});

test("a genuinely new club (no mapping, no crest hit, no name+state hit) resolves as new", () => {
  const r = resolveClubIdentity({ fonte: "fes", externalId: "novo-clube", name: "Clube Totalmente Novo", state: "ES", crestHash: "hash-nunca-visto" }, ctx);
  assert.equal(r.kind, "new");
});

test("a name+state hit against an existing club with no crest yet is ambiguous, not silently new nor silently merged", () => {
  const r = resolveClubIdentity({ fonte: "fes", externalId: "x", name: "Clube Sem Escudo Ainda", state: "ES", crestHash: null }, ctx);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates, ["club-no-crest"]);
});

test("normalizeName is accent/case/punctuation insensitive", () => {
  assert.equal(normalizeName("Rio Branco F. C."), normalizeName("rio branco f.c."));
});

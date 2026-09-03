import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAthleteIdentity, normalizeName } from "./services/scraper/resolve-athlete-identity.ts";

const existing = [
  { bid: 718455, name: "Gabriel Laizo Werneck", birthDate: "2006-03-14" },
  { bid: 222222, name: "João Silva", birthDate: "2007-01-01" },
  { bid: 333333, name: "Joao Silva", birthDate: "2008-02-02" }, // same normalized name, other dob
  { bid: 444444, name: "Ana Souza", birthDate: "2009-09-09" },
  { bid: 555555, name: "Ana Souza", birthDate: "2009-09-09" }, // true duplicate name+dob
  { bid: 900000123, name: "Pedro Provisorio Ferj", birthDate: "", currentClubId: "club-a" }, // FERJ-only provisional athlete, no birth_date, has a current club
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

// Session 56 ("FB-ID: chave suprema") — closing the cross-source duplicate hole:
// today CBF/FMF/FGF trust a source-provided bid blindly (tier 1) without ever
// checking whether that same real person already exists under a different
// (e.g. provisional) fb_id from another source. These tests define the fixed
// tier order: atleta_fontes mapping first, then an exact existing-bid match,
// then name+birth_date/name+club — even when a cbfBid is present — and only
// "new" once none of those confirm anything.

test("an atleta_fontes mapping wins over a raw cbfBid (never blind-trusts the number when it's already mapped elsewhere)", () => {
  const mappingCtx = { existing, mappings: [...mappings, { fonte: "cbf", externalId: "999999", bid: 555555 }] };
  const r = resolveAthleteIdentity({ fonte: "cbf", externalId: "999999", cbfBid: 999999, name: "irrelevante" }, mappingCtx);
  assert.equal(r.kind, "mapped");
  assert.equal(r.bid, 555555);
});

test("a brand-new cbfBid that matches an existing (provisional) athlete by name+birth_date resolves to the EXISTING bid, not the new number", () => {
  const r = resolveAthleteIdentity(
    { fonte: "cbf", externalId: "777777", cbfBid: 777777, name: "Gabriel Laízo Werneck", birthDate: "2006-03-14" },
    ctx,
  );
  assert.equal(r.kind, "matched");
  assert.equal(r.bid, 718455);
});

test("a brand-new cbfBid with zero existing match resolves as new — caller mints it directly (no provisional allocation needed)", () => {
  const r = resolveAthleteIdentity({ fonte: "cbf", externalId: "888888", cbfBid: 888888, name: "Zé Ninguém Novo" }, ctx);
  assert.equal(r.kind, "new");
});

test("no birth_date, but name+current-club matches an existing athlete → matched (the name+club fallback tier)", () => {
  const r = resolveAthleteIdentity(
    { fonte: "ferj", externalId: "NEWBIRA1", name: "Pedro Provisorio Ferj", clubId: "club-a" },
    ctx,
  );
  assert.equal(r.kind, "matched");
  assert.equal(r.bid, 900000123);
});

test("no birth_date, name matches but club differs → still ambiguous, name+club alone on a different club never confirms", () => {
  const r = resolveAthleteIdentity(
    { fonte: "ferj", externalId: "NEWBIRA2", name: "Pedro Provisorio Ferj", clubId: "club-b" },
    ctx,
  );
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates, [900000123]);
});

// Session 57 (continuação) — real incident: a CBF-sourced name truncated mid-name
// ("Andrey Fernandes de", missing "Oliveira Nunes") never exact-matched the full
// name a later source provided, so the athlete was minted a second identity
// instead of being recognized as the same person. These tests lock in the fix:
// a name ending in a bare preposition (never how a real, complete name ends) is
// treated as equivalent to its untruncated form, but ONLY when birth_date or
// current club still confirms — truncation alone is never enough, same trust
// bar as every other name tier here.

const truncatedExisting = [
  ...existing,
  { bid: 646440, name: "Andrey Fernandes de", birthDate: "2008-02-05", currentClubId: "club-vasco" },
];
const truncatedCtx = { existing: truncatedExisting, mappings };

test("a truncated existing name + matching birth_date resolves to the existing bid, not a new one", () => {
  const r = resolveAthleteIdentity(
    { fonte: "ferj", externalId: "BIRA-ANDREY", name: "Andrey Fernandes de Oliveira Nunes", birthDate: "2008-02-05" },
    truncatedCtx,
  );
  assert.equal(r.kind, "matched");
  assert.equal(r.bid, 646440);
});

test("a truncated CANDIDATE name + matching current club resolves to the existing (full-name) bid", () => {
  const clubCtx = {
    existing: [...existing, { bid: 800000, name: "Pedro Alves de Souza", birthDate: "", currentClubId: "club-a" }],
    mappings,
  };
  const r = resolveAthleteIdentity({ fonte: "cbf", externalId: "NEWBID", name: "Pedro Alves de", clubId: "club-a" }, clubCtx);
  assert.equal(r.kind, "matched");
  assert.equal(r.bid, 800000);
});

test("truncation alone, with no birth_date/club to confirm, is ambiguous — never auto-matched", () => {
  const r = resolveAthleteIdentity({ fonte: "ferj", externalId: "BIRA-ANDREY2", name: "Andrey Fernandes de Oliveira Nunes" }, truncatedCtx);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.candidates, [646440]);
});

test("a genuinely complete shorter name (not ending in a bare preposition) never truncation-matches a longer one", () => {
  const shorterNameCtx = {
    existing: [...existing, { bid: 700000, name: "Gabriel da Silva", birthDate: "2007-07-07" }],
    mappings,
  };
  const r = resolveAthleteIdentity(
    { fonte: "fpf", externalId: "NEW7", name: "Gabriel da Silva Campos", birthDate: "2007-07-07" },
    shorterNameCtx,
  );
  assert.equal(r.kind, "new");
});

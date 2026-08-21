import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeCompletoFromGlued } from "./services/scraper/parse-cbf-sumula.ts";

// Session 55: found ~1,600 of 8,210 already-seeded athletes with their apelido
// glued directly onto their real name, no separator — the old heuristic here
// only caught an exact-repeat pattern (~30 real cases). Every case below is a
// real athlete name pulled live from the database while investigating.

test("ellipsis truncation still wins (pattern 1, unchanged)", () => {
  assert.equal(nomeCompletoFromGlued("Gabriel We ...Gabriel Laizo Werneck"), "Gabriel Laizo Werneck");
});

test("a genuinely different nickname glued with no separator (pattern 2)", () => {
  assert.equal(nomeCompletoFromGlued("CaduCarlos Eduardo F. Carvalho"), "Carlos Eduardo F. Carvalho");
  assert.equal(nomeCompletoFromGlued("GugaGustavo Rypl Osterma"), "Gustavo Rypl Osterma");
  assert.equal(nomeCompletoFromGlued("DioguinhoDiogo Henrique Lopes Purificacao"), "Diogo Henrique Lopes Purificacao");
});

test("a lowercase apelido glued onto the real name (pattern 2)", () => {
  assert.equal(nomeCompletoFromGlued("duEduardo Vinicius San"), "Eduardo Vinicius San");
});

test("a shirt-number-disambiguated apelido glued with no separator (pattern 2)", () => {
  assert.equal(nomeCompletoFromGlued("Maycon 15Maycon Emanoel Santo"), "Maycon Emanoel Santo");
  assert.equal(nomeCompletoFromGlued("PH1Pedro Henrique Kern"), "Pedro Henrique Kern");
});

test("a doubly-glued blob (jersey id + nickname + real name) splits at the last transition, not the first", () => {
  assert.equal(nomeCompletoFromGlued("1185 2ChocolateDavi Guimaraes de Li"), "Davi Guimaraes de Li");
});

test("an ALL-CAPS apelido glued onto a Title-case real name (pattern 2)", () => {
  assert.equal(nomeCompletoFromGlued("CARLESSOGuilherme Martinelli"), "Guilherme Martinelli");
  assert.equal(nomeCompletoFromGlued("OTAVIOOtavio Martins Balbi"), "Otavio Martins Balbi");
});

test("an exact same-case repeat, only recoverable via pattern 3 (no lowercase transition exists)", () => {
  assert.equal(nomeCompletoFromGlued("OTAVIOOTAVIO SCHELL MACIEL"), "OTAVIO SCHELL MACIEL");
  assert.equal(nomeCompletoFromGlued("OtavioOtavio Goncalves De Oliveira"), "Otavio Goncalves De Oliveira");
});

test("accent-insensitive exact repeat (pattern 3, pre-existing behavior preserved)", () => {
  assert.equal(nomeCompletoFromGlued("VINÍCIUSVinicius Rodrigues M"), "Vinicius Rodrigues M");
});

test("no reliable split (ALL-CAPS apelido and name share no literal repeat) — left as-is, not worse than before", () => {
  assert.equal(nomeCompletoFromGlued("MatheuzinhoMATHEUS DE OLIVEIRA"), "MatheuzinhoMATHEUS DE OLIVEIRA");
});

test("a clean, already-correct two-word name is never touched", () => {
  assert.equal(nomeCompletoFromGlued("Carlos Eduardo"), "Carlos Eduardo");
  assert.equal(nomeCompletoFromGlued("Ana Maria"), "Ana Maria");
});

test("a coincidental partial letter-repeat inside one real word is never mistaken for a glue split", () => {
  // "Dydye" contains "dy" twice ("Dy" + "dye") but is one real given name —
  // found live during the Session 55 backfill verification pass, where the
  // pre-fix version of pattern 3 turned this into "dye Drogba Bagesto".
  assert.equal(nomeCompletoFromGlued("Dydye Drogba Bagesto"), "Dydye Drogba Bagesto");
});

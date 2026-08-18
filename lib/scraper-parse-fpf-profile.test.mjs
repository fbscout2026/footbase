import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFpfAthleteProfile } from "./services/scraper/parse-fpf-athlete-profile.ts";

function fixture(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./services/scraper/__fixtures__/${name}`, import.meta.url)), "utf8"));
}

test("parses a real profile: dates, trimmed nationality, and the registro crosswalk", () => {
  const profile = parseFpfAthleteProfile(fixture("fpf-read-atleta-504484.json"));
  assert.deepEqual(profile, {
    idAtleta: "504484",
    registro: "656616", // matches the súmula's "656616/26" minus the "/{ano}" suffix — confirmed live
    name: "Gabriel Marques Vieira Mota dos Santos",
    birthDate: "2010-08-12",
    nacionalidade: "Brasileira",
    contractEndDate: "2029-03-27",
    clubSourceKey: "fpf:3309",
  });
});

test("parses a second real profile independently", () => {
  const profile = parseFpfAthleteProfile(fixture("fpf-read-atleta-530973.json"));
  assert.equal(profile.idAtleta, "530973");
  assert.equal(profile.registro, "662100");
  assert.equal(profile.birthDate, "2012-03-01");
  assert.equal(profile.contractEndDate, "2027-12-31");
  assert.equal(profile.clubSourceKey, "fpf:3307");
});

test("returns null for an unsuccessful/malformed payload instead of throwing", () => {
  assert.equal(parseFpfAthleteProfile({ Sucesso: false, Retorno: null }), null);
  assert.equal(parseFpfAthleteProfile({}), null);
  assert.equal(parseFpfAthleteProfile(null), null);
  assert.equal(parseFpfAthleteProfile({ Retorno: { IdAtleta: 1 } }), null); // missing name/registro/club
});

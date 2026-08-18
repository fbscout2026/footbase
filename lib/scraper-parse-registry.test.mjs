import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfRegistry } from "./services/scraper/parse-cbf-registry.ts";

const payload = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./services/scraper/__fixtures__/cbf-registry-serie-a-p1.json", import.meta.url)),
    "utf8",
  ),
);

const { clubs, athletes } = parseCbfRegistry(payload);

test("dedupes clubs by CBF id and builds the source_key + crest", () => {
  // 6 rows, but 3 are Flamengo → 4 unique clubs.
  assert.equal(clubs.length, 4);
  const fla = clubs.find((c) => c.sourceKey === "cbf:20016");
  assert.ok(fla);
  assert.equal(fla.name, "Flamengo");
  assert.equal(fla.state, "RJ");
  assert.equal(fla.crestUrl, "https://conteudo.cbf.com.br/clubes/20016/escudo.jpg");
});

test("parses athletes keyed by the 6-digit BID with canonical names", () => {
  assert.equal(athletes.length, 6);
  const bids = athletes.map((a) => a.bid);
  assert.equal(new Set(bids).size, bids.length); // unique
  assert.ok(bids.every((b) => b >= 100000 && b <= 999999));
  const rossi = athletes.find((a) => a.bid === 815100);
  assert.equal(rossi.name, "Agustin Daniel Rossi");
  // birth date is not in the list endpoint → provisional (not seedable yet).
  assert.equal(rossi.birthDate, null);
});

test("NEVER emits CPF (sensitive PII is dropped)", () => {
  const dumped = JSON.stringify({ clubs, athletes });
  assert.ok(!/cpf/i.test(dumped));
  assert.ok(!("atleta_cpf" in athletes[0]));
  // No athlete object carries the redacted CPF value either.
  assert.ok(!dumped.includes("00000000000"));
});

test("skips malformed rows without throwing", () => {
  assert.deepEqual(parseCbfRegistry({}), { clubs: [], athletes: [] });
  assert.deepEqual(parseCbfRegistry(null), { clubs: [], athletes: [] });
  const partial = parseCbfRegistry({ atletas: [{ atleta_id: "", clube_id: "" }, { atleta_id: "718455", clube_id: "20016", atleta_nome: "X", clube_nome_popular: "Fla" }] });
  assert.equal(partial.athletes.length, 1);
  assert.equal(partial.clubs.length, 1);
});

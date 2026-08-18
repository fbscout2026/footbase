import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfTabelaDetalhada } from "./services/scraper/parse-cbf-tabela-detalhada.ts";

const text = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/cbf-tabela-detalhada-sub20a-2026.txt", import.meta.url)),
  "utf8",
);
const matches = parseCbfTabelaDetalhada(text);

test("parses every played match in the real sample (75 of 77 dated rows — the other 2 are unplayed finals)", () => {
  assert.equal(matches.length, 75);
});

test("never truncates a team name starting with a real capital letter (stray-code false positive)", () => {
  const saoPaulo = matches.find((m) => m.jogo === "005");
  assert.equal(saoPaulo.mandante, "São Paulo");
  const gremio = matches.find((m) => m.jogo === "004");
  assert.equal(gremio.mandante, "Grêmio"); // the real "A..." TV-code prefix IS stripped
});

test("parses round, date, teams, UF and score for a normal row", () => {
  const m = matches.find((m) => m.jogo === "008");
  assert.deepEqual(m, {
    jogo: "008", rodada: "1", data: "20/02", dia: "sex", hora: "15:00",
    mandante: "Red Bull Bragantino", ufMandante: "SP",
    golsMandante: 4, golsVisitante: 6,
    visitante: "Flamengo", ufVisitante: "RJ",
  });
});

test("rodada is null (not guessed) when the source genuinely drops the round digit", () => {
  const m = matches.find((m) => m.jogo === "011");
  assert.equal(m.rodada, null);
  assert.equal(m.mandante, "Bahia"); // the rest of the row still parses fine
});

test("draws parse correctly (0 is a valid score, not treated as missing)", () => {
  const m = matches.find((m) => m.jogo === "002");
  assert.equal(m.golsMandante, 2);
  assert.equal(m.golsVisitante, 2);
});

test("skips future/unplayed matches (no score yet) instead of fabricating one", () => {
  // The two 2026 final-stage matches in the fixture (28/08 and 04/09) have no score.
  assert.ok(!matches.some((m) => m.data === "28/08"));
  assert.ok(!matches.some((m) => m.data === "04/09"));
});

test("returns [] for empty or unrecognizable input instead of throwing", () => {
  assert.deepEqual(parseCbfTabelaDetalhada(""), []);
  assert.deepEqual(parseCbfTabelaDetalhada("nada reconhecível aqui"), []);
});

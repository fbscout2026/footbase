import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFerjPartidasListing } from "./services/scraper/discovery/ferj-discover.ts";

// Real card shapes confirmed live (Session 57) against fferj.com.br/partidas —
// "Estadual" always renders 3 spans (campeonato|categoria|série); "Padrao" and
// "Guilherme Embry" render only 2 (campeonato|categoria, no série tier at all).
// Each card is duplicated in the page, same as production (see module doc).
function card(matchId, campeonato, categoria, serie) {
  const serieSpan = serie ? `<span> <!-- -->|<!-- --> <!-- -->${serie}</span>` : "";
  return `<a href="/partidas/${matchId}"><div class="text-gray-700 uppercase text-14 my-5"><span>${campeonato}</span><span> <!-- -->|<!-- --> <!-- -->${categoria}</span>${serieSpan}</div></a>`;
}

test("parses a 3-span card (campeonato | categoria | série)", () => {
  const html = card(1001, "Estadual", "Sub-17", "C").repeat(2);
  const refs = parseFerjPartidasListing(html);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], { matchId: 1001, campeonato: "Estadual", categoria: "SUB-17", serie: "C" });
});

test("parses a 2-span card with no série tier (real gap found live, Session 57)", () => {
  const html = card(1002, "Padrao", "Sub-20", null).repeat(2);
  const refs = parseFerjPartidasListing(html);
  assert.equal(refs.length, 1, "a campeonato with no série span must still be discovered");
  assert.deepEqual(refs[0], { matchId: 1002, campeonato: "Padrao", categoria: "SUB-20", serie: "" });
});

test("a 2-span card never leaks into swallowing the next card's spans", () => {
  const html = card(1002, "Padrao", "Sub-20", null) + card(1003, "Estadual", "Sub-15", "A2");
  const refs = parseFerjPartidasListing(html);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0], { matchId: 1002, campeonato: "Padrao", categoria: "SUB-20", serie: "" });
  assert.deepEqual(refs[1], { matchId: 1003, campeonato: "Estadual", categoria: "SUB-15", serie: "A2" });
});

test("still excludes national/feminino/out-of-scope categories regardless of span count", () => {
  const html =
    card(1004, "Copa do Brasil", "Sub-17", "A").repeat(2) +
    card(1005, "Brasileiro Feminino", "Sub-17", null).repeat(2) +
    card(1006, "Torneio OPG", "Profissional", null).repeat(2);
  const refs = parseFerjPartidasListing(html);
  assert.equal(refs.length, 0);
});

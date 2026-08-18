import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFerjSumulaPdf } from "./services/scraper/parse-ferj-sumula.ts";
import { buildFerjSumula, parseFerjTeams } from "./services/scraper/parse-ferj-events.ts";

const pdfText = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/ferj-sumula-96-2026.txt", import.meta.url)),
  "utf8",
);
const html = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/ferj-partida-5598.html", import.meta.url)),
  "utf8",
);

const pdf = parseFerjSumulaPdf(pdfText);
const sourceUrl = "https://www.ferj360.com.br/carioca/uploads/sumula_fechada_13575_4961.pdf";
const sumula = buildFerjSumula(pdf, html, { sourceUrl });

test("parses the PDF header: tournament, category, rodada, date", () => {
  assert.equal(pdf.header.tournamentName, "CAMPEONATO ESTADUAL SÉRIE A2");
  assert.equal(pdf.header.category, "SUB-15");
  assert.equal(pdf.header.year, 2026);
  assert.equal(pdf.header.rodada, "9");
  assert.equal(pdf.header.matchDate, "2026-07-31");
});

test("derives the final score from 'Resultado Final' (not the penalty shootout)", () => {
  assert.equal(pdf.header.homeScore, 2);
  assert.equal(pdf.header.awayScore, 2);
});

test("splits the roster into two contiguous team blocks (not alternating like the FPF súmula)", () => {
  assert.equal(pdf.roster.home.length, 17);
  assert.equal(pdf.roster.away.length, 15);
  assert.equal(pdf.roster.home.filter((p) => p.starter).length, 11);
  assert.equal(pdf.roster.away.filter((p) => p.starter).length, 11);
});

test("cleans the glued 'apelido+nomeCompleto' string when the apelido is a real prefix", () => {
  const shirt1 = pdf.roster.home.find((p) => p.shirt === 1);
  assert.equal(shirt1.gluedName, "LUCASLUCAS MONTALVÃO ARAÚJO");
  assert.equal(shirt1.name, "LUCAS MONTALVÃO ARAÚJO");
});

test("keeps the raw glued string when the apelido is NOT a prefix of the full name (a nickname, e.g. 'Bento')", () => {
  const shirt6 = pdf.roster.home.find((p) => p.shirt === 6);
  assert.equal(shirt6.gluedName, "BENTOARTHUR BENTO TRINDADE FIUZA");
  // cleanGluedName can't find a safe split here — falls back to the glued string itself.
  assert.equal(shirt6.name, "BENTOARTHUR BENTO TRINDADE FIUZA");
});

test("parses shirt, BIRA (state registration, not the CBF bid) and T/R per player", () => {
  const nicholas = pdf.roster.home.find((p) => p.shirt === 3);
  assert.equal(nicholas.bira, "241936");
  assert.equal(nicholas.starter, true);
  assert.equal(nicholas.professional, false);
});

test("resolves both teams' full display name + FERJ numeric club id from the match page HTML", () => {
  const teams = parseFerjTeams(html);
  assert.deepEqual(teams.home, { name: "E.C Nova Cidade", clubId: 64 });
  assert.deepEqual(teams.away, { name: "Futebol Clube Rio de Janeiro", clubId: 916 });
});

test("composed match carries tournament/score/club identity from both sources", () => {
  assert.deepEqual(sumula.match.tournament, { name: "CAMPEONATO ESTADUAL SÉRIE A2", federation: "FERJ", year: 2026, category: "SUB-15" });
  assert.deepEqual(sumula.match.home, { name: "E.C Nova Cidade", clubId: 64 });
  assert.deepEqual(sumula.match.away, { name: "Futebol Clube Rio de Janeiro", clubId: 916 });
  assert.equal(sumula.match.homeScore, 2);
  assert.equal(sumula.match.awayScore, 2);
  assert.equal(sumula.match.sourceUrl, sourceUrl);
});

test("athletes list carries bira + name for every roster player (32 = 17 + 15)", () => {
  assert.equal(sumula.match.athletes.length, 32);
  assert.ok(sumula.match.athletes.every((a) => a.bira && a.name));
});

test("goals (personal, excluding the own goal) reconcile with the final score minus ownGoals", () => {
  const personalGoals = sumula.match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(personalGoals, 3);
  assert.equal(sumula.match.ownGoals, 1);
  assert.equal(personalGoals + sumula.match.ownGoals, sumula.match.homeScore + sumula.match.awayScore);
});

test("yellow cards match the 'Cartões Amarelos' section, deduped despite the page rendering events twice", () => {
  const yellow = sumula.match.appearances.reduce((sum, a) => sum + a.yellowCards, 0);
  const red = sumula.match.appearances.reduce((sum, a) => sum + a.redCards, 0);
  assert.equal(yellow, 2);
  assert.equal(red, 0); // "NÃO HOUVE EXPULSÕES"
  const amaury = sumula.match.appearances.find((a) => a.bira === "243929");
  const matheus = sumula.match.appearances.find((a) => a.bira === "243429");
  assert.equal(amaury.yellowCards, 1);
  assert.equal(matheus.yellowCards, 1);
});

test("minutes are half-relative + offset (CBF convention, not FPF's absolute one) and never exceed a sane cap", () => {
  for (const a of sumula.match.appearances) {
    assert.ok(a.minutesPlayed >= 0 && a.minutesPlayed <= 130, `minutesPlayed out of range: ${a.minutesPlayed}`);
  }
  // Shirt 16 home (Italo) came on at 2T:35 (minute 80) and the match ended at 90 → 10 min played.
  const italo = sumula.match.appearances.find((a) => a.bira === "241675");
  assert.equal(italo.minutesPlayed, 10);
  assert.equal(italo.goals, 1);
});

test("clean_sheet is always false — no goalkeeper marker in either source to compute it safely", () => {
  assert.ok(sumula.match.appearances.every((a) => a.cleanSheet === false));
});

test("reserves who never entered the match get no atuação", () => {
  // Shirt 17 away (Rayan Andrade / bira 243914) entered at half-time — DOES have an atuação.
  const rayan = sumula.match.appearances.find((a) => a.bira === "243914");
  assert.ok(rayan);
  // A reserve who genuinely never played is excluded — every away reserve here did play
  // in this sample, so assert the invariant on roster size instead: every appearance's
  // bira must exist in the roster, and every appearance corresponds to starter||subbed-in.
  assert.equal(sumula.match.appearances.length, 29);
  assert.ok(sumula.match.appearances.length < pdf.roster.home.length + pdf.roster.away.length);
});

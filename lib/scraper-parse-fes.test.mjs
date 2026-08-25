import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfSumula } from "./services/scraper/parse-cbf-sumula.ts";
import { parseFesCompetitionPage, parseFesClubCrests, fesClubSlug } from "./services/scraper/discovery/fes-discover.ts";

// FES's súmula is the SAME "SÚMULA ON-LINE" PDF template CBF's own competitions use
// (confirmed live against a real fixture) — this suite exists to lock in that
// `parseCbfSumula`/`parse-cbf-events.ts` keep handling it correctly, not to
// duplicate a parser FES doesn't need. See discovery/fes-discover.ts's module doc.

const text = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fes-sumula-portovitoria-ctecolatina-sub20.txt", import.meta.url)),
  "utf8",
);

const { match, roster } = parseCbfSumula(text, {
  sourceUrl: "https://futebolcapixaba.com/site/wp-content/uploads/2026/02/SUB20PORTOVITORIA22FEV.pdf",
  homeSourceKey: "fes-club:porto-vitoria-f-c",
  awaySourceKey: "fes-club:c-t-e-colatina",
  federation: "FES",
  clubFederacao: "FES",
});

test("federation uses the caller's explicit override, never silently defaults to CBF", () => {
  assert.equal(match.tournament.federation, "FES");
});

test("category, score and club names parse the same as a real CBF súmula", () => {
  assert.equal(match.matchCategory, "SUB-20");
  assert.equal(match.homeScore, 11);
  assert.equal(match.awayScore, 0);
  assert.equal(match.home.name, "Porto Vitória F. C.");
  assert.equal(match.home.state, "ES");
  assert.equal(match.away.name, "C T E Colatina");
  assert.equal(match.away.state, "ES");
});

test("club federacao uses the caller's explicit override", () => {
  assert.equal(match.home.federacao, "FES");
  assert.equal(match.away.federacao, "FES");
});

test("injected source keys come through on ParsedClub", () => {
  assert.equal(match.home.sourceKey, "fes-club:porto-vitoria-f-c");
  assert.equal(match.away.sourceKey, "fes-club:c-t-e-colatina");
});

test("roster carries the athlete's real CBF bid directly, no crosswalk needed", () => {
  const roberto = roster.home.find((p) => p.bid === 831865);
  assert.ok(roberto);
  assert.equal(roberto.starter, true);
});

test("goals reconcile with the final score (a hat-trick scorer's shirt-11 goals aren't miscounted despite the glued '1T'/'2T'+shirt digits)", () => {
  const personalGoals = match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(personalGoals, 11);
  assert.equal(match.ownGoals, 0);
  assert.equal(personalGoals, match.homeScore + match.awayScore);

  const roberto = match.appearances.find((a) => a.bid === 831865);
  assert.ok(roberto);
  assert.equal(roberto.goals, 3);
});

// --- discovery/fes-discover.ts: parseFesCompetitionPage --------------------------

test("parseFesCompetitionPage extracts every distinct match link, deduping repeats from sidebar widgets", () => {
  const html = `
    <table><tr><td><a href="https://futebolcapixaba.com/jogos/time-a-x-time-b-1/">Time A x Time B</a></td></tr></table>
    <div class="widget"><a href="https://futebolcapixaba.com/jogos/time-a-x-time-b-1/">Time A x Time B</a></div>
    <a href="https://futebolcapixaba.com/jogos/time-c-x-time-d-2/">Time C x Time D</a>
    <a href="https://futebolcapixaba.com/other-page/">not a match link</a>
  `;
  const refs = parseFesCompetitionPage(html);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.matchUrl), [
    "https://futebolcapixaba.com/jogos/time-a-x-time-b-1/",
    "https://futebolcapixaba.com/jogos/time-c-x-time-d-2/",
  ]);
});

test("parseFesCompetitionPage returns an empty list for a page with no match links", () => {
  const refs = parseFesCompetitionPage("<html><body>no games here</body></html>");
  assert.equal(refs.length, 0);
});

// --- discovery/fes-discover.ts: parseFesClubCrests --------------------------------

test("parseFesClubCrests pairs each standings-table club with its own crest image, keyed by fesClubSlug", () => {
  const html = `
    <table><tr><td>
      <a href="https://futebolcapixaba.com/time/porto-vitoria-f-c/"><span class="team-logo"><img width="125" height="128" src="https://futebolcapixaba.com/site/wp-content/uploads/2018/09/Porto-Vit%C3%B3ria-125x128.png" class="attachment-sportspress-fit-icon size-sportspress-fit-icon wp-post-image" alt="" decoding="async" srcset="..." sizes="100vw" /></span>Porto Vitoria F.C.</a>
    </td></tr><tr><td>
      <a href="https://futebolcapixaba.com/time/e-c-tupy/"><span class="team-logo"><img width="128" height="128" src="https://futebolcapixaba.com/site/wp-content/uploads/2018/09/escudo6-1-128x128.png" alt="" /></span>E.C. Tupy</a>
    </td></tr>
  `;
  const bySlug = parseFesClubCrests(html);
  assert.equal(bySlug.size, 2);
  assert.equal(bySlug.get(fesClubSlug("Porto Vitória F. C.")), "https://futebolcapixaba.com/site/wp-content/uploads/2018/09/Porto-Vit%C3%B3ria-125x128.png");
  assert.equal(bySlug.get(fesClubSlug("E.C. Tupy")), "https://futebolcapixaba.com/site/wp-content/uploads/2018/09/escudo6-1-128x128.png");
});

test("parseFesClubCrests returns an empty map when the page has no standings table", () => {
  const bySlug = parseFesClubCrests("<html><body>no standings here</body></html>");
  assert.equal(bySlug.size, 0);
});

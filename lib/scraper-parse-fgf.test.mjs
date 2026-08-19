import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCbfSumula } from "./services/scraper/parse-cbf-sumula.ts";
import { parseFgfPhaseMatches } from "./services/scraper/discovery/fgf-discover.ts";

// FGF's súmula is the SAME "SÚMULA ON-LINE" PDF template CBF's own competitions use
// (served from CBF's own CDN under `/federacoes/{id}/`) — this suite exists to lock
// in that `parseCbfSumula`/`parse-cbf-events.ts` keep handling it correctly, not to
// duplicate a parser FGF doesn't need. See discovery/fgf-discover.ts's module doc.

const newHostText = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fgf-sumula-57333.txt", import.meta.url)),
  "utf8",
);
const legacyHostText = readFileSync(
  fileURLToPath(new URL("./services/scraper/__fixtures__/fgf-sumula-54034-legacy-host.txt", import.meta.url)),
  "utf8",
);

const newHost = parseCbfSumula(newHostText, {
  sourceUrl: "https://conteudo.cbf.com.br/federacoes/16/sumulas/2026/57333.pdf",
  homeSourceKey: "fgf-club:passo-fundo",
  awaySourceKey: "fgf-club:juventude",
  homeCrestUrl: "https://www.fgf.com.br/public/uploads/clubes/12f64c9360c70b72115ee63b66594abe.jpg",
  awayCrestUrl: "https://www.fgf.com.br/public/uploads/clubes/16172238736064e0c16c05f.jpg",
});

test("federation defaults to CBF in the parsed tournament (FGF súmula carries no federation marker of its own)", () => {
  assert.equal(newHost.match.tournament.federation, "CBF");
});

test("category, score and clube names parse the same as a real CBF súmula", () => {
  assert.equal(newHost.match.matchCategory, "SUB-15");
  assert.equal(newHost.match.homeScore, 2);
  assert.equal(newHost.match.awayScore, 1);
  assert.equal(newHost.match.home.name, "Passo Fundo");
  assert.equal(newHost.match.away.name, "Juventude");
});

test("injected source keys and direct crest URLs come through on ParsedClub", () => {
  assert.equal(newHost.match.home.sourceKey, "fgf-club:passo-fundo");
  assert.equal(newHost.match.home.crestUrl, "https://www.fgf.com.br/public/uploads/clubes/12f64c9360c70b72115ee63b66594abe.jpg");
  assert.equal(newHost.match.away.crestUrl, "https://www.fgf.com.br/public/uploads/clubes/16172238736064e0c16c05f.jpg");
});

test("roster splits into home/away with real CBF bids, no crosswalk needed", () => {
  assert.equal(newHost.roster.home.length, 21);
  assert.equal(newHost.roster.away.length, 23);
  const rafael = newHost.roster.home.find((p) => p.bid === 930206);
  assert.ok(rafael);
  assert.equal(rafael.isGoalkeeper, true);
});

// Regression: found live (Session 55) — FGF's own PDF renders the "Gols" table's
// period column as a bare "1"/"2" instead of "1T"/"2T" (every OTHER section of the
// SAME PDF — Cartões, Substituições — uses the full "1T"/"2T"). Before the fix in
// `parse-cbf-events.ts`, this silently zeroed every goal in the match.
test("goals reconcile with the final score despite the bare '1'/'2' period token in the Gols section", () => {
  const personalGoals = newHost.match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(personalGoals, 3);
  assert.equal(newHost.match.ownGoals, 0);
  assert.equal(personalGoals, newHost.match.homeScore + newHost.match.awayScore);
});

test("second-half goals/cards land in the second half, not miscounted into the first (bare period token still resolves 1 vs 2 correctly)", () => {
  // Breno Rodrigues de Sena (bid 803985) scored at 17:00 in the (bare) "1" period.
  const breno = newHost.match.appearances.find((a) => a.bid === 803985);
  assert.equal(breno.goals, 1);
  assert.equal(breno.minutesPlayed, 78); // subbed off at 33:00 2T -> 45+33=78
});

test("yellow cards total matches the real 'Cartões Amarelos' section (6 player cards; 1 staff card correctly excluded, no shirt number to match)", () => {
  const yellow = newHost.match.appearances.reduce((sum, a) => sum + a.yellowCards, 0);
  assert.equal(yellow, 6);
});

// Legacy-host fixture: same template, older self-hosted URL pattern
// (fgf.com.br/public/sumulas/{id}.pdf) — confirmed live to coexist with the newer
// conteudo.cbf.com.br one depending on when the match was played.
const legacyHost = parseCbfSumula(legacyHostText, { sourceUrl: "https://www.fgf.com.br/public/sumulas/54034.pdf" });

test("the legacy self-hosted súmula variant parses identically (same template, different host)", () => {
  assert.equal(legacyHost.match.home.name, "Progresso Fc");
  assert.equal(legacyHost.match.matchCategory, "SUB-15");
  const personalGoals = legacyHost.match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(personalGoals + legacyHost.match.ownGoals, legacyHost.match.homeScore + legacyHost.match.awayScore);
});

// Regression: found live in FGF's own first real dry-run (Session 55, continuation)
// — a "+MM" stoppage-time goal with NO period digit at all ("+1210PNPhelipe
// Mombach...": time "+12", shirt 10, type "PN") was being misparsed as period="1" +
// shirt="0" by an earlier version of the goal regex — a shirt that exists on no real
// roster, so the goal silently vanished from every appearance (confirmed live: 7 of
// 112 real matches in one competition undercounted goals by exactly 1, always on
// this exact shape). Shirt 10 is cross-checked here via the same match's Cartões
// Amarelos entry for the same player, an independent confirmation this isn't a
// coincidence.
test("a '+MM' stoppage-time goal with NO period digit at all still resolves to the right shirt, not shirt 0", () => {
  const text = readFileSync(
    fileURLToPath(new URL("./services/scraper/__fixtures__/fgf-sumula-54078-extra-time-goal.txt", import.meta.url)),
    "utf8",
  );
  const { match } = parseCbfSumula(text, { sourceUrl: "https://www.fgf.com.br/public/sumulas/54078.pdf" });
  assert.equal(match.homeScore, 2);
  assert.equal(match.awayScore, 1);
  const personalGoals = match.appearances.reduce((sum, a) => sum + a.goals, 0);
  assert.equal(personalGoals, 3);
  assert.equal(personalGoals + match.ownGoals, match.homeScore + match.awayScore);
  assert.ok(!match.appearances.some((a) => a.goals > 0 && a.bid === 0), "no goal should ever land on a fabricated shirt-0 player");
});

// --- discovery/fgf-discover.ts: parseFgfPhaseMatches -----------------------------

test("parseFgfPhaseMatches reads a group-stage card (img immediately inside mandante/visitante)", () => {
  const html = `
    <div class="conteudo-escudos">
      <div class="mandante"><img src="https://x/home.jpg" title="Home FC"></div>
      <div class="contra"><div>1 X 0</div>
        <a href="https://fgf.com.br/jogo/homexaway-comp-01-01-2026">Sobre o Jogo</a>
      </div>
      <div class="visitante"><img src="https://x/away.jpg" title="Away FC"></div>
    </div>`;
  const refs = parseFgfPhaseMatches(html);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], {
    matchUrl: "https://fgf.com.br/jogo/homexaway-comp-01-01-2026",
    homeCrestUrl: "https://x/home.jpg",
    homeName: "Home FC",
    awayCrestUrl: "https://x/away.jpg",
    awayName: "Away FC",
  });
});

// Regression: found live (Session 55) — the knockout-phase layout puts a
// `<span>{sigla}</span>` BEFORE the `<img>` on the "visitante" side only (group-stage
// puts `<img>` first on both sides). Before the fix, every knockout-phase match
// (Oitavas/Quartas/Semifinal — 28 of 112 real matches in one real competition) was
// silently dropped from discovery entirely.
test("parseFgfPhaseMatches reads a knockout-phase card (span before img on the visitante side only)", () => {
  const html = `
    <div class="conteudo-escudos">
      <div class="mandante"><img src="https://x/home.jpg" title="Home FC"><span>HFC</span></div>
      <div class="contra2">2 X 1</div>
      <div class="visitante"><span>AFC</span><img src="https://x/away.jpg" title="Away FC"></div>
      <a href="https://fgf.com.br/jogo/homexaway-comp-01-01-2026">Sobre o Jogo</a>
    </div>`;
  const refs = parseFgfPhaseMatches(html);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].homeName, "Home FC");
  assert.equal(refs[0].awayName, "Away FC");
});

test("a malformed/incomplete card is skipped without throwing", () => {
  const refs = parseFgfPhaseMatches(`<div class="conteudo-escudos"><div class="mandante">no img here</div></div>`);
  assert.equal(refs.length, 0);
});

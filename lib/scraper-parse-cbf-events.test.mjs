import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAppearances } from "./services/scraper/parse-cbf-events.ts";

// Real incident (Session 57): a reserve scores a goal but the súmula's own
// Substituições table never records their "Entrou" — confirmed live in both a
// real FES súmula (SUB-13, Rio Branco x Coimbra F. C., shirt 19 "Emanuel
// Nascimento Santos") and a real FGF súmula (Riograndense x Atlético Clube
// Sulbrasil, shirt 18 "Samuel Souza Cardozo"). Before the fix, that goal was
// silently dropped from the whole match's tally, failing reconciliation for a
// match that was otherwise parsed correctly — not a parser bug, a real gap in
// the source's own data entry that the parser must tolerate, not "correct".
const HOME = "Rio Branco / ES";
const AWAY = "Coimbra F. C. / ES";

const roster = {
  home: [
    { shirt: 6, displayName: "Gabriel", rawBlob: "Gabriel", bid: 918159, isGoalkeeper: false, starter: true, present: true },
  ],
  away: [
    // A genuine starter who never scores or subs — present only so the roster
    // isn't degenerately small.
    { shirt: 1, displayName: "Heitor Moreto", rawBlob: "Heitor Moreto", bid: 861130, isGoalkeeper: true, starter: true, present: true },
    // The reserve who scores with NO matching "Entrou" row below.
    { shirt: 19, displayName: "Santos", rawBlob: "Santos", bid: 963539, isGoalkeeper: false, starter: false, present: true },
  ],
};

const text = `
Gols
Tempo1T/2TNºTipoNome do JogadorEquipe
17:00119NREMANUEL NASCIMENTO SANTOSCoimbra F. C. - ES
26:0016NRGabriel Henriques SilvaRio Branco - ES
NR = Normal | PN = Pênalti | CT = Contra | FT = Falta
Cartões Amarelos
NÃO HOUVE CARTÕES
Cartões Vermelhos
NÃO HOUVE EXPULSÕES
Substituições
Tempo1T/2TEquipeEntrouSaiu
22:002TCoimbra F. C. - ES18 - Lorenzzo Andrade Souza11 - Kaio Henrique Borges
Confederação
`;

const { appearances, ownGoals } = buildAppearances(text, roster, { homeName: HOME, awayName: AWAY, matchCategory: "SUB-13" });

test("a reserve credited with a goal is included even with no matching substitution entry", () => {
  const scorer = appearances.find((a) => a.bid === 963539);
  assert.ok(scorer, "the reserve scorer must still produce an atuação");
  assert.equal(scorer.goals, 1);
  assert.equal(scorer.minutesPlayed, 90 - 17); // lower-bound estimate: on the pitch since their own goal's minute
});

test("total goals across appearances reconcile with the two real goals (no own goals here)", () => {
  const totalGoals = appearances.reduce((n, a) => n + a.goals, 0);
  assert.equal(totalGoals + ownGoals, 2);
});

test("a normal starter untouched by the goal-based fallback still gets an atuação", () => {
  const starterGk = appearances.find((a) => a.bid === 861130);
  assert.ok(starterGk, "the starting goalkeeper should still have an atuação");
  assert.equal(starterGk.minutesPlayed, 90);
});

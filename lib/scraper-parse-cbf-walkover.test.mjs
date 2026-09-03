import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCbfSumula } from "./services/scraper/parse-cbf-sumula.ts";

// Real incident (Session 57): a real FES súmula ("Resultado do 1º Tempo: 0 X 0
// Resultado Final: 3 X 0 W.O") has an official administrative score but zero real
// gameplay — no goals, no substitutions — because the match never happened. Before
// this, CBF/FGF/FES (all sharing this same parser) had no walkover detection at
// all, so every W.O. failed reconciliation ("goals recorded on players (0) do not
// match the final score (3)") and was permanently skipped, retried and re-failed on
// every future ingestion run. FMF already had this exact concept (`isWalkover`).
const walkoverText = `
Campeonato:CAMPEONATO ESTADUAL SUB 11 - Não Profissional/2026Rodada:6
Jogo:Porto Vitória F. C. / ES X Vilavelhense F. C. / ES
Data:13/06/2026Horário:09:00Estádio:Camp Nou - Barcelona / Serra
Resultado do 1º Tempo: 0 X 0     Resultado Final: 3 X 0      W.O
Relação de Jogadores
Porto Vitória F. C. / ES
NºApelidoNome CompletoT/RP/ACBF
1MATHEUS COSTAMatheus da Costa Sil ...T(g)A936847
Vilavelhense F. C. / ES
NºApelidoNome CompletoT/RP/ACBF
1JOAOJoao SilvaT(g)A936848
Comissão Técnica
`;

test("detects a walkover from the 'Resultado Final: N X N W.O' line", () => {
  const { match, isWalkover } = parseCbfSumula(walkoverText, { sourceUrl: "https://example.test/wo.pdf" });
  assert.equal(isWalkover, true);
  assert.equal(match.homeScore, 3);
  assert.equal(match.awayScore, 0);
  // Starters are always "played" regardless of walkover (pre-existing behavior,
  // untouched by this fix) — the real point is zero goals recorded on anyone, which
  // would fail reconciliation on a normal match but must be tolerated on a walkover.
  assert.equal(match.appearances.every((a) => a.goals === 0), true);
});

test("a normal (non-walkover) match never flags isWalkover", () => {
  const normalText = walkoverText.replace(/Resultado Final: 3 X 0\s*W\.O/i, "Resultado Final: 0 X 0");
  const { isWalkover } = parseCbfSumula(normalText, { sourceUrl: "https://example.test/normal.pdf" });
  assert.equal(isWalkover, false);
});

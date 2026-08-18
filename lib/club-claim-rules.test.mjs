import test from "node:test";
import assert from "node:assert/strict";
import {
  filterClubs,
  normalizeClaimDocumentUrl,
  normalizeClaimMessage,
  resolveClubClaimViewState,
} from "./club-claim-rules.ts";

test("valida URL HTTP/HTTPS do documento", () => {
  assert.equal(normalizeClaimDocumentUrl(" https://docs.example.com/prova "), "https://docs.example.com/prova");
  assert.throws(() => normalizeClaimDocumentUrl(""), /document-required/);
  assert.throws(() => normalizeClaimDocumentUrl("ftp://example.com/a"), /invalid-document-url/);
});

test("exige justificativa entre 20 e 2000 caracteres", () => {
  assert.equal(normalizeClaimMessage("  Documento oficial do clube.  "), "Documento oficial do clube.");
  assert.throws(() => normalizeClaimMessage("muito curta"), /message-too-short/);
  assert.throws(() => normalizeClaimMessage("x".repeat(2001)), /message-too-long/);
});

test("resolve estados de posse sem expor outro solicitante", () => {
  const base = { role: "club", userId: "u1", claimedBy: null, ownPendingRequest: false, accountHasPendingOrClaimedClub: false };
  assert.equal(resolveClubClaimViewState({ ...base, claimStatus: "unclaimed" }), "eligible");
  assert.equal(resolveClubClaimViewState({ ...base, claimStatus: "pending" }), "other-pending");
  assert.equal(resolveClubClaimViewState({ ...base, claimStatus: "pending", ownPendingRequest: true }), "own-pending");
  assert.equal(resolveClubClaimViewState({ ...base, claimStatus: "claimed", claimedBy: "u1" }), "own-claimed");
  assert.equal(resolveClubClaimViewState({ ...base, claimStatus: "claimed", claimedBy: "u2" }), "other-claimed");
  assert.equal(resolveClubClaimViewState({ ...base, role: "agent", claimStatus: "unclaimed" }), "agent-view");
  assert.equal(resolveClubClaimViewState({ ...base, claimStatus: "unclaimed", accountHasPendingOrClaimedClub: true }), "account-busy");
});

test("filtra diretório por nome, estado, federação e posse", () => {
  const clubs = [
    { name: "Flamengo", state: "RJ", federation: "FERJ", claimStatus: "claimed" },
    { name: "Fluminense", state: "RJ", federation: "FERJ", claimStatus: "unclaimed" },
    { name: "Palmeiras", state: "SP", federation: "FPF", claimStatus: "pending" },
  ];
  assert.deepEqual(filterClubs(clubs, { query: "flu", state: "RJ", federation: "FERJ", claimStatus: "unclaimed" }), [clubs[1]]);
  assert.deepEqual(filterClubs(clubs, { query: "", state: "SP", federation: "", claimStatus: "" }), [clubs[2]]);
});

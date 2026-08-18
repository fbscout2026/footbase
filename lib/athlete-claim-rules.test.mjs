import test from "node:test";
import assert from "node:assert/strict";
import { normalizeClaimDocumentUrl, normalizeClaimMessage, resolveAthleteClaimViewState } from "./athlete-claim-rules.ts";

test("valida evidência obrigatória", () => {
  assert.equal(normalizeClaimDocumentUrl(" https://example.com/prova "), "https://example.com/prova");
  assert.throws(() => normalizeClaimDocumentUrl("ftp://example.com/a"));
  assert.throws(() => normalizeClaimDocumentUrl("não-é-uma-url"), /invalid-document-url/);
  assert.equal(normalizeClaimMessage(" Representação formal comprovada. "), "Representação formal comprovada.");
  assert.throws(() => normalizeClaimMessage("curta"));
});

test("resolve disponibilidade e verificação", () => {
  const base = { role: "agent", claimStatus: "unclaimed", athleteAgentId: null, ownAgentId: "a1", ownAgentVerified: true, ownLatestRequestStatus: null };
  assert.equal(resolveAthleteClaimViewState(base), "eligible");
  assert.equal(resolveAthleteClaimViewState({ ...base, ownAgentVerified: false }), "unverified-agent");
  assert.equal(resolveAthleteClaimViewState({ ...base, ownLatestRequestStatus: "rejected" }), "rejected");
});

test("resolve pendência própria ou de terceiro", () => {
  const base = { role: "agent", claimStatus: "pending", athleteAgentId: null, ownAgentId: "a1", ownAgentVerified: true, ownLatestRequestStatus: null };
  assert.equal(resolveAthleteClaimViewState(base), "other-pending");
  assert.equal(resolveAthleteClaimViewState({ ...base, ownLatestRequestStatus: "pending" }), "own-pending");
});

test("resolve representação e papéis somente leitura", () => {
  const base = { role: "agent", claimStatus: "claimed", athleteAgentId: "a1", ownAgentId: "a1", ownAgentVerified: true, ownLatestRequestStatus: "approved" };
  assert.equal(resolveAthleteClaimViewState(base), "own-claimed");
  assert.equal(resolveAthleteClaimViewState({ ...base, ownAgentId: "a2" }), "other-claimed");
  assert.equal(resolveAthleteClaimViewState({ ...base, role: "club" }), "club-view");
  assert.equal(resolveAthleteClaimViewState({ ...base, role: "admin" }), "admin-view");
});

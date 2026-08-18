import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  normalizeHttpUrl,
  normalizeOptionalText,
  normalizePhone,
  normalizeRosterRequest,
  normalizeState,
  resolveClubPanelAccess,
  validateCrestInput,
  validateTournamentDates,
} from "./club-panel-rules.ts";

test("resolve o acesso sem confiar em um clube enviado pela conta", () => {
  assert.equal(resolveClubPanelAccess({ role: "club", accountStatus: "approved", claimedClubId: "c1" }), "owner");
  assert.equal(resolveClubPanelAccess({ role: "club", accountStatus: "approved", claimedClubId: null }), "unclaimed");
  assert.equal(resolveClubPanelAccess({ role: "agent", accountStatus: "approved", claimedClubId: null }), "forbidden");
  assert.equal(resolveClubPanelAccess({ role: "admin", accountStatus: "approved", claimedClubId: null, targetClubId: "c2" }), "admin-readonly");
  assert.equal(resolveClubPanelAccess({ role: "admin", accountStatus: "approved", claimedClubId: null }), "unavailable");
  assert.equal(resolveClubPanelAccess({ role: "club", accountStatus: "pending", claimedClubId: "c1" }), "unavailable");
});

test("normaliza campos operacionais e recusa formatos inseguros", () => {
  assert.equal(normalizeOptionalText("  São   Paulo  ", 20), "São Paulo");
  assert.equal(normalizeState("sp"), "SP");
  assert.equal(normalizeEmail(" CONTATO@CLUBE.COM "), "contato@clube.com");
  assert.equal(normalizePhone("+55 (11) 99999-9999"), "+55 (11) 99999-9999");
  assert.equal(normalizeHttpUrl("https://footbase.com.br"), "https://footbase.com.br/");
  assert.throws(() => normalizeHttpUrl("javascript:alert(1)"), /invalid-url/);
  assert.throws(() => normalizeState("São Paulo"), /too-long|invalid-state/);
  assert.throws(() => normalizeEmail("sem-arroba"), /invalid-email/);
});

test("valida datas de torneio", () => {
  assert.doesNotThrow(() => validateTournamentDates("2026-08-01", "2026-12-10"));
  assert.throws(() => validateTournamentDates("2026-12-10", "2026-08-01"), /invalid-date-range/);
  assert.throws(() => validateTournamentDates("10-08-2026", null), /invalid-date/);
});

test("normaliza todos os tipos de solicitação de elenco", () => {
  const base = { bid: 123, justification: "Comprovante oficial anexado para análise." };
  assert.equal(normalizeRosterRequest({ ...base, action: "add", proposedCategory: "Sub-17" }).bid, 123);
  assert.equal(normalizeRosterRequest({ ...base, action: "remove" }).proposedCategory, null);
  assert.equal(normalizeRosterRequest({ ...base, action: "change_category", proposedCategory: "Sub-20" }).action, "change_category");
  assert.equal(normalizeRosterRequest({ action: "register_missing_bid", informedBid: "CBF-99", informedName: "Atleta Teste", proposedCategory: "Sub-15", justification: base.justification }).bid, null);
  assert.throws(() => normalizeRosterRequest({ ...base, action: "add" }), /category-required/);
  assert.throws(() => normalizeRosterRequest({ ...base, action: "remove", proposedCategory: "Sub-17" }), /unexpected-category/);
  assert.throws(() => normalizeRosterRequest({ action: "register_missing_bid", informedBid: "CBF-99", justification: base.justification }), /invalid-missing-bid-request/);
  assert.throws(() => normalizeRosterRequest({ ...base, action: "add", proposedCategory: "Sub-17", justification: "curta" }), /invalid-length/);
});

test("aplica limites básicos do escudo", () => {
  assert.doesNotThrow(() => validateCrestInput({ mimeType: "image/png", size: 1000 }));
  assert.throws(() => validateCrestInput({ mimeType: "image/svg+xml", size: 1000 }), /invalid-image-type/);
  assert.throws(() => validateCrestInput({ mimeType: "image/png", size: 6 * 1024 * 1024 }), /invalid-image-size/);
});

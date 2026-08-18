import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_EDITABLE_ATHLETE_FIELDS,
  AGENT_EDITABLE_PROFILE_FIELDS,
  normalizeOptionalText,
  normalizeYouTubeUrl,
  validateAthleteEdit,
  validateCorrection,
} from "./agent-panel-rules.ts";

test("mantem allowlists exatas do painel do agente", () => {
  assert.deepEqual(AGENT_EDITABLE_PROFILE_FIELDS, [
    "full_name", "agency_name", "markets", "instagram", "phone", "contact_email", "bio",
  ]);
  assert.deepEqual(AGENT_EDITABLE_ATHLETE_FIELDS, [
    "apelido", "dominant_foot", "height_cm", "weight_kg", "posicao_secundaria", "youtube_video_url",
  ]);
});

test("normaliza textos opcionais e respeita limite", () => {
  assert.equal(normalizeOptionalText("  Prime Sports  ", 30), "Prime Sports");
  assert.equal(normalizeOptionalText("   ", 30), null);
  assert.throws(() => normalizeOptionalText("abcd", 3), /text-too-long/);
});

test("aceita somente URLs HTTP do YouTube", () => {
  assert.equal(normalizeYouTubeUrl(""), null);
  assert.match(normalizeYouTubeUrl("https://youtu.be/abc"), /^https:\/\/youtu\.be/);
  assert.throws(() => normalizeYouTubeUrl("https://example.com/a"), /invalid-youtube-url/);
});

test("valida limites físicos do atleta", () => {
  const valid = { apelido: null, dominant_foot: "right", height_cm: 180, weight_kg: 75, posicao_secundaria: "CB", youtube_video_url: null };
  assert.deepEqual(validateAthleteEdit(valid), valid);
  assert.throws(() => validateAthleteEdit({ ...valid, height_cm: 99 }), /invalid-height/);
  assert.throws(() => validateAthleteEdit({ ...valid, weight_kg: 151 }), /invalid-weight/);
});

test("correção exige campo permitido, valor e justificativa", () => {
  const result = validateCorrection({ field: "name", suggestedValue: "Novo nome", reason: "Documento oficial", proofUrl: "" });
  assert.equal(result.field, "name");
  assert.equal(result.proofUrl, null);
  assert.throws(() => validateCorrection({ field: "apelido", suggestedValue: "x", reason: "y", proofUrl: "" }), /invalid-correction-field/);
  assert.throws(() => validateCorrection({ field: "name", suggestedValue: "", reason: "y", proofUrl: "" }), /suggested-value-required/);
  assert.throws(() => validateCorrection({ field: "name", suggestedValue: "x", reason: "", proofUrl: "" }), /reason-required/);
});

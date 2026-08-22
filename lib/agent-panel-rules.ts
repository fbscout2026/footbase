export const AGENT_EDITABLE_ATHLETE_FIELDS = [
  "apelido", "dominant_foot", "height_cm", "weight_kg", "posicao_secundaria", "youtube_video_url",
] as const;

export const AGENT_EDITABLE_PROFILE_FIELDS = [
  "full_name", "agency_name", "markets", "instagram", "phone", "contact_email", "bio",
] as const;

// Session 56 ("FB-ID: chave suprema") — `fb_id` deliberately excluded, on
// explicit user confirmation. It's an internal permanent identity now, not "a
// fact about the athlete" an agent could know/correct; a wrong source-side
// number is an atleta_fontes/admin curation concern, never an agent
// correction request.
export const CORRECTION_FIELDS = [
  "fifa_id", "name", "birth_date", "nacionalidade", "tem_passaporte", "passaporte",
  "main_position", "inicio_carreira", "contract_end_date", "current_club_id", "current_category",
  "experiencia_internacional", "jogos_suspenso", "performance_data",
] as const;

export type CorrectionField = (typeof CORRECTION_FIELDS)[number];
export type PositionCode = "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";
export type DominantFoot = "left" | "right" | "both";

export interface AthleteEditInput {
  apelido: string | null;
  dominant_foot: DominantFoot | null;
  height_cm: number | null;
  weight_kg: number | null;
  posicao_secundaria: PositionCode | null;
  youtube_video_url: string | null;
}

export function normalizeOptionalText(value: string, maxLength: number): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error("text-too-long");
  return normalized;
}

export function normalizeOptionalUrl(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new URL(normalized);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid-url");
  return parsed.toString();
}

export function normalizeYouTubeUrl(value: string): string | null {
  const normalized = normalizeOptionalUrl(value);
  if (!normalized) return null;
  const hostname = new URL(normalized).hostname.replace(/^www\./, "");
  if (!["youtube.com", "youtu.be"].includes(hostname)) throw new Error("invalid-youtube-url");
  return normalized;
}

export function validateAthleteEdit(input: AthleteEditInput): AthleteEditInput {
  if (input.height_cm !== null && (input.height_cm < 100 || input.height_cm > 220)) throw new Error("invalid-height");
  if (input.weight_kg !== null && (input.weight_kg < 30 || input.weight_kg > 150)) throw new Error("invalid-weight");
  return input;
}

export function validateCorrection(input: { field: string; suggestedValue: string; reason: string; proofUrl: string }) {
  if (!CORRECTION_FIELDS.includes(input.field as CorrectionField)) throw new Error("invalid-correction-field");
  const suggestedValue = input.suggestedValue.trim();
  const reason = input.reason.trim();
  if (!suggestedValue) throw new Error("suggested-value-required");
  if (!reason) throw new Error("reason-required");
  if (suggestedValue.length > 1000 || reason.length > 2000) throw new Error("text-too-long");
  return { field: input.field as CorrectionField, suggestedValue, reason, proofUrl: normalizeOptionalUrl(input.proofUrl) };
}

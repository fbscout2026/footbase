import type { SupabaseClient } from "@supabase/supabase-js";
import type { AthleteEditInput, CorrectionField } from "@/lib/agent-panel-rules";

export interface AgentProfileRecord {
  id: string; userId: string; fullName: string; agencyName: string | null;
  verifiedStatus: "pending" | "verified" | "rejected"; licenseLevel: string | null;
  markets: string[]; instagram: string | null; phone: string | null;
  contactEmail: string | null; bio: string | null;
}

export interface AgentAthleteRecord {
  fbId: number; fifaId: string | null; name: string; apelido: string | null; birthDate: string;
  nationality: string; hasPassport: boolean; passport: string | null;
  mainPosition: string | null; secondaryPosition: string | null;
  dominantFoot: "left" | "right" | "both" | null; heightCm: number | null; weightKg: number | null;
  currentClubId: string | null; currentCategory: string | null; contractEndDate: string | null;
  careerStart: number | null; internationalExperience: boolean; suspendedGames: number;
  youtubeVideoUrl: string | null;
}

export interface CorrectionRequestRecord {
  id: string; fbId: number; field: CorrectionField; currentValue: string | null;
  suggestedValue: string; reason: string; proofUrl: string | null;
  status: "pending" | "approved" | "rejected"; createdAt: string;
}

export interface AgentFavoriteClubRecord { id: string; clubId: string; name: string; crestUrl: string | null; }
export interface AgentFavoriteTournamentRecord { id: string; torneioId: string; name: string; category: string | null; year: number | null; }

export interface AgentPanelData {
  agent: AgentProfileRecord; athletes: AgentAthleteRecord[];
  corrections: CorrectionRequestRecord[]; favoriteCount: number;
  favoriteClubs: AgentFavoriteClubRecord[]; favoriteTournaments: AgentFavoriteTournamentRecord[];
}

type AgentRow = {
  id: string; user_id: string; full_name: string; agency_name: string | null;
  verified_status: AgentProfileRecord["verifiedStatus"]; license_level: string | null;
  markets: string[] | null; instagram: string | null; phone: string | null;
  contact_email: string | null; bio: string | null;
};

function mapAgent(row: AgentRow): AgentProfileRecord {
  return {
    id: row.id, userId: row.user_id, fullName: row.full_name, agencyName: row.agency_name,
    verifiedStatus: row.verified_status, licenseLevel: row.license_level, markets: row.markets ?? [],
    instagram: row.instagram, phone: row.phone, contactEmail: row.contact_email, bio: row.bio,
  };
}

const AGENT_COLUMNS = "id,user_id,full_name,agency_name,verified_status,license_level,markets,instagram,phone,contact_email,bio";

export async function listAgents(client: SupabaseClient): Promise<AgentProfileRecord[]> {
  const { data, error } = await client.from("agentes").select(AGENT_COLUMNS).order("full_name");
  if (error) throw error;
  return (data as AgentRow[]).map(mapAgent);
}

export async function loadAgentPanel(client: SupabaseClient, userId: string): Promise<AgentPanelData> {
  const { data: agentData, error: agentError } = await client
    .from("agentes").select(AGENT_COLUMNS).eq("user_id", userId).single();
  if (agentError) throw agentError;
  const agent = mapAgent(agentData as AgentRow);

  const [athletesResult, correctionsResult, favoritesResult, favoriteClubsResult, favoriteTournamentsResult] = await Promise.all([
    client.from("atletas")
      .select("fb_id,fifa_id,name,apelido,birth_date,nacionalidade,tem_passaporte,passaporte,main_position,posicao_secundaria,dominant_foot,height_cm,weight_kg,inicio_carreira,current_club_id,current_category,contract_end_date,experiencia_internacional,jogos_suspenso,youtube_video_url")
      .eq("agent_id", agent.id).eq("claim_status", "claimed").order("name"),
    client.from("solicitacoes_correcao")
      .select("id,fb_id_atleta,field_name,current_value,suggested_value,reason,comprovante_url,status,created_at")
      .eq("requested_by", userId).order("created_at", { ascending: false }),
    client.from("favoritos").select("id", { count: "exact", head: true }).eq("user_id", userId),
    client.from("favoritos_clube").select("id,club_id,clubes(name,webp_crest_url,crest_storage_path)").eq("user_id", userId).order("created_at", { ascending: false }),
    client.from("favoritos_torneio").select("id,torneio_id,torneios(name,category,year)").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  if (athletesResult.error) throw athletesResult.error;
  if (correctionsResult.error) throw correctionsResult.error;
  if (favoritesResult.error) throw favoritesResult.error;
  if (favoriteClubsResult.error) throw favoriteClubsResult.error;
  if (favoriteTournamentsResult.error) throw favoriteTournamentsResult.error;

  const athletes = (athletesResult.data ?? []).map((row) => ({
    fbId: Number(row.fb_id), fifaId: row.fifa_id, name: row.name, apelido: row.apelido, birthDate: row.birth_date,
    nationality: row.nacionalidade, hasPassport: row.tem_passaporte, passport: row.passaporte,
    mainPosition: row.main_position, secondaryPosition: row.posicao_secundaria,
    dominantFoot: row.dominant_foot, heightCm: row.height_cm, weightKg: row.weight_kg,
    currentClubId: row.current_club_id, currentCategory: row.current_category,
    contractEndDate: row.contract_end_date, careerStart: row.inicio_carreira,
    internationalExperience: row.experiencia_internacional, suspendedGames: row.jogos_suspenso,
    youtubeVideoUrl: row.youtube_video_url,
  })) as AgentAthleteRecord[];

  const corrections = (correctionsResult.data ?? []).map((row) => ({
    id: row.id, fbId: Number(row.fb_id_atleta), field: row.field_name, currentValue: row.current_value,
    suggestedValue: row.suggested_value, reason: row.reason, proofUrl: row.comprovante_url,
    status: row.status, createdAt: row.created_at,
  })) as CorrectionRequestRecord[];

  const favoriteClubs = (favoriteClubsResult.data ?? []).map((item) => {
    const favClub = Array.isArray(item.clubes) ? item.clubes[0] : item.clubes;
    const crestUrl = favClub?.crest_storage_path ? `/api/clube/crest?club=${item.club_id}` : favClub?.webp_crest_url ?? null;
    return { id: item.id, clubId: String(item.club_id), name: favClub?.name ?? "—", crestUrl };
  });
  const favoriteTournaments = (favoriteTournamentsResult.data ?? []).map((item) => {
    const torneio = Array.isArray(item.torneios) ? item.torneios[0] : item.torneios;
    return { id: item.id, torneioId: String(item.torneio_id), name: torneio?.name ?? "—", category: torneio?.category ?? null, year: torneio?.year ?? null };
  });

  return { agent, athletes, corrections, favoriteCount: favoritesResult.count ?? 0, favoriteClubs, favoriteTournaments };
}

export async function updateAgentProfile(client: SupabaseClient, id: string, input: {
  fullName: string; agencyName: string | null; markets: string[]; instagram: string | null;
  phone: string | null; contactEmail: string | null; bio: string | null;
}): Promise<void> {
  const { error } = await client.from("agentes").update({
    full_name: input.fullName, agency_name: input.agencyName, markets: input.markets,
    instagram: input.instagram, phone: input.phone, contact_email: input.contactEmail, bio: input.bio,
  }).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function updateClaimedAthlete(client: SupabaseClient, fbId: number, input: AthleteEditInput): Promise<void> {
  const { error } = await client.from("atletas").update(input).eq("fb_id", fbId).select("fb_id").single();
  if (error) throw error;
}

export async function createCorrectionRequest(client: SupabaseClient, input: {
  userId: string; fbId: number; field: CorrectionField; currentValue: string | null;
  suggestedValue: string; reason: string; proofUrl: string | null;
}): Promise<CorrectionRequestRecord> {
  const { data, error } = await client.from("solicitacoes_correcao").insert({
    requested_by: input.userId, fb_id_atleta: input.fbId, field_name: input.field,
    current_value: input.currentValue, suggested_value: input.suggestedValue,
    reason: input.reason, comprovante_url: input.proofUrl,
  }).select("id,fb_id_atleta,field_name,current_value,suggested_value,reason,comprovante_url,status,created_at").single();
  if (error) throw error;
  return {
    id: data.id, fbId: Number(data.fb_id_atleta), field: data.field_name, currentValue: data.current_value,
    suggestedValue: data.suggested_value, reason: data.reason, proofUrl: data.comprovante_url,
    status: data.status, createdAt: data.created_at,
  } as CorrectionRequestRecord;
}

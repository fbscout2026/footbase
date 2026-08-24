import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubPanelAccess, RosterRequestAction, TournamentStatus } from "@/lib/club-panel-rules";
import { formatAthleteCode } from "@/lib/format";

export type SourceStatus = "club_declared" | "admin_confirmed" | "official_confirmed";
export type ReviewStatus = "pending" | "approved" | "rejected" | "conflict";

export interface ManagedClubRecord {
  id: string;
  name: string;
  cnpj: string | null;
  state: string | null;
  federation: string | null;
  displayName: string | null;
  description: string | null;
  headquartersAddress: string | null;
  headquartersCity: string | null;
  headquartersState: string | null;
  phone: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  crestUrl: string | null;
  claimStatus: string;
  claimedBy: string | null;
}

export interface ClubPanelAthlete {
  fbId: number;
  name: string;
  nickname: string | null;
  position: string | null;
  category: string | null;
  contractEndDate: string | null;
}

export interface ClubTournamentRecord {
  id: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  status: TournamentStatus;
  sourceStatus: SourceStatus;
}

export interface ClubCategoryRecord {
  id: string;
  category: string;
  status: "active" | "archived";
  displayOrder: number;
  sourceStatus: SourceStatus;
  tournaments: ClubTournamentRecord[];
}

export interface ClubRosterRequestRecord {
  id: string;
  fbId: number | null;
  informedBid: string | null;
  informedName: string | null;
  action: RosterRequestAction;
  currentCategory: string | null;
  proposedCategory: string | null;
  justification: string;
  evidenceUrl: string | null;
  status: ReviewStatus;
  createdAt: string;
}

export interface ClubCorrectionRecord {
  id: string;
  fieldName: string;
  currentValue: string | null;
  suggestedValue: string;
  reason: string;
  evidenceUrl: string | null;
  status: ReviewStatus;
  createdAt: string;
}

export interface ClubDivergenceRecord {
  id: string;
  domain: "profile" | "roster" | "category" | "tournament";
  fieldName: string | null;
  officialSource: string;
  status: "open" | "resolved_club" | "resolved_official" | "dismissed";
  createdAt: string;
}

export interface ClubFavoriteRecord {
  id: string;
  fbId: number;
  rating: number;
  notes: string | null;
  athleteName: string;
  athleteNickname: string | null;
  position: string | null;
  category: string | null;
}

export interface ClubFavoriteClubRecord {
  id: string;
  clubId: string;
  name: string;
  crestUrl: string | null;
}

export interface ClubFavoriteTournamentRecord {
  id: string;
  torneioId: string;
  name: string;
  category: string | null;
  year: number | null;
}

export interface ClubPanelData {
  access: ClubPanelAccess;
  club: ManagedClubRecord;
  squad: ClubPanelAthlete[];
  categories: ClubCategoryRecord[];
  rosterRequests: ClubRosterRequestRecord[];
  corrections: ClubCorrectionRecord[];
  divergences: ClubDivergenceRecord[];
  favorites: ClubFavoriteRecord[];
  favoriteClubs: ClubFavoriteClubRecord[];
  favoriteTournaments: ClubFavoriteTournamentRecord[];
  availableCategories: string[];
}

const CLUB_FIELDS = "id,name,cnpj,state,federacao,display_name,description,headquarters_address,headquarters_city,headquarters_state,phone,whatsapp,contact_email,website_url,instagram_url,crest_storage_path,webp_crest_url,claim_status,reivindicado_por";

export async function listManagedClubs(client: SupabaseClient): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await client.from("clubes").select("id,name").eq("claim_status", "claimed").order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function findClaimedClubId(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from("clubes").select("id").eq("reivindicado_por", userId).eq("claim_status", "claimed").maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function loadClubPanel(client: SupabaseClient, clubId: string, access: ClubPanelAccess): Promise<ClubPanelData> {
  const clubResult = await client.from("clubes").select(CLUB_FIELDS).eq("id", clubId).single();
  if (clubResult.error) throw clubResult.error;
  const row = clubResult.data as Record<string, unknown>;
  // Favorites belong to the club's owning account (`reivindicado_por`), never the
  // viewer — an admin supervising via `?club=` must see the CLUB's favorites, not
  // their own. Filtering explicitly also matters for correctness under RLS: the
  // `favoritos`/`favoritos_clube`/`favoritos_torneio` policies let an admin read
  // every row in the table, so an unfiltered query here would silently mix in
  // every other account's favorites instead of erroring.
  const ownerId = row.reivindicado_por as string | null;

  const [squadResult, categoriesResult, tournamentsResult, rosterResult, correctionResult, divergenceResult, favoritesResult, favoriteClubsResult, favoriteTournamentsResult, categoryOrderResult] = await Promise.all([
    client.from("atletas").select("fb_id,name,apelido,main_position,current_category,contract_end_date").eq("current_club_id", clubId).order("current_category").order("name"),
    client.from("club_categorias").select("id,category,status,display_order,source_status").eq("club_id", clubId).order("display_order").order("category"),
    client.from("club_categoria_torneios").select("id,club_category_id,declared_name,season,start_date,end_date,status,source_status,torneios(name)").order("created_at", { ascending: false }),
    client.from("club_elenco_solicitacoes").select("id,fb_id_atleta,informed_bid,informed_name,action,current_category_snapshot,proposed_category,justification,evidence_url,status,created_at").eq("club_id", clubId).order("created_at", { ascending: false }),
    client.from("club_correction_requests").select("id,field_name,current_value,suggested_value,reason,evidence_url,status,created_at").eq("club_id", clubId).order("created_at", { ascending: false }),
    client.from("club_divergencias").select("id,domain,field_name,official_source,status,created_at").eq("club_id", clubId).order("created_at", { ascending: false }),
    ownerId
      ? client.from("favoritos").select("id,fb_id_atleta,nota,notas,atletas(name,apelido,main_position,current_category)").eq("user_id", ownerId).order("nota", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ownerId
      ? client.from("favoritos_clube").select("id,club_id,clubes(name,webp_crest_url,crest_storage_path)").eq("user_id", ownerId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ownerId
      ? client.from("favoritos_torneio").select("id,torneio_id,torneios(name,category,year)").eq("user_id", ownerId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    client.from("categoria_ordem").select("categoria").order("rank"),
  ]);
  for (const result of [squadResult, categoriesResult, tournamentsResult, rosterResult, correctionResult, divergenceResult, favoritesResult, favoriteClubsResult, favoriteTournamentsResult, categoryOrderResult]) {
    if (result.error) throw result.error;
  }

  const tournaments = (tournamentsResult.data ?? []) as Array<Record<string, unknown>>;
  return {
    access,
    club: {
      id: String(row.id), name: String(row.name), cnpj: row.cnpj as string | null, state: row.state as string | null,
      federation: row.federacao as string | null, displayName: row.display_name as string | null, description: row.description as string | null,
      headquartersAddress: row.headquarters_address as string | null, headquartersCity: row.headquarters_city as string | null,
      headquartersState: row.headquarters_state as string | null, phone: row.phone as string | null, whatsapp: row.whatsapp as string | null,
      contactEmail: row.contact_email as string | null, websiteUrl: row.website_url as string | null, instagramUrl: row.instagram_url as string | null,
      crestUrl: row.crest_storage_path ? `/api/clube/crest?club=${row.id}` : row.webp_crest_url as string | null,
      claimStatus: String(row.claim_status), claimedBy: row.reivindicado_por as string | null,
    },
    squad: (squadResult.data ?? []).map((item) => ({ fbId: Number(item.fb_id), name: item.name, nickname: item.apelido, position: item.main_position, category: item.current_category, contractEndDate: item.contract_end_date })),
    categories: ((categoriesResult.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id), category: String(item.category), status: item.status as "active" | "archived", displayOrder: Number(item.display_order), sourceStatus: item.source_status as SourceStatus,
      tournaments: tournaments.filter((t) => t.club_category_id === item.id).map((t) => {
        const official = Array.isArray(t.torneios) ? t.torneios[0] : t.torneios;
        return { id: String(t.id), name: String((official as { name?: string } | null)?.name ?? t.declared_name ?? ""), season: String(t.season), startDate: t.start_date as string | null, endDate: t.end_date as string | null, status: t.status as TournamentStatus, sourceStatus: t.source_status as SourceStatus };
      }),
    })),
    rosterRequests: (rosterResult.data ?? []).map((item) => ({ id: item.id, fbId: item.fb_id_atleta === null ? null : Number(item.fb_id_atleta), informedBid: item.informed_bid, informedName: item.informed_name, action: item.action as RosterRequestAction, currentCategory: item.current_category_snapshot, proposedCategory: item.proposed_category, justification: item.justification, evidenceUrl: item.evidence_url, status: item.status as ReviewStatus, createdAt: item.created_at })),
    corrections: (correctionResult.data ?? []).map((item) => ({ id: item.id, fieldName: item.field_name, currentValue: item.current_value, suggestedValue: item.suggested_value, reason: item.reason, evidenceUrl: item.evidence_url, status: item.status as ReviewStatus, createdAt: item.created_at })),
    divergences: (divergenceResult.data ?? []).map((item) => ({ id: item.id, domain: item.domain as ClubDivergenceRecord["domain"], fieldName: item.field_name, officialSource: item.official_source, status: item.status as ClubDivergenceRecord["status"], createdAt: item.created_at })),
    favorites: (favoritesResult.data ?? []).map((item) => {
      const athlete = Array.isArray(item.atletas) ? item.atletas[0] : item.atletas;
      return { id: item.id, fbId: Number(item.fb_id_atleta), rating: item.nota ?? 50, notes: item.notas, athleteName: athlete?.name ?? formatAthleteCode(Number(item.fb_id_atleta)), athleteNickname: athlete?.apelido ?? null, position: athlete?.main_position ?? null, category: athlete?.current_category ?? null };
    }),
    favoriteClubs: (favoriteClubsResult.data ?? []).map((item) => {
      const favClub = Array.isArray(item.clubes) ? item.clubes[0] : item.clubes;
      const crestUrl = favClub?.crest_storage_path ? `/api/clube/crest?club=${item.club_id}` : favClub?.webp_crest_url ?? null;
      return { id: item.id, clubId: String(item.club_id), name: favClub?.name ?? "—", crestUrl };
    }),
    favoriteTournaments: (favoriteTournamentsResult.data ?? []).map((item) => {
      const torneio = Array.isArray(item.torneios) ? item.torneios[0] : item.torneios;
      return { id: item.id, torneioId: String(item.torneio_id), name: torneio?.name ?? "—", category: torneio?.category ?? null, year: torneio?.year ?? null };
    }),
    availableCategories: (categoryOrderResult.data ?? []).map((item) => item.categoria),
  };
}

export async function updateClubOperationalProfile(client: SupabaseClient, clubId: string, input: Record<string, string | null>): Promise<void> {
  const { error } = await client.from("clubes").update(input).eq("id", clubId);
  if (error) throw error;
}

export async function createClubCategory(client: SupabaseClient, input: { clubId: string; category: string; displayOrder: number; userId: string }): Promise<void> {
  const { error } = await client.from("club_categorias").insert({ club_id: input.clubId, category: input.category, display_order: input.displayOrder, status: "active", declared_by: input.userId });
  if (error) throw error;
}

export async function setClubCategoryStatus(client: SupabaseClient, id: string, status: "active" | "archived"): Promise<void> {
  const { error } = await client.from("club_categorias").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function createClubTournament(client: SupabaseClient, input: { categoryId: string; name: string; season: string; startDate: string | null; endDate: string | null; status: TournamentStatus; userId: string }): Promise<void> {
  const { error } = await client.from("club_categoria_torneios").insert({ club_category_id: input.categoryId, declared_name: input.name, season: input.season, start_date: input.startDate, end_date: input.endDate, status: input.status, declared_by: input.userId });
  if (error) throw error;
}

export async function createRosterRequest(client: SupabaseClient, input: { clubId: string; userId: string; fbId: number | null; informedBid: string | null; informedName: string | null; action: RosterRequestAction; proposedCategory: string | null; justification: string; evidenceUrl: string | null }): Promise<void> {
  const { error } = await client.from("club_elenco_solicitacoes").insert({ club_id: input.clubId, requested_by: input.userId, fb_id_atleta: input.fbId, informed_bid: input.informedBid, informed_name: input.informedName, action: input.action, proposed_category: input.proposedCategory, justification: input.justification, evidence_url: input.evidenceUrl });
  if (error) throw error;
}

export async function createClubCorrection(client: SupabaseClient, input: { clubId: string; userId: string; fieldName: string; suggestedValue: string; reason: string; evidenceUrl: string | null }): Promise<void> {
  const { error } = await client.from("club_correction_requests").insert({ club_id: input.clubId, requested_by: input.userId, field_name: input.fieldName, suggested_value: input.suggestedValue, reason: input.reason, evidence_url: input.evidenceUrl });
  if (error) throw error;
}

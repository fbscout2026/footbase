import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveClubClaimViewState,
  type ClaimStatus,
  type ClubClaimViewState,
  type SessionRole,
} from "@/lib/club-claim-rules";

export interface ClubSummaryRecord {
  id: string;
  name: string;
  state: string | null;
  federation: string | null;
  crestUrl: string | null;
  claimStatus: ClaimStatus;
  athleteCount: number;
  activeCategories: string[];
  tournaments: string[];
}

export interface ClubSquadMemberRecord {
  bid: number;
  name: string;
  nickname: string | null;
  mainPosition: string | null;
  category: string | null;
  contractEndDate: string | null;
}

export interface ClubClaimRequestRecord {
  id: string;
  documentUrl: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface ClubProfileData {
  club: ClubSummaryRecord;
  squad: ClubSquadMemberRecord[];
  claimViewState: ClubClaimViewState;
  ownRequest: ClubClaimRequestRecord | null;
}

type ClubViewRow = {
  id: string;
  name: string;
  state: string | null;
  federacao: string | null;
  webp_crest_url: string | null;
  reivindicado_por: string | null;
  claim_status: ClaimStatus;
  total_atletas: number | null;
  categorias_ativas: string[] | null;
  torneios_em_disputa: string[] | null;
};

const CLUB_COLUMNS = "id,name,state,federacao,webp_crest_url,reivindicado_por,claim_status,total_atletas,categorias_ativas,torneios_em_disputa";

function mapClub(row: ClubViewRow): ClubSummaryRecord {
  return {
    id: row.id,
    name: row.name.toUpperCase(),
    state: row.state,
    federation: row.federacao,
    crestUrl: row.webp_crest_url,
    claimStatus: row.claim_status,
    athleteCount: row.total_atletas ?? 0,
    activeCategories: row.categorias_ativas ?? [],
    tournaments: row.torneios_em_disputa ?? [],
  };
}

function mapClaim(row: {
  id: string; documento_url: string; mensagem: string; status: ClubClaimRequestRecord["status"]; created_at: string;
}): ClubClaimRequestRecord {
  return {
    id: row.id,
    documentUrl: row.documento_url,
    message: row.mensagem,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listClubs(client: SupabaseClient): Promise<ClubSummaryRecord[]> {
  const { data, error } = await client.from("view_clube_resumo").select(CLUB_COLUMNS).order("name");
  if (error) throw error;
  return (data as ClubViewRow[]).map(mapClub);
}

export async function loadClubProfile(
  client: SupabaseClient,
  clubId: string,
  session: { userId: string; role: SessionRole },
): Promise<ClubProfileData> {
  const { data: clubData, error: clubError } = await client
    .from("view_clube_resumo").select(CLUB_COLUMNS).eq("id", clubId).single();
  if (clubError) throw clubError;
  const row = clubData as ClubViewRow;

  const [squadResult, requestResult, pendingResult, claimedResult] = await Promise.all([
    client.from("atletas")
      .select("bid,name,apelido,main_position,current_category,contract_end_date")
      .eq("current_club_id", clubId).order("name"),
    client.from("solicitacoes_reivindicacao")
      .select("id,documento_url,mensagem,status,created_at")
      .eq("tipo", "clube").eq("clube_id", clubId).eq("requested_by", session.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    session.role === "club"
      ? client.from("solicitacoes_reivindicacao")
          .select("id", { count: "exact", head: true })
          .eq("tipo", "clube").eq("requested_by", session.userId).eq("status", "pending")
      : Promise.resolve({ count: 0, error: null }),
    session.role === "club"
      ? client.from("clubes")
          .select("id", { count: "exact", head: true }).eq("reivindicado_por", session.userId)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (squadResult.error) throw squadResult.error;
  if (requestResult.error) throw requestResult.error;
  if (pendingResult.error) throw pendingResult.error;
  if (claimedResult.error) throw claimedResult.error;

  const ownRequest = requestResult.data
    ? mapClaim(requestResult.data as {
        id: string; documento_url: string; mensagem: string;
        status: ClubClaimRequestRecord["status"]; created_at: string;
      })
    : null;

  const squad = (squadResult.data ?? []).map((athlete) => ({
    bid: Number(athlete.bid),
    name: athlete.name,
    nickname: athlete.apelido,
    mainPosition: athlete.main_position,
    category: athlete.current_category,
    contractEndDate: athlete.contract_end_date,
  })) as ClubSquadMemberRecord[];

  return {
    club: mapClub(row),
    squad,
    ownRequest,
    claimViewState: resolveClubClaimViewState({
      role: session.role,
      userId: session.userId,
      claimStatus: row.claim_status,
      claimedBy: row.reivindicado_por,
      ownPendingRequest: ownRequest?.status === "pending",
      accountHasPendingOrClaimedClub: (pendingResult.count ?? 0) > 0 || (claimedResult.count ?? 0) > 0,
    }),
  };
}

export async function createClubClaim(
  client: SupabaseClient,
  input: { userId: string; clubId: string; documentUrl: string; message: string },
): Promise<ClubClaimRequestRecord> {
  const { data, error } = await client.from("solicitacoes_reivindicacao").insert({
    tipo: "clube",
    clube_id: input.clubId,
    bid_atleta: null,
    requested_by: input.userId,
    documento_url: input.documentUrl,
    mensagem: input.message,
    status: "pending",
  }).select("id,documento_url,mensagem,status,created_at").single();
  if (error) throw error;
  return mapClaim(data as {
    id: string; documento_url: string; mensagem: string;
    status: ClubClaimRequestRecord["status"]; created_at: string;
  });
}

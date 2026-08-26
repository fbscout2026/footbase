import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveClubClaimViewState,
  type ClaimStatus,
  type ClubClaimViewState,
  type SessionRole,
} from "@/lib/club-claim-rules";

export interface ClubSummaryRecord {
  id: string;
  fbId: number;
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
  fbId: number;
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

export interface ClubSquadCategoryGroup {
  category: string; // real category label, or "" for the uncategorized bucket
  athletes: ClubSquadMemberRecord[];
}

export interface ClubProfileData {
  club: ClubSummaryRecord;
  squad: ClubSquadCategoryGroup[];
  claimViewState: ClubClaimViewState;
  ownRequest: ClubClaimRequestRecord | null;
}

type ClubViewRow = {
  id: string;
  fb_id: number;
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

const CLUB_COLUMNS = "id,fb_id,name,state,federacao,webp_crest_url,reivindicado_por,claim_status,total_atletas,categorias_ativas,torneios_em_disputa";

function mapClub(row: ClubViewRow): ClubSummaryRecord {
  return {
    id: row.id,
    fbId: Number(row.fb_id),
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

// Groups by category (already sorted alphabetically by the `atletas` query's own
// `.order("name")`, so within a group the order is preserved as-is), category
// groups ordered by `categoria_ordem.rank` (SUB-11 → SUB-20, never plain
// alphabetical — "SUB-11" would sort after "SUB-13" alphabetically). Athletes
// with no known category land in one final "" bucket.
function groupSquadByCategory(athletes: ClubSquadMemberRecord[], categoryRank: Map<string, number>): ClubSquadCategoryGroup[] {
  const byCategory = new Map<string, ClubSquadMemberRecord[]>();
  for (const athlete of athletes) {
    const key = athlete.category ?? "";
    (byCategory.get(key) ?? byCategory.set(key, []).get(key)!).push(athlete);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return (categoryRank.get(a) ?? Infinity) - (categoryRank.get(b) ?? Infinity) || a.localeCompare(b);
    })
    .map(([category, group]) => ({ category, athletes: group }));
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

  const [squadResult, categoryOrderResult, requestResult, pendingResult, claimedResult] = await Promise.all([
    client.from("atletas")
      .select("fb_id,name,apelido,main_position,current_category,contract_end_date")
      .eq("current_club_id", clubId).order("name"),
    client.from("categoria_ordem").select("categoria").order("rank"),
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
  if (categoryOrderResult.error) throw categoryOrderResult.error;
  if (requestResult.error) throw requestResult.error;
  if (pendingResult.error) throw pendingResult.error;
  if (claimedResult.error) throw claimedResult.error;

  const ownRequest = requestResult.data
    ? mapClaim(requestResult.data as {
        id: string; documento_url: string; mensagem: string;
        status: ClubClaimRequestRecord["status"]; created_at: string;
      })
    : null;

  const squadFlat = (squadResult.data ?? []).map((athlete) => ({
    fbId: Number(athlete.fb_id),
    name: athlete.name,
    nickname: athlete.apelido,
    mainPosition: athlete.main_position,
    category: athlete.current_category,
    contractEndDate: athlete.contract_end_date,
  })) as ClubSquadMemberRecord[];

  const categoryRank = new Map((categoryOrderResult.data ?? []).map((c, i) => [c.categoria as string, i]));
  const squad = groupSquadByCategory(squadFlat, categoryRank);

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
    fb_id_atleta: null,
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

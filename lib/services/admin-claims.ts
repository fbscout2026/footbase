import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimType = "atleta" | "clube";
export type ClaimStatus = "pending" | "approved" | "rejected";

export interface AdminClaim {
  id: string;
  tipo: ClaimType;
  status: ClaimStatus;
  createdAt: string;
  documentoUrl: string | null;
  mensagem: string | null;
  bidAtleta: number | null;
  athleteName: string | null;
  athleteCategory: string | null;
  clubeId: string | null;
  clubName: string | null;
  clubState: string | null;
  clubClaimStatus: string | null;
  requestedBy: string;
  // Filled server-side (page.tsx) from the profiles/emails already loaded.
  requesterName: string | null;
  requesterOrg: string | null;
  requesterEmail: string | null;
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

// Admin reads all requests (reivindicacao_select_own_or_admin). Athlete/club names
// come from real FK embeds; requester profile fields are merged in the page.
export async function loadClaims(client: SupabaseClient): Promise<AdminClaim[]> {
  const { data, error } = await client
    .from("solicitacoes_reivindicacao")
    .select("id, tipo, bid_atleta, clube_id, requested_by, documento_url, mensagem, status, created_at, atletas(name, current_category), clubes(name, state, claim_status)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const athlete = one<{ name?: string; current_category?: string }>(r.atletas as never);
    const club = one<{ name?: string; state?: string; claim_status?: string }>(r.clubes as never);
    return {
      id: String(r.id),
      tipo: r.tipo as ClaimType,
      status: r.status as ClaimStatus,
      createdAt: r.created_at as string,
      documentoUrl: r.documento_url as string | null,
      mensagem: r.mensagem as string | null,
      bidAtleta: r.bid_atleta === null ? null : Number(r.bid_atleta),
      athleteName: athlete?.name ?? null,
      athleteCategory: athlete?.current_category ?? null,
      clubeId: r.clube_id as string | null,
      clubName: club?.name ?? null,
      clubState: club?.state ?? null,
      clubClaimStatus: club?.claim_status ?? null,
      requestedBy: String(r.requested_by),
      requesterName: null,
      requesterOrg: null,
      requesterEmail: null,
    };
  });
}

// Approve/reject. RLS reivindicacao_update_admin allows admin; guard_claim_request_update
// enforces the transition and sets reviewer; sync_{club,athlete}_claim_state links
// the club/athlete atomically. Never mutates ownership directly here.
export async function setClaimStatus(client: SupabaseClient, id: string, status: Exclude<ClaimStatus, "pending">): Promise<void> {
  const { error } = await client.from("solicitacoes_reivindicacao").update({ status }).eq("id", id);
  if (error) throw error;
}

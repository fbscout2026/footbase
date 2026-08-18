import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAthleteClaimViewState, type AthleteClaimStatus, type AthleteClaimViewState } from "@/lib/athlete-claim-rules";
import type { SessionRole } from "@/lib/club-claim-rules";

export interface AthleteClaimRequestRecord {
  id: string;
  documentUrl: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface AthleteClaimContext {
  claimStatus: AthleteClaimStatus;
  viewState: AthleteClaimViewState;
  ownRequest: AthleteClaimRequestRecord | null;
}

function mapRequest(row: { id: string; documento_url: string; mensagem: string; status: AthleteClaimRequestRecord["status"]; created_at: string }): AthleteClaimRequestRecord {
  return { id: row.id, documentUrl: row.documento_url, message: row.mensagem, status: row.status, createdAt: row.created_at };
}

export async function loadAthleteClaimContext(client: SupabaseClient, input: { bid: number; userId: string; role: SessionRole }): Promise<AthleteClaimContext> {
  const [athleteResult, requestResult, agentResult] = await Promise.all([
    client.from("atletas").select("claim_status,agent_id").eq("bid", input.bid).single(),
    client.from("solicitacoes_reivindicacao")
      .select("id,documento_url,mensagem,status,created_at")
      .eq("tipo", "atleta").eq("bid_atleta", input.bid).eq("requested_by", input.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    input.role === "agent"
      ? client.from("agentes").select("id,verified_status").eq("user_id", input.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (athleteResult.error) throw athleteResult.error;
  if (requestResult.error) throw requestResult.error;
  if (agentResult.error) throw agentResult.error;

  const ownRequest = requestResult.data ? mapRequest(requestResult.data as Parameters<typeof mapRequest>[0]) : null;
  const claimStatus = athleteResult.data.claim_status as AthleteClaimStatus;
  return {
    claimStatus,
    ownRequest,
    viewState: resolveAthleteClaimViewState({
      role: input.role,
      claimStatus,
      athleteAgentId: athleteResult.data.agent_id,
      ownAgentId: agentResult.data?.id ?? null,
      ownAgentVerified: agentResult.data?.verified_status === "verified",
      ownLatestRequestStatus: ownRequest?.status ?? null,
    }),
  };
}

export async function createAthleteClaim(client: SupabaseClient, input: { bid: number; userId: string; documentUrl: string; message: string }): Promise<AthleteClaimRequestRecord> {
  const { data, error } = await client.from("solicitacoes_reivindicacao").insert({
    tipo: "atleta",
    bid_atleta: input.bid,
    clube_id: null,
    requested_by: input.userId,
    documento_url: input.documentUrl,
    mensagem: input.message,
    status: "pending",
  }).select("id,documento_url,mensagem,status,created_at").single();
  if (error) throw error;
  return mapRequest(data as Parameters<typeof mapRequest>[0]);
}

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RepresentedAthlete {
  bid: number;
  name: string;
  category: string | null;
  agentId: string;
  agentName: string | null;
}

export interface EligibleAgent {
  id: string;
  userId: string;
  fullName: string;
  agencyName: string | null;
}

export interface TransferRecord {
  id: string;
  bidAtleta: number;
  agenteAnteriorId: string | null;
  agenteNovoId: string;
  justificativa: string;
  comprovanteUrl: string;
  adminId: string;
  createdAt: string;
  // Filled server-side (page.tsx) by merging the already-loaded athlete/agent/user lists.
  athleteName: string | null;
  agenteAnteriorName: string | null;
  agenteNovoName: string | null;
  adminName: string | null;
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

// Athletes eligible to have their representation transferred: already claimed by
// an agent. atletas.agent_id -> agentes.id is a real FK, so the name embeds directly.
export async function loadRepresentedAthletes(client: SupabaseClient): Promise<RepresentedAthlete[]> {
  const { data, error } = await client
    .from("atletas")
    .select("bid, name, current_category, agent_id, agentes(full_name)")
    .eq("claim_status", "claimed")
    .not("agent_id", "is", null)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bid: Number(r.bid),
    name: r.name as string,
    category: r.current_category as string | null,
    agentId: String(r.agent_id),
    agentName: one<{ full_name?: string }>(r.agentes as never)?.full_name ?? null,
  }));
}

// Candidates for the "new agent" side of a transfer: verified agents only (the
// RPC re-validates verified + approved server-side; this just narrows the picker).
export async function loadEligibleAgents(client: SupabaseClient): Promise<EligibleAgent[]> {
  const { data, error } = await client
    .from("agentes")
    .select("id, user_id, full_name, agency_name")
    .eq("verified_status", "verified")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    fullName: r.full_name as string,
    agencyName: r.agency_name as string | null,
  }));
}

// Immutable audit trail (admin-only via RLS). Names are merged server-side in
// page.tsx from the already-loaded athlete/agent/user lists — agente_anterior_id
// and agente_novo_id both reference agentes(id), so a plain embed is ambiguous.
export async function loadTransferHistory(client: SupabaseClient): Promise<TransferRecord[]> {
  const { data, error } = await client
    .from("representacao_transferencias")
    .select("id, bid_atleta, agente_anterior_id, agente_novo_id, justificativa, comprovante_url, admin_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    bidAtleta: Number(r.bid_atleta),
    agenteAnteriorId: r.agente_anterior_id as string | null,
    agenteNovoId: String(r.agente_novo_id),
    justificativa: r.justificativa as string,
    comprovanteUrl: r.comprovante_url as string,
    adminId: String(r.admin_id),
    createdAt: r.created_at as string,
    athleteName: null,
    agenteAnteriorName: null,
    agenteNovoName: null,
    adminName: null,
  }));
}

// All agent names, for resolving history rows (an agent may no longer be
// "verified" by the time the history is displayed, so loadEligibleAgents alone
// isn't enough). agentes_select lets any approved/admin user read every row.
export async function loadAgentNames(client: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await client.from("agentes").select("id, full_name");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [String(r.id), r.full_name as string]));
}

// The only sanctioned write path: validates admin + eligible new agent, updates
// atletas.agent_id and records history atomically (admin_transferir_representacao).
export async function transferRepresentation(
  client: SupabaseClient,
  bid: number,
  novoAgenteId: string,
  justificativa: string,
  comprovanteUrl: string,
): Promise<void> {
  const { error } = await client.rpc("admin_transferir_representacao", {
    p_bid: bid,
    p_novo_agente_id: novoAgenteId,
    p_justificativa: justificativa,
    p_comprovante_url: comprovanteUrl,
  });
  if (error) throw error;
}

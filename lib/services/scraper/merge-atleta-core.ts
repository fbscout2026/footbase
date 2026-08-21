// FOOTBASE Session 55 — the actual merge logic behind merge-atleta.ts (CLI) AND the
// admin duplicate-review API route (app/api/admin/athlete-duplicates/route.ts).
// Extracted so both callers share the EXACT same safety checks (already-claimed
// guard, same-match-collision detection) instead of the API route reimplementing
// them separately and risking drift.
//
// What "merge" means: every row across the real FKs into `atletas.bid` gets
// repointed from loserBid to winnerBid; once loserBid has zero remaining
// references anywhere, the (now-orphaned) loser row itself is deleted. The winner's
// own data (name, birth_date, stats, claim) is NEVER touched.

import type { SupabaseClient } from "@supabase/supabase-js";

// Every real FK into atletas.bid, mapped live off supabase/schema.sql (Session 55).
const REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: "conquistas", column: "bid_atleta" },
  { table: "historico_clubes", column: "bid_atleta" },
  { table: "atleta_fontes", column: "bid" },
  { table: "atuacoes_sumula", column: "bid_atleta" },
  { table: "favoritos", column: "bid_atleta" },
  { table: "prancheta_slots", column: "bid_atleta" },
  { table: "solicitacoes_reivindicacao", column: "bid_atleta" },
  { table: "solicitacoes_correcao", column: "bid_atleta" },
  { table: "club_elenco_solicitacoes", column: "bid_atleta" },
  { table: "representacao_transferencias", column: "bid_atleta" },
];

export interface AthleteSummary {
  bid: number;
  name: string;
  birthDate: string | null;
  currentCategory: string | null;
  claimStatus: string;
  agentId: string | null;
}

export interface RowCount {
  table: string;
  column: string;
  count: number;
}

export type MergeAtletaResult =
  | { outcome: "already-claimed"; loser: AthleteSummary; winner: AthleteSummary }
  | { outcome: "match-collision"; loser: AthleteSummary; winner: AthleteSummary; collidingPartidas: string[] }
  | { outcome: "preview"; loser: AthleteSummary; winner: AthleteSummary; rowCounts: RowCount[]; totalRows: number }
  | { outcome: "merged"; loser: AthleteSummary; winner: AthleteSummary; rowCounts: RowCount[]; totalRows: number }
  | { outcome: "write-failed"; loser: AthleteSummary; winner: AthleteSummary; error: string };

async function fetchAthlete(admin: SupabaseClient, bid: number): Promise<AthleteSummary> {
  const { data, error } = await admin.from("atletas").select("bid, name, birth_date, current_category, claim_status, agent_id").eq("bid", bid).single();
  if (error) throw new Error(`athlete ${bid} not found: ${error.message}`);
  return { bid: data.bid, name: data.name, birthDate: data.birth_date, currentCategory: data.current_category, claimStatus: data.claim_status, agentId: data.agent_id };
}

/**
 * `confirm: false` returns a preview (row counts, no writes). `confirm: true`
 * performs the real repoint + delete. Either way, the already-claimed guard and
 * same-match-collision check run first and can short-circuit before any write —
 * those two conditions always require a human decision this function refuses to
 * make on its own.
 */
export async function mergeAtleta(admin: SupabaseClient, loserBid: number, winnerBid: number, confirm: boolean): Promise<MergeAtletaResult> {
  const loser = await fetchAthlete(admin, loserBid);
  const winner = await fetchAthlete(admin, winnerBid);

  if (loser.claimStatus !== "unclaimed" || winner.claimStatus !== "unclaimed") {
    return { outcome: "already-claimed", loser, winner };
  }

  const { data: loserMatches } = await admin.from("atuacoes_sumula").select("partida_id").eq("bid_atleta", loserBid);
  const { data: winnerMatches } = await admin.from("atuacoes_sumula").select("partida_id").eq("bid_atleta", winnerBid);
  const winnerPartidaIds = new Set((winnerMatches ?? []).map((m) => m.partida_id as string));
  const collidingPartidas = (loserMatches ?? []).map((m) => m.partida_id as string).filter((id) => winnerPartidaIds.has(id));
  if (collidingPartidas.length > 0) {
    return { outcome: "match-collision", loser, winner, collidingPartidas };
  }

  const rowCounts: RowCount[] = [];
  let totalRows = 0;
  for (const { table, column } of REFERENCING_COLUMNS) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, loserBid);
    if (error) continue; // table not present in this environment — same as the CLI's own tolerance
    rowCounts.push({ table, column, count: count ?? 0 });
    totalRows += count ?? 0;
  }

  if (!confirm) {
    return { outcome: "preview", loser, winner, rowCounts, totalRows };
  }

  for (const { table, column, count } of rowCounts) {
    if (count === 0) continue;
    const { error } = await admin.from(table).update({ [column]: winnerBid }).eq(column, loserBid);
    if (error) return { outcome: "write-failed", loser, winner, error: `${table}.${column}: ${error.message}` };
  }

  let stillReferenced = 0;
  for (const { table, column } of REFERENCING_COLUMNS) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, loserBid);
    stillReferenced += count ?? 0;
  }
  if (stillReferenced > 0) {
    return { outcome: "write-failed", loser, winner, error: `${stillReferenced} referência(s) real(is) ainda restam após o repointing — atleta perdedor NÃO apagado.` };
  }

  const { error: delError } = await admin.from("atletas").delete().eq("bid", loserBid);
  if (delError) return { outcome: "write-failed", loser, winner, error: `delete do atleta perdedor: ${delError.message}` };

  await admin.rpc("recompute_atleta_stats", { p_bid: winnerBid });

  return { outcome: "merged", loser, winner, rowCounts, totalRows };
}

// FOOTBASE Session 55 — the actual merge logic behind merge-atleta.ts (CLI) AND the
// admin duplicate-review API route (app/api/admin/athlete-duplicates/route.ts).
// Extracted so both callers share the EXACT same safety checks (already-claimed
// guard, same-match-collision detection) instead of the API route reimplementing
// them separately and risking drift.
//
// What "merge" means: every row across the real FKs into `atletas.fb_id` gets
// repointed from loserBid to winnerBid; once loserBid has zero remaining
// references anywhere, the (now-orphaned) loser row itself is deleted. The winner's
// own data (name, birth_date, stats, claim) is NEVER touched.

import type { SupabaseClient } from "@supabase/supabase-js";

// Every real FK into atletas.fb_id, mapped live off supabase/schema.sql (Session 55,
// column names updated Session 56 — "FB-ID: chave suprema").
const REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: "conquistas", column: "fb_id_atleta" },
  { table: "historico_clubes", column: "fb_id_atleta" },
  { table: "atleta_fontes", column: "fb_id" },
  { table: "atuacoes_sumula", column: "fb_id_atleta" },
  { table: "favoritos", column: "fb_id_atleta" },
  { table: "prancheta_slots", column: "fb_id_atleta" },
  { table: "solicitacoes_reivindicacao", column: "fb_id_atleta" },
  { table: "solicitacoes_correcao", column: "fb_id_atleta" },
  { table: "club_elenco_solicitacoes", column: "fb_id_atleta" },
  { table: "representacao_transferencias", column: "fb_id_atleta" },
  // Session 57 — found missing via the exact same audit that caught
  // merge-clube.ts's clube_fontes/atuacoes_sumula.club_id gap: this table was
  // never added here even though it has two real FKs into atletas.fb_id. Both
  // columns needed (a duplicate-candidate row compares two DIFFERENT athletes).
  { table: "atleta_duplicate_candidates", column: "fb_id_a" },
  { table: "atleta_duplicate_candidates", column: "fb_id_b" },
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
  const { data, error } = await admin.from("atletas").select("fb_id, name, birth_date, current_category, claim_status, agent_id").eq("fb_id", bid).single();
  if (error) throw new Error(`athlete ${bid} not found: ${error.message}`);
  return { bid: data.fb_id, name: data.name, birthDate: data.birth_date, currentCategory: data.current_category, claimStatus: data.claim_status, agentId: data.agent_id };
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

  const { data: loserMatches } = await admin.from("atuacoes_sumula").select("partida_id").eq("fb_id_atleta", loserBid);
  const { data: winnerMatches } = await admin.from("atuacoes_sumula").select("partida_id").eq("fb_id_atleta", winnerBid);
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

  // atleta_duplicate_candidates has `check (fb_id_a <> fb_id_b)` — if a stored
  // candidate row already compares exactly this loser/winner pair, repointing
  // either side alone would make both columns equal and violate that
  // constraint. Delete such rows first: once the merge completes, "these two
  // are the same athlete" is no longer a comparison, it's just true.
  {
    const { error } = await admin
      .from("atleta_duplicate_candidates")
      .delete()
      .or(`and(fb_id_a.eq.${loserBid},fb_id_b.eq.${winnerBid}),and(fb_id_a.eq.${winnerBid},fb_id_b.eq.${loserBid})`);
    if (error) return { outcome: "write-failed", loser, winner, error: `atleta_duplicate_candidates (par loser/winner): ${error.message}` };
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

  const { error: delError } = await admin.from("atletas").delete().eq("fb_id", loserBid);
  if (delError) return { outcome: "write-failed", loser, winner, error: `delete do atleta perdedor: ${delError.message}` };

  await admin.rpc("recompute_atleta_stats", { p_fb_id: winnerBid });

  return { outcome: "merged", loser, winner, rowCounts, totalRows };
}

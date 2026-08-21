// FOOTBASE Session 55 — manual athlete-merge utility. Mirrors merge-clube.ts exactly
// (same preview-first, one-at-a-time, human-confirmed shape — CLAUDE.md's Session 52
// hard rule) applied to athletes instead of clubs: the companion write tool for
// scan-athlete-duplicates.ts's read-only report.
//
// What "merge" means: every row across the real FKs into `atletas.bid` gets
// repointed from loserBid to winnerBid; once loserBid has zero remaining
// references anywhere, the (now-orphaned) loser row itself is deleted. The winner's
// own data (name, birth_date, stats, claim) is NEVER touched — this tool only
// repoints OTHER tables' references, never picks a "better" profile automatically.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/merge-atleta.ts <loserBid> <winnerBid>            # preview only (default)
//   node --experimental-strip-types lib/services/scraper/merge-atleta.ts <loserBid> <winnerBid> --confirm  # actually writes

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

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

async function fetchAthlete(admin: SupabaseClient, bid: number) {
  const { data, error } = await admin.from("atletas").select("*").eq("bid", bid).single();
  if (error) throw new Error(`athlete ${bid} not found: ${error.message}`);
  return data;
}

async function previewAndMerge(loserBid: number, winnerBid: number, confirm: boolean): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const loser = await fetchAthlete(admin, loserBid);
  const winner = await fetchAthlete(admin, winnerBid);

  console.log(`\n[merge-atleta] LOSER  (${loserBid}): "${loser.name}" | nasc=${loser.birth_date ?? "?"} | categoria=${loser.current_category ?? "?"} | claim=${loser.claim_status} | agent_id=${loser.agent_id ?? "-"}`);
  console.log(`[merge-atleta] WINNER (${winnerBid}): "${winner.name}" | nasc=${winner.birth_date ?? "?"} | categoria=${winner.current_category ?? "?"} | claim=${winner.claim_status} | agent_id=${winner.agent_id ?? "-"}`);

  if (loser.claim_status !== "unclaimed" || winner.claim_status !== "unclaimed") {
    console.log("\n⚠️  Um dos dois atletas já tem representação (agente) vinculada — parando, isso precisa de decisão manual explícita, este script não decide isso sozinho.");
    return;
  }

  console.log("\n[merge-atleta] PREVIEW — linhas que seriam repontadas de LOSER para WINNER:");
  let totalRows = 0;
  const counts: { table: string; column: string; count: number }[] = [];
  for (const { table, column } of REFERENCING_COLUMNS) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, loserBid);
    if (error) {
      console.log(`  ${table}.${column}: ERRO (${error.message}) — tabela pode não existir neste ambiente, pulando`);
      continue;
    }
    counts.push({ table, column, count: count ?? 0 });
    totalRows += count ?? 0;
    console.log(`  ${table}.${column}: ${count ?? 0}`);
  }
  console.log(`  TOTAL: ${totalRows} linha(s) em ${counts.filter((c) => c.count > 0).length} tabela(s)`);

  // atuacoes_sumula carries a UNIQUE (partida_id, bid_atleta) constraint — if BOTH the
  // loser and winner have an atuação for the SAME match (shouldn't happen for one real
  // person, but two genuinely different sources double-counting the same match could
  // produce it), a raw repoint would violate that constraint. Surface it instead of
  // failing opaquely mid-merge.
  const { data: loserMatches } = await admin.from("atuacoes_sumula").select("partida_id").eq("bid_atleta", loserBid);
  const { data: winnerMatches } = await admin.from("atuacoes_sumula").select("partida_id").eq("bid_atleta", winnerBid);
  const winnerPartidaIds = new Set((winnerMatches ?? []).map((m) => m.partida_id as string));
  const collidingPartidas = (loserMatches ?? []).map((m) => m.partida_id as string).filter((id) => winnerPartidaIds.has(id));
  if (collidingPartidas.length > 0) {
    console.log(`\n⚠️  ${collidingPartidas.length} partida(s) tem atuação registrada para OS DOIS bids — repointing direto violaria a constraint única. Precisa de decisão manual (qual atuação manter) antes de fundir. Partidas: ${collidingPartidas.join(", ")}`);
    return;
  }

  if (!confirm) {
    console.log("\n[merge-atleta] Modo preview (padrão) — nada foi escrito. Rode de novo com --confirm para executar de verdade.");
    return;
  }

  console.log("\n[merge-atleta] --confirm passado — executando repointing real, uma tabela de cada vez...");
  for (const { table, column, count } of counts) {
    if (count === 0) continue;
    const { error, count: updated } = await admin.from(table).update({ [column]: winnerBid }, { count: "exact" }).eq(column, loserBid);
    if (error) {
      console.error(`  [FALHOU] ${table}.${column}:`, error.message);
      console.error("  Parando aqui — o restante NÃO foi tocado. Investigue antes de rodar de novo (é seguro re-rodar, idempotente).");
      return;
    }
    console.log(`  [ok] ${table}.${column}: ${updated ?? "?"} linha(s) repontada(s)`);
  }

  let stillReferenced = 0;
  for (const { table, column } of REFERENCING_COLUMNS) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, loserBid);
    stillReferenced += count ?? 0;
  }
  if (stillReferenced > 0) {
    console.log(`[merge-atleta] ${stillReferenced} referência(s) real(is) ainda restam — NÃO apagando o atleta perdedor. Investigue manualmente.`);
    return;
  }

  console.log(`[merge-atleta] Zero referências restantes. Apagando a linha órfã do atleta perdedor (bid ${loserBid})...`);
  const { error: delError } = await admin.from("atletas").delete().eq("bid", loserBid);
  if (delError) {
    console.error("  [FALHOU] delete do atleta perdedor:", delError.message);
    return;
  }
  console.log("[merge-atleta] Concluído. Atleta perdedor removido, todas as referências agora apontam para o vencedor.");
  console.log("[merge-atleta] Lembrete: recompute_atleta_stats não foi chamado — se as estatísticas do vencedor precisam refletir as atuações herdadas, rode o RPC manualmente para esse bid.");
}

async function main(): Promise<void> {
  loadEnvLocal();
  const [loserArg, winnerArg, flag] = process.argv.slice(2);
  if (!loserArg || !winnerArg) {
    console.error("Uso: node merge-atleta.ts <loserBid> <winnerBid> [--confirm]");
    process.exitCode = 1;
    return;
  }
  await previewAndMerge(Number(loserArg), Number(winnerArg), flag === "--confirm");
}

main()
  .catch((e) => {
    console.error("[merge-atleta] fatal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());

// FOOTBASE — manual club-merge utility (Session 55).
//
// Real incident that motivated this: the same real-world club can be ingested
// separately by CBF, FERJ, FMF, FGF (each source's own numeric id → its own
// `source_key`, e.g. `cbf:20016` vs `ferj:30`) — nothing today cross-references
// clubs BETWEEN sources, so "Flamengo" ended up as 3 separate `clubes` rows.
// Confirmed live: a fuzzy name+state scan found 8 candidate duplicate groups
// (17 clubs) — but at least 2 of those groups are FALSE POSITIVES (two real,
// DIFFERENT small clubs that happen to share a common name fragment like
// "Democrata"), so this is deliberately NOT an auto-merge tool — mirrors
// `resolve-athlete-identity.ts`'s "never auto-merge weak matches" principle,
// applied to clubs. A human confirms every pair before anything is written.
//
// Follows the hard rule in CLAUDE.md (Session 52 incident): SELECT-preview
// first, one merge at a time, confirm the exact row counts, only then write —
// never a blind DELETE/UPDATE. Run:
//   node --experimental-strip-types lib/services/scraper/merge-clube.ts <loserId> <winnerId>            # preview only (default)
//   node --experimental-strip-types lib/services/scraper/merge-clube.ts <loserId> <winnerId> --confirm  # actually writes
//
// What "merge" means: every row across the 8 real FKs into `clubes.id` gets
// repointed from loserId to winnerId; once loserId has zero remaining
// references anywhere, the (now-orphaned, empty) loser row itself is deleted.
// The winner's own data (crest, claim, display fields) is NEVER touched —
// this tool only repoints OTHER tables' references, never picks a "better"
// crest/name automatically (that is exactly the kind of judgment call this
// tool intentionally leaves to the human running it, via which id they pass
// as the winner).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

// Every real FK into clubes.id, mapped live off supabase/schema.sql (Session 55).
// `favoritos` deliberately absent — it references `atletas.bid`, never a club
// directly, so club merges can never touch it.
const REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: "atletas", column: "current_club_id" },
  { table: "historico_clubes", column: "clube_id" },
  { table: "partidas_sumula", column: "home_club_id" },
  { table: "partidas_sumula", column: "away_club_id" },
  { table: "solicitacoes_reivindicacao", column: "clube_id" },
  { table: "club_categorias", column: "club_id" },
  { table: "club_elenco_solicitacoes", column: "club_id" },
  { table: "club_elenco_solicitacoes", column: "current_club_id_snapshot" },
  { table: "club_correction_requests", column: "club_id" },
  { table: "club_divergencias", column: "club_id" },
];

async function fetchClub(admin: SupabaseClient, id: string) {
  const { data, error } = await admin.from("clubes").select("*").eq("id", id).single();
  if (error) throw new Error(`club ${id} not found: ${error.message}`);
  return data;
}

async function previewAndMerge(loserId: string, winnerId: string, confirm: boolean): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const loser = await fetchClub(admin, loserId);
  const winner = await fetchClub(admin, winnerId);

  console.log(`\n[merge-clube] LOSER  (${loserId}): "${loser.name}" | source_key=${loser.source_key} | state=${loser.state} | claim=${loser.claim_status} | reivindicado_por=${loser.reivindicado_por ?? "-"}`);
  console.log(`[merge-clube] WINNER (${winnerId}): "${winner.name}" | source_key=${winner.source_key} | state=${winner.state} | claim=${winner.claim_status} | reivindicado_por=${winner.reivindicado_por ?? "-"}`);

  if (loser.reivindicado_por || winner.reivindicado_por) {
    console.log("\n⚠️  Um dos dois clubes já está reivindicado (posse real) — parando, isso precisa de decisão manual explícita, este script não decide isso sozinho.");
    return;
  }

  console.log("\n[merge-clube] PREVIEW — linhas que seriam repontadas de LOSER para WINNER:");
  let totalRows = 0;
  const counts: { table: string; column: string; count: number }[] = [];
  for (const { table, column } of REFERENCING_COLUMNS) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, loserId);
    if (error) {
      console.log(`  ${table}.${column}: ERRO (${error.message}) — tabela pode não existir neste ambiente, pulando`);
      continue;
    }
    counts.push({ table, column, count: count ?? 0 });
    totalRows += count ?? 0;
    console.log(`  ${table}.${column}: ${count ?? 0}`);
  }
  console.log(`  TOTAL: ${totalRows} linha(s) em ${counts.filter((c) => c.count > 0).length} tabela(s)`);

  if (!confirm) {
    console.log("\n[merge-clube] Modo preview (padrão) — nada foi escrito. Rode de novo com --confirm para executar de verdade.");
    return;
  }

  console.log("\n[merge-clube] --confirm passado — executando repointing real, uma tabela de cada vez...");
  for (const { table, column, count } of counts) {
    if (count === 0) continue;
    const { error, count: updated } = await admin.from(table).update({ [column]: winnerId }, { count: "exact" }).eq(column, loserId);
    if (error) {
      console.error(`  [FALHOU] ${table}.${column}:`, error.message);
      console.error("  Parando aqui — o restante NÃO foi tocado. Investigue antes de rodar de novo (é seguro re-rodar, idempotente).");
      return;
    }
    console.log(`  [ok] ${table}.${column}: ${updated ?? "?"} linha(s) repontada(s)`);
  }

  const { count: remaining } = await admin.from("atletas").select("bid", { count: "exact", head: true }).eq("current_club_id", loserId);
  console.log(`\n[merge-clube] Verificação final: ${remaining ?? 0} referência(s) restante(s) em atletas.current_club_id (deve ser 0).`);

  let stillReferenced = 0;
  for (const { table, column } of REFERENCING_COLUMNS) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, loserId);
    stillReferenced += count ?? 0;
  }
  if (stillReferenced > 0) {
    console.log(`[merge-clube] ${stillReferenced} referência(s) real(is) ainda restam — NÃO apagando o clube perdedor. Investigue manualmente.`);
    return;
  }

  console.log(`[merge-clube] Zero referências restantes. Apagando a linha órfã do clube perdedor (${loserId})...`);
  const { error: delError } = await admin.from("clubes").delete().eq("id", loserId);
  if (delError) {
    console.error("  [FALHOU] delete do clube perdedor:", delError.message);
    return;
  }
  console.log("[merge-clube] Concluído. Clube perdedor removido, todas as referências agora apontam para o vencedor.");
}

async function main(): Promise<void> {
  loadEnvLocal();
  const [loserId, winnerId, flag] = process.argv.slice(2);
  if (!loserId || !winnerId) {
    console.error("Uso: node merge-clube.ts <loserId> <winnerId> [--confirm]");
    process.exitCode = 1;
    return;
  }
  await previewAndMerge(loserId, winnerId, flag === "--confirm");
}

main()
  .catch((e) => {
    console.error("[merge-clube] fatal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());

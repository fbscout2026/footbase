// FOOTBASE Session 55 — manual athlete-merge CLI. Mirrors merge-clube.ts exactly
// (same preview-first, one-at-a-time, human-confirmed shape — CLAUDE.md's Session 52
// hard rule) applied to athletes instead of clubs: the companion write tool for
// scan-athlete-duplicates.ts's read-only report. The actual merge logic lives in
// merge-atleta-core.ts (shared with the /admin duplicate-review UI) — this file is
// just the terminal-facing wrapper.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/merge-atleta.ts <loserBid> <winnerBid>            # preview only (default)
//   node --experimental-strip-types lib/services/scraper/merge-atleta.ts <loserBid> <winnerBid> --confirm  # actually writes

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { mergeAtleta } from "./merge-atleta-core.ts";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const [loserArg, winnerArg, flag] = process.argv.slice(2);
  if (!loserArg || !winnerArg) {
    console.error("Uso: node merge-atleta.ts <loserBid> <winnerBid> [--confirm]");
    process.exitCode = 1;
    return;
  }
  const loserBid = Number(loserArg);
  const winnerBid = Number(winnerArg);
  const confirm = flag === "--confirm";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const result = await mergeAtleta(admin, loserBid, winnerBid, confirm);

  console.log(`\n[merge-atleta] LOSER  (${result.loser.bid}): "${result.loser.name}" | nasc=${result.loser.birthDate ?? "?"} | categoria=${result.loser.currentCategory ?? "?"} | claim=${result.loser.claimStatus} | agent_id=${result.loser.agentId ?? "-"}`);
  console.log(`[merge-atleta] WINNER (${result.winner.bid}): "${result.winner.name}" | nasc=${result.winner.birthDate ?? "?"} | categoria=${result.winner.currentCategory ?? "?"} | claim=${result.winner.claimStatus} | agent_id=${result.winner.agentId ?? "-"}`);

  switch (result.outcome) {
    case "already-claimed":
      console.log("\n⚠️  Um dos dois atletas já tem representação (agente) vinculada — parando, isso precisa de decisão manual explícita, este script não decide isso sozinho.");
      return;
    case "match-collision":
      console.log(`\n⚠️  ${result.collidingPartidas.length} partida(s) tem atuação registrada para OS DOIS bids — repointing direto violaria a constraint única. Precisa de decisão manual (qual atuação manter) antes de fundir. Partidas: ${result.collidingPartidas.join(", ")}`);
      return;
    case "preview": {
      console.log("\n[merge-atleta] PREVIEW — linhas que seriam repontadas de LOSER para WINNER:");
      for (const { table, column, count } of result.rowCounts) console.log(`  ${table}.${column}: ${count}`);
      console.log(`  TOTAL: ${result.totalRows} linha(s) em ${result.rowCounts.filter((c) => c.count > 0).length} tabela(s)`);
      console.log("\n[merge-atleta] Modo preview (padrão) — nada foi escrito. Rode de novo com --confirm para executar de verdade.");
      return;
    }
    case "merged":
      console.log("\n[merge-atleta] PREVIEW — linhas repontadas de LOSER para WINNER:");
      for (const { table, column, count } of result.rowCounts) console.log(`  ${table}.${column}: ${count}`);
      console.log(`\n[merge-atleta] Concluído. Atleta perdedor removido, todas as referências agora apontam para o vencedor. Estatísticas do vencedor já recalculadas.`);
      return;
    case "write-failed":
      console.error(`\n[merge-atleta] FALHOU: ${result.error}`);
      process.exitCode = 1;
      return;
  }
}

main().catch((e) => {
  console.error("[merge-atleta] fatal:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

// FOOTBASE — manual pre-go-live database snapshot (JSON, no Docker/pg_dump needed).
//
// Standalone runner (not a Next.js route). Used ONCE before enabling live ingestion
// writes (INGESTION_LIVE_ENABLED=true) as the "backup verificável" gate from
// docs/INGESTAO_RUNBOOK.md — the Supabase project is on the Free Plan (no automatic
// daily backups) and `supabase db dump` needs Docker, which was broken on this
// machine at the time. This is NOT a byte-perfect `pg_dump`: it's every row of every
// table, fetched via the service_role key and written as one JSON file per table —
// enough to manually reconstruct/restore data if a live write goes wrong, which is
// what the gate actually requires. Paginates so it doesn't rely on any single-request
// row-count limit.
//
// Run: node --experimental-strip-types lib/services/scraper/backup-db-snapshot.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const TABLES = [
  "admin_promocoes",
  "agentes",
  "atleta_fontes",
  "atletas",
  "atuacoes_sumula",
  "categoria_ordem",
  "clubes",
  "confederacoes",
  "conquistas",
  "favoritos",
  "federacoes",
  "historico_clubes",
  "paises",
  "partidas_sumula",
  "prancheta_slots",
  "prancheta_tatica",
  "profiles",
  "club_categoria_torneios",
  "club_categorias",
  "club_correction_requests",
  "club_divergencias",
  "club_elenco_solicitacoes",
  "representacao_transferencias",
  "scraping_jobs",
  "scraping_logs",
  "solicitacoes_correcao",
  "solicitacoes_reivindicacao",
  "torneios",
];

const PAGE_SIZE = 1000;

function loadEnvLocal(): void {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = `backups/${stamp}`;
  mkdirSync(dir, { recursive: true });

  console.log(`[backup] snapshot -> ${dir}/`);
  const summary: Record<string, number | string> = {};

  for (const table of TABLES) {
    const rows: unknown[] = [];
    let from = 0;
    let error: string | undefined;
    for (;;) {
      const { data, error: err } = await admin
        .from(table)
        .select("*")
        .range(from, from + PAGE_SIZE - 1);
      if (err) {
        error = err.message;
        break;
      }
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (error) {
      console.warn(`[backup] ${table}: FAILED — ${error}`);
      summary[table] = `error: ${error}`;
      continue;
    }

    writeFileSync(`${dir}/${table}.json`, JSON.stringify(rows, null, 2), "utf-8");
    console.log(`[backup] ${table}: ${rows.length} rows`);
    summary[table] = rows.length;
  }

  writeFileSync(`${dir}/_summary.json`, JSON.stringify({ takenAt: stamp, tables: summary }, null, 2), "utf-8");
  console.log(`\n[backup] done. Summary written to ${dir}/_summary.json`);
}

main().catch((e) => {
  console.error("[backup] fatal:", e);
  process.exitCode = 1;
});

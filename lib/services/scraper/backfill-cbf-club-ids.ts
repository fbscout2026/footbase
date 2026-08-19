// FOOTBASE — migração pontual (Session 52): troca a chave provisória dos clubes já
// ingeridos (`cbf-club:{slug}`, derivada de nome+UF, sem id numérico da CBF) pela
// chave real (`cbf:{id}`), agora que a descoberta injeta `idClubeMandante`/
// `idClubeVisitante` em `run-live-ingestion.ts`. Só troca `source_key` — `clubes.id`
// (UUID, a FK real usada por `partidas_sumula`) nunca muda, então é seguro: nenhuma
// partida/atuação existente perde a referência.
//
// Sem essa migração, a próxima rodada de ingestão passaria a gravar `cbf:{id}` como
// chave nova → criaria um clube DUPLICADO (e uma partida duplicada, já que
// `home_club_id`/`away_club_id` fazem parte da identidade única de `partidas_sumula`)
// em vez de atualizar a linha existente. É por isso que isso roda ANTES da próxima
// ingestão ao vivo, não depois.
//
// Também é o que destrava o download automático do escudo: `ensureClubCrest` (em
// `ingest.ts`) só reconhece clubes com `source_key` no formato `cbf:{id}`.
//
// Uso: node --experimental-strip-types lib/services/scraper/backfill-cbf-club-ids.ts
//   (sem flag: dry-run, só imprime o plano)
//   BACKFILL_LIVE=true node ...  → aplica de fato os UPDATEs

import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { discoverCbfMatchesForPhase } from "./discovery/cbf-discover.ts";
import { forEachRateLimited } from "./rate-limit.ts";

function loadEnvLocal(): void {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

// Mesma lista de fases da CBF já configurada em `run-live-ingestion.ts` — mantida
// aqui separadamente (não importada) porque `CBF_SOURCES` não é exportada de lá e
// duplicar 7 URLs é mais simples que reestruturar o módulo por um script de uso único.
const TABELA_PHASE_URLS = [
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2008",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2070",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2076",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2087",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20-b/2026/2063",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20-b/2026/2067",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20-b/2026/2073",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-17/2026",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2006",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2014",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2032",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2056",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2062",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2045",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2057",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2072",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2079",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2081",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2082",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-nordeste/sub-20/2026",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/liga-de-desenvolvimento/sub-13-masculino/2026/2029",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/liga-de-desenvolvimento/sub-13-masculino/2026/2036",
  "https://www.cbf.com.br/futebol-brasileiro/tabelas/liga-de-desenvolvimento/sub-13-masculino/2026/2041",
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function buildNameToIdMap(): Promise<Map<string, number>> {
  const batches = await forEachRateLimited(TABELA_PHASE_URLS, (u) => discoverCbfMatchesForPhase(u), { minDelayMs: 1000, jitterMs: 500 });
  const map = new Map<string, number>();
  for (const b of batches) {
    for (const ref of b.result ?? []) {
      if (ref.idClubeMandante) map.set(fold(ref.mandante), ref.idClubeMandante);
      if (ref.idClubeVisitante) map.set(fold(ref.visitante), ref.idClubeVisitante);
    }
  }
  return map;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const live = process.env.BACKFILL_LIVE === "true";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`[backfill-cbf-club-ids] mode: ${live ? "LIVE (writing)" : "DRY-RUN"}`);
  console.log("[backfill-cbf-club-ids] discovering club ids across all configured CBF phases...");
  const nameToId = await buildNameToIdMap();
  console.log(`[backfill-cbf-club-ids] discovered ${nameToId.size} distinct club names with a numeric id`);

  const { data: clubs, error } = await admin.from("clubes").select("id,name,source_key").like("source_key", "cbf-club:%");
  if (error) throw error;

  // `CbfMatchRef` carries no state/UF, only the team name string — two DIFFERENT real
  // clubs in our DB can legitimately share the exact same name (e.g. "Santa Cruz" in
  // PE and in AC), which would collapse to the SAME discovered id and, if renamed
  // blindly, wrongly merge one of them onto the wrong club. Guard: any DB name that
  // resolves to an id shared by more than one existing row is skipped entirely rather
  // than guessed at — ambiguous, needs a manual look (state isn't in this discovery
  // source, so there's no safe tiebreaker here).
  const dbNameCounts = new Map<string, number>();
  for (const club of clubs ?? []) dbNameCounts.set(fold(club.name), (dbNameCounts.get(fold(club.name)) ?? 0) + 1);

  let matched = 0, unmatched = 0, ambiguous = 0;
  for (const club of clubs ?? []) {
    const key = fold(club.name);
    if ((dbNameCounts.get(key) ?? 0) > 1) {
      ambiguous++;
      console.log(`[ambiguous] "${club.name}" (${club.source_key}) — name shared by ${dbNameCounts.get(key)} clubs in the DB, skipping`);
      continue;
    }
    const id = nameToId.get(key);
    if (!id) {
      unmatched++;
      console.log(`[skip] no match for "${club.name}" (${club.source_key})`);
      continue;
    }
    const newKey = `cbf:${id}`;
    matched++;
    console.log(`[${live ? "update" : "plan"}] "${club.name}" ${club.source_key} -> ${newKey}`);
    if (live) {
      const upd = await admin.from("clubes").update({ source_key: newKey }).eq("id", club.id);
      if (upd.error) console.log(`  ERROR: ${upd.error.message}`);
    }
  }
  console.log(`[backfill-cbf-club-ids] matched ${matched}, unmatched ${unmatched}, ambiguous ${ambiguous}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

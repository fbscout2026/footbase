// FOOTBASE — upgrade pontual (Session 52), rodado uma única vez: os ~20 clubes que a
// automação já tinha processado ANTES da lista curada da Wikipédia existir ficaram
// com o escudo oficial da CBF (fundo branco, sem transparência — ver `cbf-crest.ts`).
// Este script troca a imagem deles pela versão da Wikipédia (transparente) sempre
// que o clube está em `CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY` — ao contrário de
// `ensureClubCrest` (que nunca sobrescreve um `webp_crest_url` já existente, porque
// pode ter sido curado manualmente por um admin), aqui a sobrescrita é intencional:
// o valor atual É o próprio auto-fetch da CBF, não uma curadoria manual.
//
// Uso: node --experimental-strip-types lib/services/scraper/upgrade-curated-crests.ts

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWikipediaCrestWebp } from "./wikipedia-crest.ts";
import { CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY } from "./curated-crest-sources.ts";

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
  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: clubs, error } = await admin.from("clubes").select("id,name,source_key").in("source_key", Object.keys(CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY));
  if (error) throw error;

  let upgraded = 0, failed = 0;
  for (const club of clubs ?? []) {
    const title = CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY[club.source_key]!;
    const webp = await fetchWikipediaCrestWebp(title);
    if (!webp) {
      failed++;
      console.log(`[fail] "${club.name}" (${club.source_key}) — Wikipedia fetch/convert failed for "${title}"`);
      continue;
    }
    const idMatch = club.source_key.match(/^cbf:(\d+)$/);
    const fileName = `cbf-${idMatch![1]!}.webp`;
    mkdirSync("public/crests", { recursive: true });
    writeFileSync(`public/crests/${fileName}`, webp);
    await admin.from("clubes").update({ webp_crest_url: `/crests/${fileName}` }).eq("id", club.id);
    upgraded++;
    console.log(`[upgraded] "${club.name}" (${club.source_key}) <- "${title}"`);
  }
  console.log(`[upgrade-curated-crests] upgraded ${upgraded}, failed ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

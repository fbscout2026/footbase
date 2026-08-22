// FOOTBASE Session 56 — "FB-ID: chave suprema" backfill (plan step 7).
//
// Closes the bookkeeping gap the plan documents: CBF/FMF/FGF athletes ingested
// before `run-live-ingestion.ts` was wired through `resolveAthleteIdentity()`
// never got an `atleta_fontes` row recording where their fb_id came from — only
// the FERJ live path (`ingestOneFerjMatch`) has always written one. This script
// closes that gap for EVERY athlete whose fb_id is a real 6-digit CBF-shaped
// number, by inserting the one mapping that's already implied by the data
// itself: `(fonte='cbf', id_externo=fb_id::text)` → that same fb_id.
//
// Additive only — INSERT-only into atleta_fontes, never touches atletas.fb_id
// itself, never UPDATEs/DELETEs anything. Follows the project's hard rule for
// production writes: read-only by default, prints the real counts, requires
// --write to actually insert. Run:
//   node --experimental-strip-types lib/services/scraper/backfill-atleta-fontes.ts            # report only
//   node --experimental-strip-types lib/services/scraper/backfill-atleta-fontes.ts --write     # + inserts
//
// Three buckets, by fb_id range (same boundaries `isLegacyMockBid`/
// `isProvisionalBid` already use elsewhere):
//   100,000–999,999   (real CBF-shaped bid) → backfilled: (fonte='cbf', id_externo=fb_id)
//   >=900,000,000     (internally allocated) → NOT backfilled — every one of these
//                      already gets its atleta_fontes row at creation time
//                      (seedProvisionalAthlete / the new resolveSourceAthleteIdentities
//                      loop); one showing up here with zero mappings means it was
//                      written outside that flow — reported as a warning, never
//                      silently patched over with a guessed mapping.
//   1,000,000–899,999,999 (legacy mock/seed) → excluded entirely, not real source
//                      data, same exclusion `scan-athlete-duplicates.ts` already
//                      applies.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { isProvisionalBid, PROVISIONAL_BID_FLOOR } from "./provisional-athlete.ts";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function selectAll<T>(admin: SupabaseClient, table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = admin.from(table).select(columns).range(offset, offset + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

const MOCK_FLOOR = 1_000_000;
function isLegacyMockBid(fbId: number): boolean {
  return fbId >= MOCK_FLOOR && fbId < PROVISIONAL_BID_FLOOR;
}
function isRealCbfShapedBid(fbId: number): boolean {
  return fbId >= 100_000 && fbId < MOCK_FLOOR;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const write = process.argv.includes("--write");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key);

  const athletes = await selectAll<{ fb_id: number }>(admin, "atletas", "fb_id");
  const mappedFbIds = new Set(
    (await selectAll<{ fb_id: number }>(admin, "atleta_fontes", "fb_id")).map((m) => Number(m.fb_id)),
  );
  console.log(`[backfill-atleta-fontes] ${athletes.length} atleta(s), ${mappedFbIds.size} já com alguma linha em atleta_fontes`);

  const unmapped = athletes.map((a) => Number(a.fb_id)).filter((fbId) => !mappedFbIds.has(fbId));
  const toBackfill = unmapped.filter(isRealCbfShapedBid);
  const suspiciousProvisional = unmapped.filter(isProvisionalBid);
  const legacyMockSkipped = unmapped.filter(isLegacyMockBid);
  const otherUnrecognized = unmapped.filter((fbId) => !isRealCbfShapedBid(fbId) && !isProvisionalBid(fbId) && !isLegacyMockBid(fbId));

  console.log(`[backfill-atleta-fontes] ${unmapped.length} sem nenhuma linha em atleta_fontes:`);
  console.log(`  - ${toBackfill.length} fb_id CBF-shaped (100.000–999.999) → SERIAM backfillados como (fonte='cbf', id_externo=fb_id)`);
  console.log(`  - ${legacyMockSkipped.length} na faixa de mock legado (1.000.000–899.999.999) → ficam de fora, não é dado real de fonte nenhuma`);
  if (suspiciousProvisional.length > 0) {
    console.log(`  - ${suspiciousProvisional.length} fb_id INTERNAMENTE ALOCADO (>=900.000.000) sem nenhuma linha em atleta_fontes — NÃO deveria existir (todo provisório já nasce com a linha). Gravado fora do fluxo normal — reportado, NÃO backfillado automaticamente:`);
    for (const fbId of suspiciousProvisional.slice(0, 20)) console.log(`      fb_id ${fbId}`);
    if (suspiciousProvisional.length > 20) console.log(`      ... e mais ${suspiciousProvisional.length - 20}`);
  }
  if (otherUnrecognized.length > 0) {
    console.log(`  - ${otherUnrecognized.length} fb_id fora de qualquer faixa conhecida — reportado, não backfillado:`);
    for (const fbId of otherUnrecognized.slice(0, 20)) console.log(`      fb_id ${fbId}`);
  }

  if (!write) {
    console.log(`[backfill-atleta-fontes] Nada foi escrito — este script é somente leitura por padrão. Rode com --write para inserir os ${toBackfill.length} mapeamentos 'cbf' listados acima.`);
    return;
  }

  if (toBackfill.length === 0) {
    console.log(`[backfill-atleta-fontes] --write passado, mas não há nada pra inserir.`);
    return;
  }

  const rows = toBackfill.map((fbId) => ({ fonte: "cbf", id_externo: String(fbId), fb_id: fbId, confidence: "exact" as const }));
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await admin.from("atleta_fontes").insert(batch);
    if (error) throw error;
    inserted += batch.length;
    console.log(`[backfill-atleta-fontes] ${inserted}/${rows.length} inserido(s)...`);
  }
  console.log(`[backfill-atleta-fontes] concluído: ${inserted} mapeamento(s) 'cbf' inserido(s) em atleta_fontes.`);
}

main().catch((e) => {
  console.error("[backfill-atleta-fontes] falhou:", e);
  process.exit(1);
});

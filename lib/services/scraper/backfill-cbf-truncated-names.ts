// FOOTBASE — one-off backfill: fix truncated athlete names for CBF-sourced
// athletes (Session 57). Real incident that motivated this: "Andrey Fernandes
// de" — cut off mid-preposition, missing "Oliveira Nunes" — found live while
// investigating a duplicate-athlete report. `scan-glued-names.ts`'s existing
// heuristic (`nomeCompletoFromGlued`) doesn't catch this pattern (that one
// targets names with repeated/glued fragments, not simple truncation) — this
// is a DIFFERENT, real gap: 310 athletes system-wide have a name ending in a
// bare preposition ("de"/"da"/"do"/"dos"/"das"/"e"), 233 of them CBF-sourced
// and therefore fixable with the real name from `parse-cbf-athlete-detail.ts`
// (the same per-athlete endpoint `backfill-cbf-birthdates.ts` already uses) —
// ground truth, never a guess. Preview by default; only writes with --confirm.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/backfill-cbf-truncated-names.ts            # preview
//   node --experimental-strip-types lib/services/scraper/backfill-cbf-truncated-names.ts --confirm   # write

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { parseCbfAthleteDetail } from "./parse-cbf-athlete-detail.ts";
import { forEachRateLimited } from "./rate-limit.ts";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const KNOWN_COMPETITIONS: { competitionSlug: string; categorySlug: string; year: number }[] = [
  { competitionSlug: "campeonato-brasileiro", categorySlug: "sub-17", year: 2026 },
  { competitionSlug: "campeonato-brasileiro", categorySlug: "sub-20", year: 2026 },
  { competitionSlug: "campeonato-brasileiro", categorySlug: "sub-20-b", year: 2026 },
  { competitionSlug: "copa-do-brasil", categorySlug: "sub-15", year: 2026 },
  { competitionSlug: "copa-do-brasil", categorySlug: "sub-17", year: 2026 },
  { competitionSlug: "copa-do-brasil", categorySlug: "sub-20", year: 2026 },
  { competitionSlug: "copa-do-nordeste", categorySlug: "sub-20", year: 2026 },
  { competitionSlug: "liga-de-desenvolvimento", categorySlug: "sub-13-masculino", year: 2026 },
];

const TRAILING_PREPOSITIONS = new Set(["de", "da", "do", "dos", "das", "e"]);

function looksTruncated(name: string): boolean {
  const words = name.trim().split(/\s+/);
  return TRAILING_PREPOSITIONS.has(words[words.length - 1]!.toLowerCase());
}

async function main(): Promise<void> {
  loadEnvLocal();
  const confirm = process.argv.includes("--confirm");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const PAGE = 1000;
  const allAtletas: { fb_id: number; name: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from("atletas").select("fb_id,name").range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) allAtletas.push({ fb_id: Number(row.fb_id), name: row.name as string });
    if (data.length < PAGE) break;
  }
  const truncated = allAtletas.filter((a) => looksTruncated(a.name));
  console.log(`[backfill-cbf-truncated-names] ${truncated.length} atleta(s) com nome aparentemente truncado`);

  const { data: cbfFontes, error: fontesErr } = await admin.from("atleta_fontes").select("fb_id").eq("fonte", "cbf");
  if (fontesErr) throw fontesErr;
  const cbfIds = new Set((cbfFontes ?? []).map((r) => Number(r.fb_id)));
  const targets = truncated.filter((a) => cbfIds.has(a.fb_id));
  console.log(`[backfill-cbf-truncated-names] ${targets.length} deles com fonte CBF (corrigível com nome real)`);

  if (!confirm) {
    console.log(`\n[backfill-cbf-truncated-names] PREVIEW — amostra:`);
    for (const t of targets.slice(0, 15)) console.log(`  FB-${t.fb_id}: "${t.name}"`);
    console.log("[backfill-cbf-truncated-names] Modo preview (padrão) — nada foi escrito. Rode de novo com --confirm para executar de verdade.");
    return;
  }

  console.log("\n[backfill-cbf-truncated-names] --confirm passado — buscando nome real e gravando...");
  let ok = 0;
  let unchanged = 0;
  let failed = 0;
  await forEachRateLimited(
    targets,
    async (t) => {
      for (const comp of KNOWN_COMPETITIONS) {
        const detailUrl = `https://www.cbf.com.br/futebol-brasileiro/atletas/${comp.competitionSlug}/${comp.categorySlug}/${comp.year}/${t.fb_id}`;
        const html = await fetchText(detailUrl);
        if (!html) continue;
        const detail = parseCbfAthleteDetail(html);
        if (!detail || !detail.name) continue;
        if (detail.name === t.name || looksTruncated(detail.name)) {
          unchanged++;
          return;
        }
        const upd = await admin.from("atletas").update({ name: detail.name }).eq("fb_id", t.fb_id);
        if (upd.error) throw upd.error;
        console.log(`  [ok] FB-${t.fb_id}: "${t.name}" -> "${detail.name}"`);
        ok++;
        return;
      }
      failed++;
    },
    { minDelayMs: 700, jitterMs: 300 },
  );
  console.log(`\n[backfill-cbf-truncated-names] Concluído: ${ok} corrigido(s), ${unchanged} sem nome melhor encontrado, ${failed} sem página de detalhe.`);
}

main().catch((e) => {
  console.error("[backfill-cbf-truncated-names] falhou:", e);
  process.exit(1);
});

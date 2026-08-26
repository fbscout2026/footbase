// FOOTBASE — one-off backfill: real birth dates for CBF-sourced athletes
// (Session 57). Every athlete seeded from the CBF registry/súmula path alone
// never carried birth_date — confirmed live: all 8186 CBF-sourced athletes had
// `birth_date = null`. `parse-cbf-athlete-detail.ts`'s module doc explains the
// real per-athlete endpoint this uses. Never touches relationships/FKs, only
// `atletas.birth_date` for rows that already exist — same low-risk shape as
// `backfill-fes-crests.ts`. Preview by default; only writes with --confirm.
//
// Two-step discovery, both fetch-only, no Playwright:
//   1. For every {competitionSlug, categorySlug, year} already configured in
//      CBF_SOURCES (run-live-ingestion.ts) and every known `cbf:*` club, fetch
//      that team's roster page — cheap, tolerates a miss (team didn't play that
//      competition) as an empty/failed parse, never an error.
//   2. For every distinct real atleta_id found whose matching `atletas` row
//      still has `birth_date IS NULL`, fetch that athlete's own detail page and
//      parse the real birth date.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/backfill-cbf-birthdates.ts            # preview
//   node --experimental-strip-types lib/services/scraper/backfill-cbf-birthdates.ts --confirm   # write

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { parseCbfAthleteDetail, parseCbfTeamRoster } from "./parse-cbf-athlete-detail.ts";
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

// Every {competitionSlug, categorySlug, year} CBF_SOURCES already knows about
// (run-live-ingestion.ts) — real, curated, working URLs, not guessed.
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

async function main(): Promise<void> {
  loadEnvLocal();
  const confirm = process.argv.includes("--confirm");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: cbfClubs, error: clubsErr } = await admin.from("clubes").select("source_key").like("source_key", "cbf:%");
  if (clubsErr) throw clubsErr;
  const teamIds = [...new Set((cbfClubs ?? []).map((c) => c.source_key!.replace("cbf:", "")))];
  console.log(`[backfill-cbf-birthdates] ${teamIds.length} clube(s) CBF conhecido(s) x ${KNOWN_COMPETITIONS.length} competição/categoria/ano`);

  // Step 1: discover real atleta_ids via team roster pages.
  const rosterJobs: { teamId: string; comp: (typeof KNOWN_COMPETITIONS)[number] }[] = [];
  for (const comp of KNOWN_COMPETITIONS) for (const teamId of teamIds) rosterJobs.push({ teamId, comp });

  const athleteIds = new Set<number>();
  let rosterHits = 0;
  await forEachRateLimited(
    rosterJobs,
    async (job) => {
      const rosterUrl = `https://www.cbf.com.br/futebol-brasileiro/times/${job.comp.competitionSlug}/${job.comp.categorySlug}/${job.comp.year}/${job.teamId}`;
      const html = await fetchText(rosterUrl);
      if (!html) return;
      const ids = parseCbfTeamRoster(html);
      if (ids.length > 0) rosterHits++;
      for (const id of ids) athleteIds.add(id);
    },
    { minDelayMs: 700, jitterMs: 300 },
  );
  console.log(`[backfill-cbf-birthdates] ${rosterHits} roster(s) real(is) encontrado(s), ${athleteIds.size} atleta_id(s) distinto(s)`);

  // Only fetch detail pages for athletes we actually have, still missing birth_date.
  const PAGE = 1000;
  const needsBirthDate = new Set<number>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from("atletas").select("fb_id").is("birth_date", null).range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) if (athleteIds.has(Number(row.fb_id))) needsBirthDate.add(Number(row.fb_id));
    if (data.length < PAGE) break;
  }
  console.log(`[backfill-cbf-birthdates] ${needsBirthDate.size} atleta(s) nosso(s) sem birth_date, achável(is) via essas competições`);

  if (needsBirthDate.size === 0) {
    console.log("[backfill-cbf-birthdates] Nada a fazer.");
    return;
  }

  if (!confirm) {
    console.log(`\n[backfill-cbf-birthdates] PREVIEW — ${needsBirthDate.size} atleta(s) receberiam birth_date real.`);
    console.log("[backfill-cbf-birthdates] Modo preview (padrão) — nada foi escrito. Rode de novo com --confirm para executar de verdade.");
    return;
  }

  console.log("\n[backfill-cbf-birthdates] --confirm passado — buscando data de nascimento real e gravando...");
  let ok = 0;
  let failed = 0;
  await forEachRateLimited(
    [...needsBirthDate],
    async (atletaId) => {
      // Any known competition context works — the athlete detail payload is
      // athlete-centric, not really scoped to the URL's own competition.
      for (const comp of KNOWN_COMPETITIONS) {
        const detailUrl = `https://www.cbf.com.br/futebol-brasileiro/atletas/${comp.competitionSlug}/${comp.categorySlug}/${comp.year}/${atletaId}`;
        const html = await fetchText(detailUrl);
        if (!html) continue;
        const detail = parseCbfAthleteDetail(html);
        if (!detail) continue;
        const upd = await admin.from("atletas").update({ birth_date: detail.birthDateIso }).eq("fb_id", atletaId);
        if (upd.error) throw upd.error;
        ok++;
        return;
      }
      failed++;
    },
    { minDelayMs: 700, jitterMs: 300 },
  );
  console.log(`\n[backfill-cbf-birthdates] Concluído: ${ok} gravado(s), ${failed} sem página de detalhe encontrada.`);
}

main().catch((e) => {
  console.error("[backfill-cbf-birthdates] falhou:", e);
  process.exit(1);
});

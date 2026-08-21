// FOOTBASE Session 55 — one-off catch-up for the FERJ matches recorded 'done' in
// scraping_jobs BEFORE the identity-resolution step existed (see run-live-
// ingestion.ts's `ingestOneFerjMatch` module doc). The live executor's normal
// skip-already-done optimization would never revisit these, so this bypasses that
// check on purpose, for the known matchIds only — reusing the EXACT SAME shared
// per-match function the executor itself uses (`ingestOneFerjMatch`), never a
// separate reimplementation.
//
// Safe to run more than once: `ingestOneFerjMatch` is idempotent (existing mappings
// are reused, `ingestMatch` upserts by stable keys) and this only ever ADDS records
// — no merge, no delete.
//
// Dry-run by default; --confirm to write. Run:
//   node --experimental-strip-types lib/services/scraper/catchup-ferj-athletes.ts [--confirm] [--limit=N]

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { loadFerjIdentityState, ingestOneFerjMatch } from "./run-live-ingestion.ts";
import { recordScrapingJob } from "./scraping-jobs.ts";
import { forEachRateLimited } from "./rate-limit.ts";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? Number(limitArg) : undefined;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key);

  console.log(`[ferj-catchup] modo: ${confirm ? "LIVE (vai escrever)" : "DRY-RUN (nenhuma escrita)"}${limit ? `, limit=${limit}` : ""}`);

  const { data: jobs, error: jobsErr } = await admin.from("scraping_jobs").select("ref").eq("source", "FERJ").eq("job_type", "sumula").eq("status", "done");
  if (jobsErr) throw jobsErr;
  const matchIds = [...new Set((jobs ?? []).map((j) => Number(j.ref)))];
  const scoped = limit ? matchIds.slice(0, limit) : matchIds;
  console.log(`[ferj-catchup] ${scoped.length} partida(s) já marcadas 'done' para reprocessar (de ${matchIds.length})`);

  const state = await loadFerjIdentityState(admin);
  const provisionalBidStart = state.nextProvisionalBid;

  const outcomes = await forEachRateLimited(
    scoped,
    (matchId) => ingestOneFerjMatch(admin, matchId, undefined, !confirm, state),
    { minDelayMs: 900, jitterMs: 400 },
  );

  const counts = new Map<string, number>();
  let totalAppearances = 0;
  for (let i = 0; i < scoped.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    if (!o.error && o.result!.outcome === "ingested") {
      const m = o.result!.detail.match(/(\d+) atuaç/);
      if (m) totalAppearances += Number(m[1]);
    }
    if (confirm && !o.error) {
      await recordScrapingJob(
        admin,
        { source: "FERJ", jobType: "sumula", ref: String(scoped[i]) },
        o.result!.outcome === "ingested" || o.result!.outcome === "unresolved-players"
          ? { status: "done", payload: { url: o.result!.sourceUrl, competition: "FERJ SUB-11..SUB-20 (catchup)" } }
          : { status: "failed", error: o.result!.detail, payload: { url: o.result!.sourceUrl, competition: "FERJ SUB-11..SUB-20 (catchup)" } },
      );
    }
  }

  console.log(`\n[ferj-catchup] resumo (${confirm ? "LIVE" : "DRY-RUN"}):`);
  for (const [outcome, n] of counts) console.log(`  ${outcome}: ${n}`);
  console.log(`  atuações ${confirm ? "gravadas" : "planejadas"}: ${totalAppearances}`);
  console.log(`  atletas com bid provisório ${confirm ? "criados" : "que seriam criados"}: ${state.nextProvisionalBid - provisionalBidStart} (bid ${provisionalBidStart}..${state.nextProvisionalBid - 1})`);

  const errors = outcomes.filter((o) => o.error);
  if (errors.length > 0) {
    console.log(`\n[ferj-catchup] erros (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  ${e.error}`);
  }
}

main().catch((e) => {
  console.error("[ferj-catchup] falhou:", e);
  process.exit(1);
});

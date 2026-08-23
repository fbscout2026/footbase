// FOOTBASE Session 57 — one-off catch-up for the FERJ discovery gap found live: the
// listing-page card regex required a "série" 3rd span that some real campeonatos
// ("Padrao", "Guilherme Embry" — real Sub-16/Sub-20 matches with published súmulas)
// never render, so those matches were NEVER discovered at all (no row in
// scraping_jobs, not even a "failed" one) — see discovery/ferj-discover.ts's
// CARD_RE doc for the fix. FERJ_SOURCES only ever scans the CURRENT year, so 2026
// self-heals via the normal cron now that the regex is fixed; this script re-runs
// discovery for past years (confirmed live to have real affected matches: 2024 and
// 2025) using the exact same shared `processFerjSource` the live executor calls —
// never a separate reimplementation. Reuses the executor's own skip-already-done
// check, so it's safe to run more than once and safe to run even though most
// matches in those years (Estadual, Copa Rio, ...) are already ingested — only the
// genuinely-new ones (previously invisible to discovery) do any work.
//
// Dry-run by default; --confirm to write. Run:
//   node --experimental-strip-types lib/services/scraper/catchup-ferj-discovery-gap.ts [--confirm] [--years=2024,2025]

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { processFerjSource, type FerjSourceConfig } from "./run-live-ingestion.ts";

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
  const yearsArg = args.find((a) => a.startsWith("--years="))?.split("=")[1];
  const years = (yearsArg ? yearsArg.split(",").map(Number) : [2024, 2025]).sort();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`[ferj-discovery-gap-catchup] modo: ${confirm ? "LIVE (vai escrever)" : "DRY-RUN (nenhuma escrita)"}, anos: ${years.join(", ")}`);

  for (const ano of years) {
    const cfg: FerjSourceConfig = {
      kind: "ferj",
      label: `FERJ SUB-11..SUB-20 (catchup gap ${ano})`,
      ano,
      meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    };
    console.log(`\n[ferj-discovery-gap-catchup] ano ${ano}...`);
    const results = await processFerjSource(admin, cfg, !confirm, () => {});

    const counts = new Map<string, number>();
    let totalAppearances = 0;
    for (const r of results) {
      counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
      if (r.outcome === "ingested") {
        const m = r.detail.match(/(\d+) atuaç/);
        if (m) totalAppearances += Number(m[1]);
      }
    }
    console.log(`[ferj-discovery-gap-catchup] ano ${ano} resumo:`);
    for (const [outcome, n] of counts) console.log(`  ${outcome}: ${n}`);
    console.log(`  atuações ${confirm ? "gravadas" : "planejadas"}: ${totalAppearances}`);

    for (const r of results.filter((r) => r.outcome !== "skipped-already-done" && r.outcome !== "ingested")) {
      console.log(`  [${r.outcome}] ${r.source} — ${r.sourceUrl}\n    ${r.detail}`);
    }
  }
}

main().catch((e) => {
  console.error("[ferj-discovery-gap-catchup] falhou:", e);
  process.exit(1);
});

// FOOTBASE — daily Supabase keep-alive (Session 57).
//
// The free plan pauses a project after ~7 days with no API/database activity —
// confirmed live this session (backup-db-snapshot.ts failed with `fetch failed`,
// DNS for the project's own subdomain came back "Non-existent domain" both
// locally and against 8.8.8.8, the dashboard showed "Project is paused"). The
// 2x/week ingestion cron should already be frequent enough on its own (every
// ~3-4 days, safely under the 7-day window), but the exact "what counts as
// activity" algorithm isn't documented with certainty, and there can be a real
// gap between "VPS is live" and "first real user traffic" where the ingestion
// cron is the ONLY thing touching the database at all. A trivial daily query
// costs nothing and removes the guesswork.
//
// Run (intended: 1x/day via cron on the VPS, alongside the ingestion cron):
//   node --experimental-strip-types lib/services/scraper/supabase-healthcheck.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
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

  const { error } = await admin.from("categoria_ordem").select("categoria").limit(1);
  if (error) throw error;
  console.log(`[supabase-healthcheck] ok — ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error("[supabase-healthcheck] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

// FOOTBASE Session 57 — read-only scan applying the upgraded glued-name heuristic
// (nomeCompletoFromGlued/cleanGluedName, see parse-cbf-sumula.ts's module doc) against
// every already-stored `atletas.name` to find rows that would now clean up better than
// when they were first ingested (some under the OLD, weaker per-source heuristics; some
// simply never had the ellipsis/leading-noise/pattern-2 improvements applied). Same
// pattern as scan-athlete-duplicates.ts/scan-club-duplicates.ts: read-only by default,
// only reports counts + a sample — no write path in this file at all.
//
// Run: node --experimental-strip-types lib/services/scraper/scan-glued-names.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { nomeCompletoFromGlued } from "./parse-cbf-sumula.ts";

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
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows: { fb_id: number; name: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("atletas").select("fb_id,name").range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as { fb_id: number; name: string }[]));
    if (data.length < PAGE) break;
  }
  console.log(`[scan-glued-names] ${rows.length} atletas carregados.`);

  const improved: { fb_id: number; before: string; after: string }[] = [];
  for (const r of rows) {
    const cleaned = nomeCompletoFromGlued(r.name);
    if (cleaned !== r.name) improved.push({ fb_id: r.fb_id, before: r.name, after: cleaned });
  }

  console.log(`[scan-glued-names] ${improved.length} nomes melhorariam com a heurística atualizada.`);
  console.log(`[scan-glued-names] amostra (até 40):`);
  for (const c of improved.slice(0, 40)) {
    console.log(`  FB-${c.fb_id}: "${c.before}" -> "${c.after}"`);
  }
}

main().catch((e) => {
  console.error("[scan-glued-names] falhou:", e);
  process.exit(1);
});

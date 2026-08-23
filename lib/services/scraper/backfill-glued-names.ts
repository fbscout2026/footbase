// FOOTBASE Session 57 — one-off backfill applying the upgraded glued-name heuristic
// (see parse-cbf-sumula.ts's `nomeCompletoFromGlued` module doc) to `atletas.name`
// values that were already stored with a still-glued "apelido+nomeCompleto" blob —
// either because they were ingested before this session's heuristic upgrade, or
// because the older per-source heuristic (FMF/FERJ, upgraded in this same session)
// never even tried the ellipsis/leading-noise/pattern-2 checks CBF's already had.
//
// Read-only preview by default (mirrors scan-glued-names.ts's own scan, restated
// here so this file's own dry-run output is self-contained), only writes `name` —
// UPDATE, never DELETE, one row's own name column, most reversible edit type there
// is; still follows the project's hard rule (backup immediately before, explicit
// row-count preview, one write pass, no other column touched):
//
//   node --experimental-strip-types lib/services/scraper/backfill-glued-names.ts           (dry-run, default)
//   node --experimental-strip-types lib/services/scraper/backfill-glued-names.ts --write    (writes for real)

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
  const write = process.argv.includes("--write");
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

  const changes: { fb_id: number; before: string; after: string }[] = [];
  for (const r of rows) {
    const cleaned = nomeCompletoFromGlued(r.name);
    if (cleaned !== r.name) changes.push({ fb_id: r.fb_id, before: r.name, after: cleaned });
  }

  console.log(`[backfill-glued-names] modo: ${write ? "LIVE (vai escrever)" : "DRY-RUN (nenhuma escrita)"}`);
  console.log(`[backfill-glued-names] ${rows.length} atletas verificados, ${changes.length} nomes serão atualizados.`);

  if (!write) {
    console.log(`[backfill-glued-names] amostra (até 20):`);
    for (const c of changes.slice(0, 20)) console.log(`  FB-${c.fb_id}: "${c.before}" -> "${c.after}"`);
    console.log(`[backfill-glued-names] dry-run apenas — rode com --write para gravar de verdade.`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const c of changes) {
    const { error } = await admin.from("atletas").update({ name: c.after }).eq("fb_id", c.fb_id);
    if (error) {
      failed++;
      console.error(`  [erro] FB-${c.fb_id}: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`[backfill-glued-names] resumo: ${ok} atualizados, ${failed} falharam.`);
}

main().catch((e) => {
  console.error("[backfill-glued-names] falhou:", e);
  process.exit(1);
});

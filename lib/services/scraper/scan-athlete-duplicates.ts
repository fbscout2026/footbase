// FOOTBASE Session 55 — read-only athlete duplicate scan.
//
// Companion to provisional-athlete.ts: since ingestion never blocks on identity
// review (every unresolved athlete gets a PROVISIONAL bid immediately — see that
// module's doc), the same real person can end up with more than one `atletas` row
// when they're seen across different sources without a strong (name+birth_date)
// match. This is the exact same shape as club duplication across sources
// (CLAUDE.md "Fusão de clubes entre fontes") — this script is the athlete
// equivalent of the club dedup scan that fed `merge-clube.ts`.
//
// READ-ONLY. Groups athletes by normalized name and reports every group with more
// than one member, so a human can decide (via merge-atleta.ts) which pairs are
// really the same person. NEVER auto-merges — a shared name alone is exactly the
// weak signal `resolve-athlete-identity.ts` already refuses to act on by itself
// (confirmed real false positives for clubs with this same pattern — CLAUDE.md's
// "Democrata Futebol Clube" vs "Esporte Clube Democrata" case).
//
// Run: node --experimental-strip-types lib/services/scraper/scan-athlete-duplicates.ts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { normalizeName } from "./resolve-athlete-identity.ts";
import { isProvisionalBid } from "./provisional-athlete.ts";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function selectAll<T>(admin: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from(table).select(columns).range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

interface AthleteRow {
  bid: number;
  name: string;
  birth_date: string | null;
  current_club_id: string | null;
  current_category: string | null;
  total_matches: number;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key);

  const athletes = await selectAll<AthleteRow>(admin, "atletas", "bid, name, birth_date, current_club_id, current_category, total_matches");
  console.log(`[scan-atleta] ${athletes.length} atleta(s) carregado(s)`);

  const clubIds = [...new Set(athletes.map((a) => a.current_club_id).filter((id): id is string => id != null))];
  const clubNameById = new Map<string, string>();
  const PAGE = 1000;
  for (let i = 0; i < clubIds.length; i += PAGE) {
    const { data } = await admin.from("clubes").select("id, name").in("id", clubIds.slice(i, i + PAGE));
    for (const c of data ?? []) clubNameById.set(c.id as string, c.name as string);
  }

  const groups = new Map<string, AthleteRow[]>();
  for (const a of athletes) {
    const key = normalizeName(a.name);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`[scan-atleta] ${duplicateGroups.length} grupo(s) de nome duplicado encontrado(s)\n`);

  let strongCount = 0;
  for (const group of duplicateGroups) {
    const birthDates = new Set(group.map((a) => a.birth_date).filter(Boolean));
    // "Strong" = every member shares the exact same known birth_date — as close to a
    // safe auto-merge signal as this scan gets, still never auto-applied here.
    const strong = birthDates.size === 1 && group.every((a) => a.birth_date);
    if (strong) strongCount++;
    console.log(`${strong ? "[FORTE — mesmo nascimento]" : "[fraco — só nome]"} "${group[0]!.name}" (${group.length} atleta(s)):`);
    for (const a of group.sort((x, y) => y.total_matches - x.total_matches)) {
      const club = a.current_club_id ? (clubNameById.get(a.current_club_id) ?? a.current_club_id) : "sem clube atual";
      const provisional = isProvisionalBid(a.bid) ? " [bid provisório]" : "";
      console.log(`  bid ${a.bid}${provisional} — nasc. ${a.birth_date ?? "?"} — ${a.current_category ?? "?"} — ${club} — ${a.total_matches} partida(s)`);
    }
    console.log("");
  }

  console.log(`[scan-atleta] resumo: ${duplicateGroups.length} grupo(s), ${strongCount} forte(s) (nome+nascimento batendo), ${duplicateGroups.length - strongCount} fraco(s) (só nome — revisar clube/categoria manualmente).`);
  console.log(`[scan-atleta] Nada foi escrito — este script é somente leitura. Use merge-atleta.ts <loserId> <winnerId> [--confirm] para fundir um par confirmado.`);
}

main().catch((e) => {
  console.error("[scan-atleta] falhou:", e);
  process.exit(1);
});

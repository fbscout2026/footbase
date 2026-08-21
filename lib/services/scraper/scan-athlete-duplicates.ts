// FOOTBASE Session 55 — athlete duplicate scan. Read-only by default; --write
// persists real candidates for admin review in the UI (see module doc below the
// `findDuplicateGroups` for why the matching stayed conservative).
//
// Companion to provisional-athlete.ts: since ingestion never blocks on identity
// review (every unresolved athlete gets a PROVISIONAL bid immediately — see that
// module's doc), the same real person can end up with more than one `atletas` row
// when they're seen across different sources without a strong (name+birth_date)
// match. This is the exact same shape as club duplication across sources
// (CLAUDE.md "Fusão de clubes entre fontes") — this script is the athlete
// equivalent of the club dedup scan that fed `merge-clube.ts`.
//
// NEVER auto-merges on name alone — a shared name is exactly the weak signal
// `resolve-athlete-identity.ts` already refuses to act on by itself (confirmed real
// false positives for clubs with this same pattern — CLAUDE.md's "Democrata
// Futebol Clube" vs "Esporte Clube Democrata" case, and confirmed AGAIN live for
// athletes in this exact scan — see `findDuplicateGroups`'s doc). Four tiers:
//   FORTE        — exact name match + every member shares the same known birth_date.
//   CLUBE+NOME   — exact name match + every member currently at the SAME real club.
//                  The athlete equivalent of the club scan's "crest+state" signal
//                  (CLAUDE.md) — the second, independent confirming fact that makes
//                  a name match trustworthy instead of coincidental. The ONLY tiers
//                  `--write` persists — real merge candidates.
//   revisar-nome — a tolerant match only (first+last token, or glued-name
//                  containment) — visibility only, printed but NEVER persisted or
//                  treated as a candidate; two rounds of testing this against real
//                  data both produced false positives.
//   fraco        — name match only, no club/birth_date confirmation.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/scan-athlete-duplicates.ts            # read-only report
//   node --experimental-strip-types lib/services/scraper/scan-athlete-duplicates.ts --write     # + persists forte/clube+nome to atleta_duplicate_candidates

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

export interface AthleteRow {
  bid: number;
  name: string;
  birth_date: string | null;
  current_club_id: string | null;
  current_category: string | null;
  total_matches: number;
}

function looseKey(name: string): string | null {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  return `${tokens[0]}|${tokens[tokens.length - 1]}`;
}

const MIN_GLUED_LEN = 8; // avoids short/common substrings causing false positives

function isGluedVariant(a: string, b: string): boolean {
  const na = normalizeName(a).replace(/\s+/g, "");
  const nb = normalizeName(b).replace(/\s+/g, "");
  if (na === nb) return false; // already caught by exact matching
  if (na.length < MIN_GLUED_LEN || nb.length < MIN_GLUED_LEN) return false;
  return na.includes(nb) || nb.includes(na);
}

export interface DuplicateGroup {
  key: string;
  tier: "forte" | "clube+nome" | "revisar-nome" | "fraco";
  members: AthleteRow[];
}

// Legacy mock/seed data (pre-real-ingestion, roughly bid 1,000,000-899,999,999 —
// confirmed live twice, Session 55: both false-positive merge candidates the loose
// matching produced ("Pedro Henrique" bid 2210223, "Miguel Santos" bid 2311502)
// turned out to be leftover mock rows in exactly this band — fabricated
// height/weight/contract data, zero real matches, zero atleta_fontes mapping. Never
// a legitimate merge target: excluded from the scan entirely so it can't produce
// another one.
function isLegacyMockBid(bid: number): boolean {
  return bid >= 1_000_000 && bid < 900_000_000;
}

/**
 * Session 55, correction after real false positives found live: two rounds of
 * "tolerant" matching (first+last token; then glued-name containment) both got
 * tested against real data and BOTH produced false positives — common Portuguese
 * first/last names (e.g. "Rian ... Da Silva" vs "Rian ... Grigorio Silva",
 * confirmed different: `merge-atleta.ts`'s own same-match collision check caught
 * one of them mid-preview) and ambiguous name-prefix pairs (a shorter name isn't
 * reliably "the same person, truncated" — it can just as easily be a genuinely
 * different, less-fully-recorded person). Every tolerant heuristic tried is
 * demoted to `revisar-nome` — visibility only, a human MUST read the full name
 * and context before ever running `merge-atleta.ts --confirm` on one of these.
 *
 * The only thing that ever reaches `clube+nome` (a real merge candidate) is an
 * EXACT normalized full-name match, additionally confirmed by the same current
 * club — the athlete equivalent of the club scan's "crest+state" second signal.
 */
export function findDuplicateGroups(athletes: AthleteRow[]): DuplicateGroup[] {
  const real = athletes.filter((a) => !isLegacyMockBid(a.bid));

  const exactGroups = new Map<string, AthleteRow[]>();
  const looseGroups = new Map<string, AthleteRow[]>();
  for (const a of real) {
    const exact = normalizeName(a.name);
    if (exact) (exactGroups.get(exact) ?? exactGroups.set(exact, []).get(exact)!).push(a);
    const loose = looseKey(a.name);
    if (loose) (looseGroups.get(loose) ?? looseGroups.set(loose, []).get(loose)!).push(a);
  }

  // Glued-name containment, bounded to same-club rosters only (cheap: real club
  // rosters are small, never anywhere near the full 9,301 athletes) — visibility
  // only (see module doc), never auto-confirmed.
  const byClub = new Map<string, AthleteRow[]>();
  for (const a of real) {
    if (!a.current_club_id) continue;
    (byClub.get(a.current_club_id) ?? byClub.set(a.current_club_id, []).get(a.current_club_id)!).push(a);
  }
  const gluedPairs: AthleteRow[][] = [];
  for (const roster of byClub.values()) {
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        if (isGluedVariant(roster[i]!.name, roster[j]!.name)) gluedPairs.push([roster[i]!, roster[j]!]);
      }
    }
  }

  const results: DuplicateGroup[] = [];
  const exactBids = new Set<number>();

  for (const [key, members] of exactGroups) {
    if (members.length < 2) continue;
    const birthDates = new Set(members.map((a) => a.birth_date).filter(Boolean));
    const forte = birthDates.size === 1 && members.every((a) => a.birth_date);
    const clubIds = new Set(members.map((a) => a.current_club_id).filter(Boolean));
    const clubeENome = !forte && clubIds.size === 1 && members.every((a) => a.current_club_id);
    results.push({ key, tier: forte ? "forte" : clubeENome ? "clube+nome" : "fraco", members });
    for (const m of members) exactBids.add(m.bid);
  }

  for (const pair of gluedPairs) {
    const [a, b] = pair as [AthleteRow, AthleteRow];
    if (exactBids.has(a.bid) && exactBids.has(b.bid)) continue; // already covered above
    results.push({ key: `glued:${a.bid}:${b.bid}`, tier: "revisar-nome", members: [a, b] });
  }

  // Loose matches not already covered by an exact-name group — visibility only.
  for (const [key, members] of looseGroups) {
    if (members.length < 2) continue;
    if (members.every((m) => exactBids.has(m.bid))) continue; // subsumed by an exact group already
    results.push({ key: `loose:${key}`, tier: "revisar-nome", members });
  }

  return results;
}

/**
 * Persists 'forte'/'clube+nome' pairs into `atleta_duplicate_candidates` (Session
 * 55) — makes the scan's findings visible/actionable in /admin instead of only
 * ever existing in whoever's terminal happened to run this script. `onConflict:
 * "bid_a,bid_b", ignoreDuplicates: true` never overwrites a row an admin already
 * resolved (merged/dismissed) — a re-run only ever adds genuinely NEW candidates.
 */
async function persistCandidates(admin: SupabaseClient, groups: DuplicateGroup[]): Promise<number> {
  const rows: { bid_a: number; bid_b: number; tier: "forte" | "clube+nome" }[] = [];
  for (const group of groups) {
    if (group.tier !== "forte" && group.tier !== "clube+nome") continue;
    const bids = group.members.map((m) => m.bid).sort((a, b) => a - b);
    for (let i = 0; i < bids.length; i++) {
      for (let j = i + 1; j < bids.length; j++) {
        rows.push({ bid_a: bids[i]!, bid_b: bids[j]!, tier: group.tier });
      }
    }
  }
  if (rows.length === 0) return 0;
  const { error } = await admin.from("atleta_duplicate_candidates").upsert(rows, { onConflict: "bid_a,bid_b", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const write = process.argv.includes("--write");
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

  const groups = findDuplicateGroups(athletes);
  console.log(`[scan-atleta] ${groups.length} grupo(s) de nome duplicado encontrado(s)\n`);

  const counts = { forte: 0, "clube+nome": 0, "revisar-nome": 0, fraco: 0 };
  const label = {
    forte: "[FORTE — mesmo nascimento]",
    "clube+nome": "[CLUBE+NOME — nome idêntico + mesmo clube atual]",
    "revisar-nome": "[revisar nome — só primeiro/último nome batem, leia o nome completo antes de decidir]",
    fraco: "[fraco — só nome]",
  } as const;
  for (const group of groups) {
    counts[group.tier]++;
    console.log(`${label[group.tier]} (${group.members.length} atleta(s)):`);
    for (const a of group.members.slice().sort((x, y) => y.total_matches - x.total_matches)) {
      const club = a.current_club_id ? (clubNameById.get(a.current_club_id) ?? a.current_club_id) : "sem clube atual";
      const provisional = isProvisionalBid(a.bid) ? " [bid provisório]" : "";
      console.log(`  bid ${a.bid}${provisional} — "${a.name}" — nasc. ${a.birth_date ?? "?"} — ${a.current_category ?? "?"} — ${club} — ${a.total_matches} partida(s)`);
    }
    console.log("");
  }

  console.log(
    `[scan-atleta] resumo: ${groups.length} grupo(s) — ${counts.forte} forte(s), ${counts["clube+nome"]} clube+nome (candidatos reais de fusão — SEMPRE confira o nome completo antes de rodar --confirm), ` +
      `${counts["revisar-nome"]} pra revisar manualmente (nome parecido mas não idêntico), ${counts.fraco} fraco(s) (nunca fundir só por isso).`,
  );
  if (write) {
    const inserted = await persistCandidates(admin, groups);
    console.log(`[scan-atleta] --write passado: ${inserted} candidato(s) 'forte'/'clube+nome' enviado(s) pra atleta_duplicate_candidates (linhas já resolvidas antes nunca são sobrescritas). Revise em /admin.`);
  } else {
    console.log(`[scan-atleta] Nada foi escrito — este script é somente leitura por padrão. Rode com --write para salvar os candidatos 'forte'/'clube+nome' em atleta_duplicate_candidates (revisáveis em /admin), ou use merge-atleta.ts <loserId> <winnerId> [--confirm] direto pelo terminal.`);
  }
}

main().catch((e) => {
  console.error("[scan-atleta] falhou:", e);
  process.exit(1);
});

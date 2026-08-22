// FOOTBASE — club duplicate scan (companion to merge-clube.ts).
//
// Real incident that motivated this (CLAUDE.md "Fusão de clubes entre
// fontes"): each source (CBF, FERJ, FMF, FGF, ...) generates its own
// `source_key` — nothing today cross-references club identity BETWEEN
// sources, so the same real club can end up as multiple `clubes` rows
// (confirmed live: Flamengo had 3, several others had 2 each). It also
// happens WITHIN a single source when a súmula spells the same club's name
// slightly differently across matches (confirmed live for FGF, Session 55).
//
// NEVER auto-merges on name alone — "Democrata Futebol Clube" and "Esporte
// Clube Democrata" (CLAUDE.md) are two REAL, DIFFERENT clubs that only share
// a common word; only their escudos proved that. Same principle as
// scan-athlete-duplicates.ts: a name match alone is a weak signal.
//
// Two independent passes, mirroring CLAUDE.md's rule ("sempre confirmar por
// escudo + estado antes de fundir" + its explicit inverse):
//   A) group by normalized name + state -> same real club spelled two ways.
//      Only "confirmado" when every member's crest file hashes identical.
//   B) group by crest file hash alone (ignoring name) -> catches the common
//      name-vs-SAF-razão-social variant (e.g. "Vasco da Gama" vs "Vasco da
//      Gama Saf") that pass A's name grouping would never catch.
// Crests are stored locally (`clubes.webp_crest_url` is a `/crests/...`
// path written by ingest.ts's ensureClubCrest, never a remote URL), so
// hashing is a local file read — no network fetch, no timeout to worry
// about.
//
// Tiers:
//   confirmado — crest hash identical across every member (+ state doesn't
//                conflict, i.e. all equal or unset). The only tier a human
//                should feed into merge-clube.ts.
//   revisar    — name+state matched but crest hash differs/missing, OR
//                crest matched but state conflicts. Needs a human to look
//                at both escudos side by side before deciding.
// Never writes anything — this script only reports. Merging one confirmed
// pair at a time still goes through merge-clube.ts (preview by default,
// --confirm to write), which already refuses to touch a claimed club.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/scan-club-duplicates.ts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { normalizeName } from "./resolve-athlete-identity.ts";

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

export interface ClubRow {
  id: string;
  name: string;
  source_key: string | null;
  state: string | null;
  federacao: string | null;
  webp_crest_url: string | null;
  claim_status: string;
}

function crestHash(club: ClubRow): string | null {
  const url = club.webp_crest_url;
  if (!url || !url.startsWith("/crests/")) return null;
  const path = `public${url}`;
  if (!existsSync(path)) return null;
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

export interface ClubDuplicateGroup {
  key: string;
  basis: "nome+estado" | "escudo";
  tier: "confirmado" | "revisar";
  members: ClubRow[];
}

export function findClubDuplicateGroups(clubs: ClubRow[]): ClubDuplicateGroup[] {
  const hashOf = new Map<string, string | null>();
  for (const c of clubs) hashOf.set(c.id, crestHash(c));

  const results: ClubDuplicateGroup[] = [];
  const coveredPairs = new Set<string>();
  const pairKey = (a: string, b: string) => [a, b].sort().join(":");

  // Pass A — normalized name + state.
  const byNameState = new Map<string, ClubRow[]>();
  for (const c of clubs) {
    const key = `${normalizeName(c.name)}|${c.state ?? ""}`;
    (byNameState.get(key) ?? byNameState.set(key, []).get(key)!).push(c);
  }
  for (const [key, members] of byNameState) {
    if (members.length < 2) continue;
    const hashes = new Set(members.map((m) => hashOf.get(m.id)).filter((h): h is string => h != null));
    const allHashed = members.every((m) => hashOf.get(m.id) != null);
    const tier: ClubDuplicateGroup["tier"] = allHashed && hashes.size === 1 ? "confirmado" : "revisar";
    results.push({ key: `nome:${key}`, basis: "nome+estado", tier, members });
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) coveredPairs.add(pairKey(members[i]!.id, members[j]!.id));
  }

  // Pass B — crest hash alone (catches name-vs-SAF variants pass A misses).
  const byHash = new Map<string, ClubRow[]>();
  for (const c of clubs) {
    const h = hashOf.get(c.id);
    if (!h) continue;
    (byHash.get(h) ?? byHash.set(h, []).get(h)!).push(c);
  }
  for (const [hash, members] of byHash) {
    if (members.length < 2) continue;
    const allPairsCovered = members.every((_, i) =>
      members.slice(i + 1).every((m2) => coveredPairs.has(pairKey(members[i]!.id, m2.id))),
    );
    if (allPairsCovered) continue; // fully subsumed by a Pass A "confirmado"/"revisar" group already
    const states = new Set(members.map((m) => m.state).filter(Boolean));
    const tier: ClubDuplicateGroup["tier"] = states.size <= 1 ? "confirmado" : "revisar";
    results.push({ key: `escudo:${hash.slice(0, 12)}`, basis: "escudo", tier, members });
  }

  return results;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const clubs = await selectAll<ClubRow>(admin, "clubes", "id, name, source_key, state, federacao, webp_crest_url, claim_status");
  console.log(`[scan-clube] ${clubs.length} clube(s) carregado(s)`);

  const groups = findClubDuplicateGroups(clubs);
  console.log(`[scan-clube] ${groups.length} grupo(s) de possível duplicata encontrado(s)\n`);

  const counts = { confirmado: 0, revisar: 0 };
  for (const group of groups) {
    counts[group.tier]++;
    const label =
      group.tier === "confirmado"
        ? `[CONFIRMADO — ${group.basis === "nome+estado" ? "nome+estado, escudo idêntico" : "escudo idêntico, estado consistente"}]`
        : `[REVISAR — ${group.basis === "nome+estado" ? "nome+estado batem, mas escudo não confirma" : "escudo idêntico, mas estado diverge"}]`;
    console.log(`${label} (${group.members.length} clube(s)):`);
    for (const c of group.members) {
      const claim = c.claim_status === "claimed" ? " [REIVINDICADO — não fundir sem decisão manual]" : "";
      console.log(`  id ${c.id} — "${c.name}" — source_key=${c.source_key ?? "?"} — estado=${c.state ?? "?"} — federação=${c.federacao ?? "?"} — escudo=${c.webp_crest_url ?? "nenhum"}${claim}`);
    }
    console.log("");
  }

  console.log(
    `[scan-clube] resumo: ${groups.length} grupo(s) — ${counts.confirmado} confirmado(s) (candidatos reais de fusão — rode merge-clube.ts <loserId> <winnerId> pra cada par, preview antes de --confirm), ` +
      `${counts.revisar} pra revisar manualmente (nome ou escudo batem, mas o outro sinal não confirma — compare os escudos visualmente antes de decidir).`,
  );
  console.log(`[scan-clube] Este script é somente leitura — nada foi escrito. Nenhuma fusão acontece aqui.`);
}

main().catch((e) => {
  console.error("[scan-clube] falhou:", e);
  process.exit(1);
});

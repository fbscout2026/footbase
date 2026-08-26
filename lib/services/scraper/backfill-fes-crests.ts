// FOOTBASE — one-off backfill: fetch+save real crests for FES clubs ingested
// before `parseFesClubCrests` existed (Session 57). Never touches anything but
// `clubes.webp_crest_url` — no relationships, no clube_fontes, no institutional
// fields. Preview by default; only writes with --confirm, same protocol as
// merge-clube.ts.
//
// Run:
//   node --experimental-strip-types lib/services/scraper/backfill-fes-crests.ts            # preview
//   node --experimental-strip-types lib/services/scraper/backfill-fes-crests.ts --confirm   # write

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fetchCrestWebpFromUrl } from "./crest-fetch.ts";
import { normalizeName } from "./resolve-athlete-identity.ts";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// A handful of clubs whose súmula-derived name is abbreviated enough that even
// exact normalized-name matching misses the site's fuller display name — each
// one manually confirmed live this session (Session 57) by reading the site's
// own standings table, never guessed. Curated the same way `curated-crest-
// sources.ts` is: a human-verified exact link, not a fuzzy heuristic.
const MANUAL_SLUG_ALIASES: Record<string, string> = {
  "c-t-e-colatina": "espirito-santo-sociedade-esportiva", // site displays "CTE Colatina ES"
  "forte-futebol-club": "s-e-r-castelense", // site displays "Forte F.C." (old permalink slug retained after a rebrand)
  "desportiva-ferroviaria": "a-desportiva-ferroviaria-v-r-d", // site displays "A. Desportiva Ferroviária V.R.D."
  "coimbra-f-c": "coimbra-realfor-f-c", // site displays "Coimbra Realfor F.C."
};

/** Same 3-tier resolution chain validated live earlier this session (Rio Branco
 * case): (1) direct slug match against the standings table; (2) follow the real
 * `/time/{slug}/` page's own redirect to the site's canonical slug; (3) exact
 * normalized-name match against the site's real displayed name. Never a guess —
 * a miss on all 3 just means no crest yet, never a wrong one. */
async function resolveViaSiteChain(dbSlug: string, dbName: string, siteBySlug: Map<string, { name: string; crestUrl: string }>): Promise<string | null> {
  const direct = siteBySlug.get(dbSlug);
  if (direct) return direct.crestUrl;

  const alias = MANUAL_SLUG_ALIASES[dbSlug];
  if (alias) {
    const viaAlias = siteBySlug.get(alias);
    if (viaAlias) return viaAlias.crestUrl;
  }

  try {
    const res = await fetch(`https://futebolcapixaba.com/time/${dbSlug}/`, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const finalSlugMatch = res.url.match(/\/time\/([^/]+)\/?$/);
      if (finalSlugMatch) {
        const viaRedirect = siteBySlug.get(finalSlugMatch[1]!);
        if (viaRedirect) return viaRedirect.crestUrl;
      }
    }
  } catch {
    // ignore — falls through to the name-match tier
  }

  const wanted = normalizeName(dbName);
  for (const info of siteBySlug.values()) {
    if (normalizeName(info.name) === wanted) return info.crestUrl;
  }
  return null;
}

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

const CATEGORY_SLUGS = ["estadual-sub-11-2026", "estadual-sub-13-2026", "estadual-sub-15-2026", "estadual-sub-17-2026", "estadual-sub-20-2026"];

async function main(): Promise<void> {
  loadEnvLocal();
  const confirm = process.argv.includes("--confirm");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: clubs, error } = await admin.from("clubes").select("id,name,source_key").like("source_key", "fes-club:%").is("webp_crest_url", null);
  if (error) throw error;
  console.log(`[backfill-fes-crests] ${clubs.length} clube(s) da FES sem escudo`);

  const CLUB_CREST_RE = /href="https:\/\/futebolcapixaba\.com\/time\/([^"]+)\/">\s*<span class="team-logo"><img[^>]*\ssrc="([^"]+)"[^>]*>\s*<\/span>([^<]+)<\/a>/g;
  const siteBySlug = new Map<string, { name: string; crestUrl: string }>();
  for (const catSlug of CATEGORY_SLUGS) {
    const html = await fetch(`https://futebolcapixaba.com/campeonatos/${catSlug}/`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) }).then((r) => r.text());
    for (const m of html.matchAll(CLUB_CREST_RE)) {
      if (!siteBySlug.has(m[1]!)) siteBySlug.set(m[1]!, { name: m[3]!.trim(), crestUrl: m[2]! });
    }
  }
  console.log(`[backfill-fes-crests] ${siteBySlug.size} entidade(s) real(is) encontrada(s) no site\n`);

  const plan: { id: string; name: string; slug: string; crestUrl: string }[] = [];
  const unresolved: string[] = [];
  for (const c of clubs) {
    const slug = c.source_key.replace("fes-club:", "");
    const crestUrl = await resolveViaSiteChain(slug, c.name, siteBySlug);
    if (crestUrl) plan.push({ id: c.id, name: c.name, slug, crestUrl });
    else unresolved.push(`${c.name} (${c.source_key})`);
  }

  console.log(`\n[backfill-fes-crests] PREVIEW — ${plan.length} clube(s) receberiam escudo:`);
  for (const p of plan) console.log(`  ${p.name} (${p.slug}) <- ${p.crestUrl}`);
  if (unresolved.length > 0) {
    console.log(`\n[backfill-fes-crests] ${unresolved.length} sem correspondência no site (ficam sem escudo, não é erro):`);
    for (const u of unresolved) console.log(`  ${u}`);
  }

  if (!confirm) {
    console.log("\n[backfill-fes-crests] Modo preview (padrão) — nada foi escrito. Rode de novo com --confirm para executar de verdade.");
    return;
  }

  console.log("\n[backfill-fes-crests] --confirm passado — baixando e gravando de verdade...");
  let ok = 0;
  let failed = 0;
  for (const p of plan) {
    const webp = await fetchCrestWebpFromUrl(p.crestUrl);
    if (!webp) {
      console.log(`  [falhou] ${p.name} — não conseguiu baixar/converter ${p.crestUrl}`);
      failed++;
      continue;
    }
    const fileName = `fes-club-${p.slug}.webp`;
    mkdirSync("public/crests", { recursive: true });
    writeFileSync(`public/crests/${fileName}`, webp);
    const upd = await admin.from("clubes").update({ webp_crest_url: `/crests/${fileName}` }).eq("id", p.id);
    if (upd.error) throw upd.error;
    console.log(`  [ok] ${p.name} -> /crests/${fileName}`);
    ok++;
  }
  console.log(`\n[backfill-fes-crests] Concluído: ${ok} gravado(s), ${failed} falha(s).`);
}

main().catch((e) => {
  console.error("[backfill-fes-crests] falhou:", e);
  process.exit(1);
});

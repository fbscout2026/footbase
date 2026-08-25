// FOOTBASE — FES (Federação de Futebol do Estado do Espírito Santo) discovery (plain
// HTTP, NO Playwright — confirmed live: futebolcapixaba.com has no Cloudflare/bot
// detection at all, same as CBF/FMF/FGF/FERJ).
//
// FES's súmula is NOT a separate format to parse: it is the exact same "SÚMULA
// ON-LINE" PDF template CBF's own competitions use (confirmed live against a real
// downloaded fixture — same header labels, same "NºApelidoNome CompletoT/RP/ACBF"
// roster columns, same Gols/Cartões Amarelos/Cartões Vermelhos/Substituições event
// sections, and critically the SAME "CBF" column carrying the athlete's real 6-digit
// CBF bid directly) — so this adapter reuses `parse-cbf-sumula.ts`/`parse-cbf-events.ts`
// UNCHANGED for parsing, exactly like FGF (see `discovery/fgf-discover.ts`'s module
// doc) — no identity crosswalk/bridge, no provisional-athlete flow needed.
//
// Unlike FGF/FMF (one static page lists every round of a whole competition, súmula
// link already embedded, no second fetch needed), FES needs TWO hops per match, same
// shape as FERJ: (1) the tournament's own page
// (`futebolcapixaba.com/campeonatos/{slug}/`) lists every match's own detail-page URL
// for the WHOLE season in one response — no pagination hides real matches (confirmed
// live: the visible "Anteriores 1 2 3" control belongs to a client-side JS paginator,
// SportsPress's own `sp-paginated-table`, that hides table rows via CSS after the
// FULL season is already present in the raw HTML — a plain `fetch()` sees every
// match); (2) each match's own detail page
// (`futebolcapixaba.com/jogos/{slug}/`) carries the súmula PDF link ONLY once that
// match's súmula has actually been published — same "not published yet" non-error
// case every other adapter treats identically.
//
// The site runs the SportsPress WordPress plugin, which advertises a REST API
// (`/wp-json/sportspress/v2/events`) — tested live and confirmed BROKEN (always
// returns `[]` despite `X-WP-Total` claiming thousands of rows); HTML scraping of
// the season/match pages is the only working path.
//
// No stable numeric club id is exposed anywhere in the discovery HTML (unlike
// CBF/FMF/FERJ) — same situation as FGF, so FES clubs fall back to a name+UF-derived
// provisional `source_key`, used as the PERMANENT key (no better id to promote to
// later, matching FGF's precedent exactly).
//
// Every masculine base category (SUB-11, SUB-13, SUB-15, SUB-17, SUB-20) has its own
// stable-for-the-season slug under `/campeonatos/{slug}/` — feminino is out of scope
// (pre-existing project-wide decision, mirrors FERJ/FPF/FMF).
//
// ⚠️ YEARLY MAINTENANCE: `estadual-sub-20-2026` (and its siblings) almost certainly
// need re-deriving every season (same caveat as CBF_SOURCES/FMF_SOURCES) — the slug
// embeds the year.

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`FES fetch failed (${res.status}): ${url}`);
  return res.text();
}

export interface FesMatchRef {
  /** The match page's own URL — stable, unique, used as the `scraping_jobs` ref (FES
   * exposes no numeric match id to `fetch`). */
  matchUrl: string;
}

const MATCH_LINK_RE = /href="(https?:\/\/futebolcapixaba\.com\/jogos\/[^"?#]+\/)"/g;

/** Every distinct match detail-page URL referenced anywhere on one tournament's
 * season page (fixtures table + any sidebar "últimos/próximos jogos" widget also
 * link the same pages — deduped here so a match is never queued twice). */
export function parseFesCompetitionPage(html: string): FesMatchRef[] {
  const seen = new Set<string>();
  const refs: FesMatchRef[] = [];
  for (const m of html.matchAll(MATCH_LINK_RE)) {
    const url = m[1]!;
    if (seen.has(url)) continue;
    seen.add(url);
    refs.push({ matchUrl: url });
  }
  return refs;
}

/** Same normalization `run-live-ingestion.ts` uses to build `fes-club:{slug}`
 * source keys from a club name — kept here (not duplicated) so the standings-table
 * crest lookup below is guaranteed to key identically to the real source_key. */
export function fesClubSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The competition page's standings table links each club's own crest image right
// next to its name — `<a href=".../time/{slug}/"><span class="team-logo"><img
// src="CREST"/></span>CLUB NAME</a>` — a structural pairing straight from FES's own
// markup, never a name-guess: confirmed live against a real fetched page (Session
// 57). Keyed by `fesClubSlug` so a lookup miss (slight name spelling difference
// between the standings table and a given súmula) just means no crest is attached
// — never a WRONG club's crest.
const CLUB_CREST_RE = /href="https:\/\/futebolcapixaba\.com\/time\/[^"]+\/">\s*<span class="team-logo"><img[^>]*\ssrc="([^"]+)"[^>]*>\s*<\/span>([^<]+)<\/a>/g;

export function parseFesClubCrests(html: string): Map<string, string> {
  const bySlug = new Map<string, string>();
  for (const m of html.matchAll(CLUB_CREST_RE)) {
    const crestUrl = m[1]!;
    const name = m[2]!.trim();
    if (!name) continue;
    const slug = fesClubSlug(name);
    if (!bySlug.has(slug)) bySlug.set(slug, crestUrl);
  }
  return bySlug;
}

/** Fetches and parses one competition's full-season match listing, plus a
 * name-slug → crest-url map read from the same page's standings table. */
export async function discoverFesCompetition(slug: string): Promise<{ matches: FesMatchRef[]; clubCrests: Map<string, string> }> {
  const html = await fetchText(`https://futebolcapixaba.com/campeonatos/${slug}/`);
  return { matches: parseFesCompetitionPage(html), clubCrests: parseFesClubCrests(html) };
}

// The súmula link sits inside a distinctively-classed wrapper — confirmed live, real
// fixture — never confused with the separate "Boletim financeiro" PDF link some
// match pages also carry right next to it (that one has no such wrapper class).
const SUMULA_LINK_RE = /class="sumula">[\s\S]*?href="([^"]+\.pdf)"/;

/** The súmula PDF link from a match's own page — `null` when not (yet, or right
 * now) available, never thrown as an error (see module header). */
export async function fetchFesSumulaUrl(matchUrl: string): Promise<string | null> {
  const html = await fetchText(matchUrl);
  return html.match(SUMULA_LINK_RE)?.[1] ?? null;
}

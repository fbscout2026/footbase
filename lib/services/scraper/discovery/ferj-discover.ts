// FOOTBASE Phase 6.x — FERJ (Federação de Futebol do Estado do Rio de Janeiro)
// discovery (plain HTTP, NO Playwright — confirmed live: fferj.com.br and
// ferj360.com.br have no Cloudflare/bot-detection at all, unlike futebolpaulista.com.br
// — NOT unit tested in this repo, same "validate with `npm run ingest:dry-run`"
// convention as the other discovery modules).
//
// Unlike FPF/CBF (one discovery call per competition), FERJ discovery does NOT walk a
// per-competition URL — the site has 100+ base-football competitions (Estadual,
// Metropolitano, Copa Rio, Amador da Capital, Dente de Leite, Carioquinha, ...) with no
// stable per-competition id exposed to a plain `fetch`. Instead: the GLOBAL match
// listing (`/partidas?mes=M&ano=Y&tab=finalizados&pg=N`) already labels every card with
// its `campeonato | categoria | série` text — confirmed live, one real card:
//   <span>Estadual</span><span>|Sub-15</span><span>|A2</span>
// So discovery crawls that listing month by month (paginating within each month) and
// FILTERS by category label instead of walking a competition list. Two exclusions,
// both decided with the user (Session 46):
//  - Only SUB-11..SUB-20 (categoria_ordem's current range — Sub-06..Sub-10 exist on the
//    site but have no matching category yet, a separate pending product decision).
//  - Never "Brasileiro"/"Copa do Brasil" campeonatos — those are the CBF's OWN national
//    competitions (already ingested by `discovery/cbf-discover.ts` via `cbf.com.br`
//    directly); FERJ's site also lists Rio teams' fixtures in them, which would double
//    -ingest the same real-world matches under a different source if not excluded.
//  - Feminino is out of scope (pre-existing project-wide decision) — every card's série
//    label says "Feminino" for that division, so filtering it out is the same category-
//    label check, no separate gender field needed.

import { forEachRateLimited } from "../rate-limit.ts";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// See fmf-discover.ts's identical comment — confirmed live that an untimed `fetch()`
// can hang the whole executor forever on one stalled request.
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`FERJ fetch failed (${res.status}): ${url}`);
  return res.text();
}

export interface FerjMatchRef {
  matchId: number;
  campeonato: string;
  categoria: string; // normalized "SUB-N"
  serie: string;
}

const NATIONAL_CAMPEONATO_RE = /brasileiro|copa do brasil/i;
const FEMININO_RE = /feminino/i;

function normalizeCategoriaLabel(raw: string): string | null {
  const m = raw.match(/sub[\s-]*(\d{1,2})/i);
  if (!m) return null;
  return `SUB-${m[1]!}`;
}

const IN_SCOPE_CATEGORIES = new Set(Array.from({ length: 10 }, (_, i) => `SUB-${i + 11}`)); // SUB-11..SUB-20

// One match card: id (href), then the "campeonato | categoria [| série]" label block.
// Confirmed live: the label spans read literally `<span>|<!-- --> <!-- -->{text}</span>`
// (React's `{" "}` comment markers around the "|" separator) for the 2nd/3rd spans.
// The 3rd (série) span is OPTIONAL — confirmed live (Session 57): some real
// campeonatos ("Padrao", "Guilherme Embry", both with real Sub-16/Sub-20 matches
// and published súmulas) render only 2 spans (campeonato + categoria), no série at
// all. The original regex required exactly 3 spans, so it silently never matched
// these cards at all — a real discovery gap, not a category-filter exclusion (the
// categoria was always in scope, the card just never got extracted). `</div>` is
// anchored right after the optional 3rd span so the non-greedy `[\s\S]*?` can't
// jump past a missing 3rd span into the NEXT card's spans.
const CARD_RE =
  /href="\/partidas\/(\d+)"[\s\S]*?<div class="text-gray-700 uppercase text-14 my-5"><span>([^<]+)<\/span><span>[\s\S]*?-->([^<]+)<\/span>(?:<span>[\s\S]*?-->([^<]+)<\/span>)?<\/div>/g;

/** Parses one `/partidas?...` listing page's match cards, already filtered to
 * SUB-11..SUB-20 masculino non-CBF-national. Does not fetch anything else. */
export function parseFerjPartidasListing(html: string): FerjMatchRef[] {
  const refs: FerjMatchRef[] = [];
  const seen = new Set<number>(); // the whole page renders every card twice (see parse-ferj-events.ts's module doc)

  for (const m of html.matchAll(CARD_RE)) {
    const matchId = Number(m[1]!);
    if (seen.has(matchId)) continue;
    seen.add(matchId);

    const campeonato = m[2]!.trim();
    const categoriaRaw = m[3]!.trim();
    const serie = (m[4] ?? "").trim(); // absent for campeonatos with no série tier

    if (NATIONAL_CAMPEONATO_RE.test(campeonato)) continue;
    if (FEMININO_RE.test(campeonato) || FEMININO_RE.test(categoriaRaw) || FEMININO_RE.test(serie)) continue;

    const categoria = normalizeCategoriaLabel(categoriaRaw);
    if (!categoria || !IN_SCOPE_CATEGORIES.has(categoria)) continue;

    refs.push({ matchId, campeonato, categoria, serie });
  }

  return refs;
}

/** Total result pages for one month's `?tab=finalizados` listing (numeric page links
 * 1..N; a single-page month has none, which reads as N=1). */
function totalPages(html: string): number {
  const nums = [...html.matchAll(/[?&]pg=(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 1;
}

/** Crawls every finalized-match page for one month/year, paginating within it, and
 * returns only the in-scope (SUB-11..20, masculino, non-CBF-national) match refs. */
export async function discoverFerjMonth(mes: number, ano: number): Promise<FerjMatchRef[]> {
  const firstUrl = `https://www.fferj.com.br/partidas?mes=${mes}&ano=${ano}&tab=finalizados&pg=1`;
  const firstHtml = await fetchText(firstUrl);
  const pages = totalPages(firstHtml);

  const refs = parseFerjPartidasListing(firstHtml);
  if (pages <= 1) return refs;

  const rest = Array.from({ length: pages - 1 }, (_, i) => i + 2);
  const batches = await forEachRateLimited(
    rest,
    (pg) => fetchText(`https://www.fferj.com.br/partidas?mes=${mes}&ano=${ano}&tab=finalizados&pg=${pg}`),
    { minDelayMs: 500, jitterMs: 250 },
  );
  for (const b of batches) {
    if (b.result) refs.push(...parseFerjPartidasListing(b.result));
  }
  return refs;
}

/** The official closed súmula PDF link (`ferj360.com.br/carioca/uploads/...pdf`) and
 * raw HTML for one match's own page — the two inputs `buildFerjSumula` composes. */
export async function fetchFerjMatchPage(matchId: number): Promise<{ html: string; sumulaPdfUrl: string | null }> {
  const html = await fetchText(`https://www.fferj.com.br/partidas/${matchId}`);
  const pdfMatch = html.match(/href="(https:\/\/www\.ferj360\.com\.br\/carioca\/uploads\/[^"]+\.pdf)"/);
  return { html, sumulaPdfUrl: pdfMatch ? pdfMatch[1]! : null };
}

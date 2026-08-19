// FOOTBASE Phase 6.6 — FMF (Federação Mineira de Futebol) discovery (plain HTTP, NO
// Playwright — confirmed live: fmf.com.br and esumula/sge.fmf.com.br have no
// Cloudflare/bot-detection at all, same as CBF and unlike futebolpaulista.com.br. NOT
// unit tested in this repo against the live site — validated below against a real
// saved fixture; run `npm run ingest:dry-run` before ever pointing this at a gate.
//
// Unlike FERJ (global listing, filtered by category, no stable per-competition id)
// and CBF (a JSON API), FMF is closer to FPF's shape: ONE static page per competition
// —`https://fmf.com.br/Competicoes/ProxJogos.aspx?d={id}` — that lists EVERY round of
// the whole season on a single response (confirmed live: 15 rounds, no `pg=` pagination
// at all), each match already carrying its súmula PDF link and both clubs' crest image
// URLs directly in the markup — no separate per-match page fetch needed (unlike FERJ,
// which needs `fetchFerjMatchPage` for that). A match not yet played simply has no
// "Sumula_Jogo_..." link in its block — same "not published yet" case FERJ/CBF handle,
// not an error.
//
// Parsing strategy: the page repeats one exact delimiter div between every match row
// (and between the round's date header and its first match) — confirmed live, splitting
// the whole HTML on that literal string isolates each match into its own self-contained
// chunk, which is far more robust than one giant regex walking the deeply nested table
// markup. Each chunk is parsed independently, so a malformed/foreign chunk (the delimiter
// also appears once before the page's date-header text) just fails its own field checks
// and is skipped — it can never corrupt an adjacent real match's fields.
//
// Every masculine youth (SUB-13..SUB-20) division's `d` id is mapped in the source
// config (`run-live-ingestion.ts`'s `FMF_SOURCES`) — feminino (`d=7,36,32,20`) is
// deliberately excluded (pre-existing project-wide decision, mirrors FERJ/FPF).
//
// ⚠️ YEARLY MAINTENANCE, same caveat as CBF_SOURCES: the fixture's own page embeds
// "2026" in the competition name, so `d` almost certainly keys a SEASON EDITION, not a
// year-agnostic division — expect FMF's `d` ids to need rediscovery every season, same
// as CBF's tabelaPhaseUrls (see that config's comment for why this isn't a one-line fix).

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Every match row sits between two of these exact divs (also once before the round's
// date header) — splitting on it isolates each match into an independent chunk.
const CHUNK_DELIMITER =
  "<div style='height: 1px; border-top: solid 1px #d9d9d9; padding-left: 0px; padding-right: 0px; padding-bottom: 5px;'></div>";

// Confirmed live (Session 54): the discovery page for a larger division (~900KB+,
// e.g. SUB-20 1ª Divisão) stalled mid-request with the connection never closing —
// plain `fetch()` has no default timeout, so the whole executor hung indefinitely on
// this one request, silently stopping every remaining FMF competition behind it in
// the same run (confirmed: process still alive, zero new `scraping_jobs` rows for 9+
// minutes). `extract-pdf-text.ts`'s `fetchSumulaText` (shared by every source) got
// the same fix for the identical reason. 60s (not the smaller fetches' 30s): this
// page is the single largest request the FMF adapter makes (~1MB), and got
// genuinely slower — not just hung — after this session's heavy repeated traffic,
// confirmed by re-running isolated to just this competition and seeing a real
// `AbortError` at 30s rather than a silent indefinite hang.
const FETCH_TIMEOUT_MS = 60_000;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`FMF fetch failed (${res.status}): ${url}`);
  return res.text();
}

export interface FmfMatchRef {
  matchId: number;
  homeName: string;
  awayName: string;
  homeClubId: number;
  awayClubId: number;
  homeCrestUrl: string;
  awayCrestUrl: string;
  sumulaUrl: string;
}

const HOME_NAME_RE = /align='right'>([^<]+)<\/div>/;
const AWAY_NAME_RE = /align='left'>([^<]+)<\/div>/;
const CREST_RE = /Foto_Logo_(\d+)\.png/g;
// A corrected/amended súmula ("retificada") lives at a slightly different path —
// confirmed live: 5 of 98 real matches in the fixture use it, literally with a
// backslash (not forward slash) before the filename (`.../Retificadas\Sumula_Jogo_
// {id}_F10_1.pdf`) — an artifact of FMF's own server config, not a typo on our side.
// Both forms are real, fetchable súmulas (the WHATWG URL parser `fetch()` uses
// normalizes the backslash to a forward slash automatically) and carry the same
// `Sumula_Jogo_{id}_...` id, used as the stable `scraping_jobs` ref either way.
const SUMULA_RE = /href="(https:\/\/sge\.fmf\.com\.br\/sumulas\/(?:Retificadas[\\/])?Sumula_Jogo_(\d+)_F10(?:_\d+)?\.pdf)"\s+target="_blank"/;
const CREST_BASE = "http://esumula.fmf.com.br/escudos/";

function parseChunk(chunk: string): FmfMatchRef | null {
  const home = chunk.match(HOME_NAME_RE);
  const away = chunk.match(AWAY_NAME_RE);
  const sumula = chunk.match(SUMULA_RE);
  if (!home || !away || !sumula) return null; // no súmula yet, or not a match chunk at all

  const crestIds = [...chunk.matchAll(CREST_RE)].map((m) => m[1]!);
  if (crestIds.length < 2) return null; // defensive — every real match block has both crests

  return {
    matchId: Number(sumula[2]),
    homeName: home[1]!.trim(),
    awayName: away[1]!.trim(),
    homeClubId: Number(crestIds[0]),
    awayClubId: Number(crestIds[1]),
    homeCrestUrl: `${CREST_BASE}Foto_Logo_${crestIds[0]}.png`,
    awayCrestUrl: `${CREST_BASE}Foto_Logo_${crestIds[1]}.png`,
    sumulaUrl: sumula[1]!,
  };
}

/** Parses one `ProxJogos.aspx?d=...` page's match blocks — every round, already
 * filtered to matches with a published súmula. Does not fetch anything else. */
export function parseFmfProxJogos(html: string): FmfMatchRef[] {
  const refs: FmfMatchRef[] = [];
  const seen = new Set<number>(); // defensive against the page ever rendering a block twice
  for (const chunk of html.split(CHUNK_DELIMITER)) {
    if (!chunk.includes("Foto_Logo_")) continue; // date-header / page-furniture chunk
    const ref = parseChunk(chunk);
    if (!ref) continue;
    if (seen.has(ref.matchId)) continue;
    seen.add(ref.matchId);
    refs.push(ref);
  }
  return refs;
}

/** Fetches and parses one competition's full-season match listing. */
export async function discoverFmfCompetition(d: number): Promise<FmfMatchRef[]> {
  const html = await fetchText(`https://fmf.com.br/Competicoes/ProxJogos.aspx?d=${d}`);
  return parseFmfProxJogos(html);
}

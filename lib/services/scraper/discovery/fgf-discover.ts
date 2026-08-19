// FOOTBASE Phase 6.7 — FGF (Federação Gaúcha de Futebol) discovery (plain HTTP, NO
// Playwright — confirmed live: fgf.com.br has no Cloudflare/bot-detection).
//
// FGF's súmula is NOT a separate format to parse: it is served straight from the
// CBF's own CDN — `conteudo.cbf.com.br/federacoes/{id}/sumulas/{ano}/{código}.pdf` —
// literally the same "SÚMULA ON-LINE" PDF template CBF's own competitions use. So
// this adapter reuses `parse-cbf-sumula.ts`/`parse-cbf-events.ts` UNCHANGED for
// parsing (only `homeSourceKey`/`awaySourceKey`/`*CrestUrl` are injected here) — the
// one real difference found live (Session 55) is that FGF's own PDF renders the
// "Gols" table's period column as a bare "1"/"2" instead of "1T"/"2T" (confirmed:
// every OTHER section of that same PDF — Cartões, Substituições — does use the full
// "1T"/"2T"), which `parse-cbf-events.ts`'s goal regex now accepts generally.
//
// Unlike CBF's own competitions (a literal edition id per URL, rediscovered
// manually every season), FGF's base competition URL —
// `fgf.com.br/competicoes/amador/{id}` — always resolves to the CURRENT season on
// its own and exposes that season's phase tabs (Classificatória, Oitavas, Quartas,
// Semifinal, ...) as plain links with the phase's own numeric id baked in. Fetching
// that base URL fresh every run and re-deriving the phase links from it means **no
// yearly manual rediscovery** is needed here, unlike CBF_SOURCES/FMF_SOURCES.
//
// No stable numeric club id is exposed anywhere in the discovery HTML (crest image
// filenames are opaque hashes, not ids) — unlike CBF/FMF/FERJ, FGF clubs fall back to
// a name+UF-derived provisional `source_key` (same mechanism `parse-cbf-sumula.ts`
// already has for CBF before its own discovery resolves a real numeric id — reused
// here as the PERMANENT key, not a temporary one, since there is no better id to
// promote to later).
//
// The "Documentos" tab's súmula link was observed to be genuinely, transiently
// missing from an otherwise-200-OK match page on FGF's own server for a stretch of
// several minutes (confirmed independent of any request header — retried with and
// without a Referer, from a fresh browser session and from plain `fetch()`, same
// result both ways — then it started working again on its own). Treated the same as
// "no súmula yet" elsewhere in this codebase: not an error, just try again next run.

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`FGF fetch failed (${res.status}): ${url}`);
  return res.text();
}

export interface FgfMatchRef {
  /** The match page's own URL slug — stable, unique, used as the `scraping_jobs` ref
   * (FGF exposes no numeric match id to `fetch`; the in-page "JOGO: N" number is only
   * unique within one competition, not globally). */
  matchUrl: string;
  homeName: string;
  awayName: string;
  homeCrestUrl: string;
  awayCrestUrl: string;
}

const PHASE_TAB_RE = /<a class="[^"]*menu_comp" href="(https?:\/\/[^"]+)">([^<]+)</g;

/** The current season's phase URLs for one competition (e.g. Classificatória,
 * Oitavas de Final, ...) — re-derived fresh every call, no hardcoded ids. */
export async function discoverFgfPhases(competitionId: number): Promise<string[]> {
  const html = await fetchText(`https://fgf.com.br/competicoes/amador/${competitionId}`);
  const urls: string[] = [];
  for (const m of html.matchAll(PHASE_TAB_RE)) urls.push(m[1]!);
  return urls;
}

// The group-stage layout puts `<img>` immediately inside "mandante"/"visitante"; the
// knockout-phase layout puts a `<span>{sigla}</span>` BEFORE the `<img>` on the
// "visitante" side only (confirmed live: same class names, different child order) —
// `[\s\S]*?` between the class marker and the `<img>` tolerates either shape.
const MATCH_CARD_RE =
  /class="mandante">[\s\S]*?<img src="([^"]+)" title="([^"]+)"[\s\S]*?class="visitante">[\s\S]*?<img src="([^"]+)" title="([^"]+)"/;
const MATCH_LINK_RE = /href="(https:\/\/fgf\.com\.br\/jogo\/[^"]+)"/;

/** One phase's match cards — home/away name+crest and the match page URL. Splits on
 * the "conteudo-escudos" wrapper each real match card has exactly once, so a
 * malformed/unrelated chunk (page furniture) just fails its own field check and is
 * skipped, never corrupting an adjacent real match. */
export function parseFgfPhaseMatches(html: string): FgfMatchRef[] {
  const refs: FgfMatchRef[] = [];
  for (const chunk of html.split("conteudo-escudos")) {
    const card = chunk.match(MATCH_CARD_RE);
    const link = chunk.match(MATCH_LINK_RE);
    if (!card || !link) continue;
    refs.push({
      matchUrl: link[1]!,
      homeCrestUrl: card[1]!,
      homeName: card[2]!,
      awayCrestUrl: card[3]!,
      awayName: card[4]!,
    });
  }
  return refs;
}

/** Every match card across every current-season phase of one competition. */
export async function discoverFgfCompetition(competitionId: number): Promise<FgfMatchRef[]> {
  const phaseUrls = await discoverFgfPhases(competitionId);
  const refs: FgfMatchRef[] = [];
  for (const url of phaseUrls) {
    const html = await fetchText(url);
    refs.push(...parseFgfPhaseMatches(html));
  }
  return refs;
}

// Two real hosting patterns confirmed live, both "SÚMULA ON-LINE" PDFs, same
// underlying template, both handled unchanged by `parse-cbf-sumula.ts`: older
// matches self-host under `fgf.com.br/public/sumulas/{código}.pdf`, newer ones (the
// current default) live on `conteudo.cbf.com.br/federacoes/{id}/sumulas/{ano}/
// {código}.pdf` — CBF's own shared CDN, likely a mid-season infrastructure move on
// FGF's side. What first looked like flaky/intermittent availability (Session 55)
// was actually just this — testing the same match's URL repeatedly always agreed;
// different matches disagreed because some predate the move and some don't.
const SUMULA_LINK_RE =
  /href="(https:\/\/conteudo\.cbf\.com\.br\/federacoes\/\d+\/sumulas\/\d+\/\d+\.pdf|https:\/\/www\.fgf\.com\.br\/public\/sumulas\/\d+\.pdf)"/;

/** The súmula PDF link from a match's own page — `null` when not (yet, or right
 * now) available, never thrown as an error (see module header). */
export async function fetchFgfSumulaUrl(matchUrl: string): Promise<string | null> {
  const html = await fetchText(matchUrl);
  return html.match(SUMULA_LINK_RE)?.[1] ?? null;
}

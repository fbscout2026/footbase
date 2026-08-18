import { forEachRateLimited } from "../rate-limit.ts";

// FOOTBASE Phase 6.x — CBF discovery (plain HTTP, NO Playwright — NOT unit tested in
// this repo: it calls a live third-party site directly. Validate with
// `npm run ingest:dry-run` for real).
//
// Confirmed live (Session 44): cbf.com.br has no Cloudflare/bot-detection challenge
// (unlike futebolpaulista.com.br) — a plain `fetch()` with an ordinary browser
// User-Agent gets the real response every time, no browser needed at all. Every CBF
// competition mixes two phase shapes, and each needs a different read:
//
//  1. Group-stage / round-robin phases (e.g. Brasileirão SUB-20's "1ª Fase"): the
//     tabela page's initial HTML embeds `competitionId` and the round count
//     (`"current":19,"total":19`), but NOT the matches themselves — those come one
//     round at a time from `GET /api/cbf/jogos/campeonato/{competitionId}/rodada/{n}
//     /fase`, a public unauthenticated JSON endpoint. One response covers every match
//     of that round: score, both teams' full lineups, substitutions, referees,
//     goal/card events, and the súmula/boletim/relatório PDF links.
//  2. Knock-out phases (Quartas/Semi/Final, ida-e-volta): confirmed live there's no
//     round count and no separate API call — the small number of matches for the
//     whole phase is embedded directly in the tabela page's own HTML, inside a
//     Next.js RSC streaming payload (`self.__next_f.push([n,"...escaped JSON..."])`).
//     Extracted by decoding each push chunk's JS string literal, then bracket-
//     matching every `{"id_jogo":...}` object out of the decoded text (it's not one
//     standalone JSON document — RSC's wire format interleaves numbered references
//     and can't be `JSON.parse`d whole).
//
// Both shapes return the same match object shape (id_jogo, mandante/visitante with
// full atletas, documentos, etc.), so callers get one `CbfMatchRef[]` regardless of
// which phase produced it.

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`CBF fetch failed (${res.status}): ${url}`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`CBF fetch failed (${res.status}): ${url}`);
  return res.json();
}

export interface CbfMatchRef {
  idJogoGrande: number;
  numJogo: number;
  rodada: number;
  mandante: string;
  visitante: string;
  idClubeMandante: number;
  idClubeVisitante: number;
  sumulaUrl: string | null; // null = not published yet (postponed/pending)
}

interface CbfDocumento {
  url?: string;
  title?: string;
}
interface CbfTeamJson {
  id?: string;
  nome?: string;
}
interface CbfJogoJson {
  id_jogo?: string;
  num_jogo?: string;
  rodada?: string;
  mandante?: CbfTeamJson;
  visitante?: CbfTeamJson;
  documentos?: CbfDocumento[];
}

function toMatchRef(j: CbfJogoJson, fallbackRodada: number): CbfMatchRef | null {
  const idJogoGrande = Number(j.id_jogo);
  if (!Number.isInteger(idJogoGrande) || idJogoGrande <= 0) return null;
  const sumulaUrl = (j.documentos ?? []).find((d) => d.title === "Súmula")?.url ?? null;
  return {
    idJogoGrande,
    numJogo: Number(j.num_jogo) || 0,
    rodada: Number(j.rodada) || fallbackRodada,
    mandante: j.mandante?.nome ?? "",
    visitante: j.visitante?.nome ?? "",
    idClubeMandante: Number(j.mandante?.id) || 0,
    idClubeVisitante: Number(j.visitante?.id) || 0,
    sumulaUrl,
  };
}

// ---- Group-stage / round-robin path -----------------------------------------------

interface CbfRodadaResponse {
  jogos?: { jogo?: CbfJogoJson[] }[];
}

async function discoverCbfRound(competitionId: number, rodada: number): Promise<CbfMatchRef[]> {
  const data = (await fetchJson(
    `https://www.cbf.com.br/api/cbf/jogos/campeonato/${competitionId}/rodada/${rodada}/fase`,
  )) as CbfRodadaResponse;

  const refs: CbfMatchRef[] = [];
  for (const grupo of data.jogos ?? []) {
    for (const j of grupo.jogo ?? []) {
      const ref = toMatchRef(j, rodada);
      if (ref) refs.push(ref);
    }
  }
  return refs;
}

// ---- Knock-out path (matches embedded directly in the tabela page's HTML) --------

/**
 * Decodes every `self.__next_f.push([n,"..."])` chunk's JS string literal back into
 * plain text and concatenates them. Next.js RSC wire format interleaves numbered
 * references with JSON fragments, so the result isn't one parseable document — it's
 * only safe to substring-search and bracket-match out of, not `JSON.parse` whole.
 */
function decodeNextRscChunks(html: string): string {
  const chunkRe = /self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)/g;
  let decoded = "";
  let m: RegExpExecArray | null;
  while ((m = chunkRe.exec(html))) {
    try {
      decoded += JSON.parse(`"${m[1]}"`);
    } catch {
      // a chunk that doesn't decode as a JSON string literal isn't one we need
    }
  }
  return decoded;
}

/**
 * Finds every `{"id_jogo":...}` object embedded in `text` via brace-depth matching
 * (respecting quoted strings, so braces inside e.g. `"local":"CT {X}"` don't throw
 * off the count) and parses each one independently.
 */
function extractEmbeddedMatchObjects(text: string): CbfJogoJson[] {
  const marker = '"id_jogo":';
  const objs: CbfJogoJson[] = [];
  const seen = new Set<string>();
  let searchFrom = 0;

  while (true) {
    const markerIdx = text.indexOf(marker, searchFrom);
    if (markerIdx === -1) break;
    const start = text.lastIndexOf("{", markerIdx);
    if (start === -1) {
      searchFrom = markerIdx + marker.length;
      continue;
    }

    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === "\\") i++; // skip the escaped character
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break; // unterminated — bail rather than loop forever
    searchFrom = end;

    const slice = text.slice(start, end);
    try {
      const obj = JSON.parse(slice) as CbfJogoJson;
      if (obj.id_jogo && !seen.has(obj.id_jogo)) {
        seen.add(obj.id_jogo);
        objs.push(obj);
      }
    } catch {
      // a brace-balanced slice that still isn't valid JSON — skip it
    }
  }

  return objs;
}

// ---- Entry point --------------------------------------------------------------

/**
 * Every match for one phase of one CBF competition (`tabelaPhaseUrl` is the tabela
 * page for a SPECIFIC phase, e.g. `.../sub-20/2026/2008` — the trailing id is the
 * idFase; competitions expose several of these, one per phase, via the phase
 * selector). Detects which of the two shapes (round-robin vs knock-out) the phase is
 * and reads it accordingly — see module doc.
 */
export async function discoverCbfMatchesForPhase(tabelaPhaseUrl: string): Promise<CbfMatchRef[]> {
  const html = await fetchText(tabelaPhaseUrl);

  const competitionIdMatch = html.match(/\\?"competitionId\\?":\\?"(\d+)\\?"/);
  const totalRoundsMatch = html.match(/\\?"current\\?":\d+,\\?"total\\?":(\d+)/);

  if (competitionIdMatch && totalRoundsMatch) {
    const competitionId = Number(competitionIdMatch[1]);
    const totalRounds = Number(totalRoundsMatch[1]);
    const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);
    const batches = await forEachRateLimited(rounds, (r) => discoverCbfRound(competitionId, r), { minDelayMs: 700, jitterMs: 300 });
    return batches.flatMap((b) => b.result ?? []);
  }

  // No round count → knock-out phase: everything is already in this one page.
  const decoded = decodeNextRscChunks(html);
  const jogos = extractEmbeddedMatchObjects(decoded);
  return jogos.map((j) => toMatchRef(j, 0)).filter((ref): ref is CbfMatchRef => ref !== null);
}

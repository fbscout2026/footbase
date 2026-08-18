// FOOTBASE Phase 6.x — FPF (Federação Paulista de Futebol) súmula PARSER
// (pure text → FpfParsedMatch).
//
// Turns the plain text of an official FPF electronic súmula (PDF hosted at
// `conteudo.fpf.org.br/sumulas/{ano}/{idCampeonato}/{idJogo}.pdf` — confirmed live to
// be reachable with a PLAIN fetch, unlike the rest of futebolpaulista.com.br which is
// behind a Cloudflare challenge; the discovery step, i.e. finding this URL via
// `Handlers/Competicoes/ListarTabela.ashx`, still needs a real browser) into a
// normalized shape, mirroring `parse-cbf-sumula.ts` + `parse-cbf-events.ts`.
//
// IMPORTANT — this is NOT `ParsedMatch`: the FPF súmula identifies each player by a
// federative "Registro" (e.g. "656616/26"), never the CBF's 6-digit bid. Exactly like
// `parse-fpf-atletas.ts`, every player here is an IDENTITY CANDIDATE for
// `resolveAthleteIdentity` — the caller must resolve `registro` to a real, existing
// `atletas.bid` (via an `atleta_fontes` mapping) before this can become an
// `atuacoes_sumula` row. A player who never resolves goes to admin review; this parser
// itself performs no such resolution and no IO.
//
// KNOWN LAYOUT ASSUMPTION (verified against one real SUB-17 súmula, not yet against a
// match with uneven squad sizes): the "Relação de Jogadores" table is two columns
// (home | away) that pdf-parse reads in ALTERNATING row order (home, away, home,
// away, ...) rather than as two contiguous blocks like the CBF súmula. This parser
// relies on that alternation; a súmula with unequal starter/reserve counts between the
// two teams could misassign the tail of the longer list — flag for review if a real
// sample like that turns up.

import { buildFpfAppearances, type FpfParsedAppearance } from "./parse-fpf-events.ts";

export interface FpfRosterPlayer {
  shirt: number;
  name: string;
  registro: string; // FPF federative registration number, e.g. "656616/26"
  starter: boolean; // 'T' (titular) vs 'R' (reserva)
  professional: boolean; // 'P' vs 'A' (amador) column
}

export interface FpfParsedClub {
  name: string;
  /** Stable upsert key, e.g. 'fpf:3309'. Injected by the discovery layer (which has
   * the real IdClube from ListarTabela.ashx) — the súmula text alone only has the
   * display name, so a provisional slug-based key is used until then. */
  sourceKey: string;
}

export interface FpfParsedAthlete {
  registro: string;
  name: string;
}

export interface FpfParsedMatch {
  tournament: { name: string; federation: "FPF"; year: number; category: string };
  matchDate: string; // ISO
  matchCategory: string;
  rodada: string | null;
  home: FpfParsedClub;
  away: FpfParsedClub;
  homeScore: number | null;
  awayScore: number | null;
  sourceUrl: string | null;
  athletes: FpfParsedAthlete[];
  appearances: FpfParsedAppearance[];
  // Own goals ("Contra") — count toward the final score but not any player's
  // personal tally (football convention). See ParsedMatch.ownGoals in types.ts.
  ownGoals: number;
}

export interface FpfSumula {
  match: FpfParsedMatch;
  roster: { home: FpfRosterPlayer[]; away: FpfRosterPlayer[] };
}

export interface ParseFpfOptions {
  sourceUrl?: string | null;
  /** Real 'fpf:{IdClube}' keys from discovery; falls back to a provisional slug when
   * not supplied (kept idempotent per name, same pattern as parse-cbf-sumula.ts). */
  homeSourceKey?: string;
  awaySourceKey?: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "SUB17" / "SUB-17" / "Sub 17" → "SUB-17" (must exist in categoria_ordem). */
function normalizeCategory(raw: string): string {
  const m = raw.match(/sub-?\s*(\d{1,2})/i);
  if (!m) throw new Error(`could not derive category from "${raw}"`);
  return `SUB-${m[1]!}`;
}

/** "08/08/2026" → "2026-08-08". */
function toIsoDate(br: string): string {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new Error(`could not parse date "${br}"`);
  return `${m[3]!}-${m[2]!}-${m[1]!}`;
}

// Matches one roster row: shirt, name (fixed-width truncated, no ellipsis marker),
// T/R, P/A, then (across the PDF's line break, collapsed by normalizeWhitespace to a
// space) the "Registro" number.
const ROW = /(\d{1,2})(.+?)([TR])([PA])\s+(\d{4,7}\/\d{2})/g;

function parseRosterRows(block: string): FpfRosterPlayer[] {
  const players: FpfRosterPlayer[] = [];
  for (const m of block.matchAll(ROW)) {
    players.push({
      shirt: Number(m[1]!),
      name: m[2]!.trim(),
      starter: m[3] === "T",
      professional: m[4] === "P",
      registro: m[5]!,
    });
  }
  return players;
}

export function parseFpfSumula(rawText: string, opts: ParseFpfOptions = {}): FpfSumula {
  const text = normalizeWhitespace(rawText);

  // --- Header ---------------------------------------------------------------
  const campeonato = text.match(/Campeonato:\s*(.+?)\s*Rodada:/i);
  if (!campeonato) throw new Error("could not locate 'Campeonato:' header");
  const campeonatoRaw = campeonato[1]!.trim();
  const category = normalizeCategory(campeonatoRaw);

  const rodadaMatch = text.match(/Rodada:\s*(\d+)/i);
  const rodada = rodadaMatch ? rodadaMatch[1]! : null;

  const teams = text.match(/Rodada:\s*\d+\s*Jogo:\s*(.+?)\s+X\s+(.+?)\s+Data:/i);
  if (!teams) throw new Error("could not locate the 'Jogo: A X B' teams line");
  const homeName = teams[1]!.trim();
  const awayName = teams[2]!.trim();

  const dateMatch = text.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!dateMatch) throw new Error("could not locate 'Data:' header");
  const matchDate = toIsoDate(dateMatch[1]!);
  const year = Number(matchDate.slice(0, 4));

  // Tournament name: championship label without the trailing "/{year}".
  const tournamentName = campeonatoRaw.replace(/\s*\/\s*\d{4}\s*$/, "").trim();

  // "Resultado do 2º Tempo: X Y" is the CUMULATIVE score at the end of the match
  // (verified against the real sample: 1-0 at half-time, 3-0 at "2º Tempo" == final).
  const finalScore = text.match(/Resultado do 2º Tempo:\s*(\d+)\s*X\s*(\d+)/i);
  const homeScore = finalScore ? Number(finalScore[1]!) : null;
  const awayScore = finalScore ? Number(finalScore[2]!) : null;

  // --- Roster ("Relação de Jogadores") -------------------------------------
  const rosterStart = text.search(/Relação de Jogadores/i);
  if (rosterStart === -1) throw new Error("could not locate 'Relação de Jogadores'");
  const rosterEnd = text.search(/Comissão Técnica/i);
  const rosterSection = text.slice(rosterStart, rosterEnd === -1 ? undefined : rosterEnd);

  const headerRe = /N[ºo]\s*Nome\s*Completo\s*do\s*Jogador\s*T\/R\s*P\/A\s*Registro/i;
  const headerMatch = rosterSection.search(headerRe);
  const rowsText = headerMatch === -1 ? rosterSection : rosterSection.slice(headerMatch);
  const rows = parseRosterRows(rowsText);

  // Alternating column order (see module doc comment): even index → home, odd → away.
  const home: FpfRosterPlayer[] = [];
  const away: FpfRosterPlayer[] = [];
  rows.forEach((row, i) => (i % 2 === 0 ? home : away).push(row));

  const athletes: FpfParsedAthlete[] = [...home, ...away].map((p) => ({ registro: p.registro, name: p.name }));
  const { appearances, ownGoals } = buildFpfAppearances(text, { home, away }, { homeName, awayName, matchCategory: category });

  const match: FpfParsedMatch = {
    tournament: { name: tournamentName, federation: "FPF", year, category },
    matchDate,
    matchCategory: category,
    rodada,
    home: { name: homeName, sourceKey: opts.homeSourceKey ?? `fpf-club:${slug(homeName)}` },
    away: { name: awayName, sourceKey: opts.awaySourceKey ?? `fpf-club:${slug(awayName)}` },
    homeScore,
    awayScore,
    sourceUrl: opts.sourceUrl ?? null,
    athletes,
    appearances,
    ownGoals,
  };

  return { match, roster: { home, away } };
}

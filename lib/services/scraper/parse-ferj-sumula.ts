// FOOTBASE Phase 6.x — FERJ (Federação de Futebol do Estado do Rio de Janeiro) súmula
// PARSER (pure text → FerjParsedMatch), covering header + roster only.
//
// Source: the official closed súmula PDF linked from every match page
// (`https://www.ferj360.com.br/carioca/uploads/sumula_fechada_{a}_{b}.pdf`,
// `fetch`+`pdf-parse` — confirmed live: no Cloudflare, no bot-detection anywhere on
// fferj.com.br or ferj360.com.br). This is a DIFFERENT domain from the match's own
// HTML page (`fferj.com.br/partidas/{id}`), which carries the match EVENTS instead
// (see `parse-ferj-events.ts`) — the two are combined by `buildFerjSumula` below.
//
// IMPORTANT — this is NOT `ParsedMatch`: FERJ identifies each player by a "BIRA"
// number (confirmed live with the user: BIRA = "Boletim Informativo de Registro de
// Atletas", FERJ's OWN state registration system — explicitly documented as the state
// equivalent of the CBF's BID, i.e. a DIFFERENT number, not the CBF 6-digit bid despite
// looking similar). Exactly like the FPF's "Registro", every player here is an IDENTITY
// CANDIDATE for `resolveAthleteIdentity` — the caller must resolve `bira` to a real
// `atletas.bid` (via an `atleta_fontes` mapping) before this becomes an
// `atuacoes_sumula` row. This parser performs no such resolution and no IO.
//
// KNOWN LAYOUT ASSUMPTION (verified against one real SUB-15 súmula): the "Relação de
// Jogadores" section lists the two teams as two SEPARATE contiguous blocks (home team
// fully, then away team fully) — unlike the FPF súmula's alternating column order.
// Team names in this PDF are the short/display form (e.g. "Nova Cidade", not "E.C Nova
// Cidade") — matching the HTML page's fuller name is `buildFerjSumula`'s job, not
// this parser's.

export interface FerjRosterPlayer {
  shirt: number;
  name: string; // best-effort cleaned (see `cleanGluedName`) — a display nicety
  /** The raw, un-split "apelido+nomeCompleto" string. `buildFerjSumula` matches this
   * against event player names with `.endsWith(...)`, which works regardless of
   * whether `cleanGluedName` found the real split — this is the load-bearing field. */
  gluedName: string;
  bira: string; // FERJ state registration number, e.g. "241936" — NOT the CBF bid
  starter: boolean; // 'T' (titular) or 'C' (capitão — always a starter) vs 'R' (reserva)
  captain: boolean;
  professional: boolean; // 'P' vs 'A' (amador) column
}

export interface FerjParsedHeader {
  tournamentName: string; // e.g. "CAMPEONATO ESTADUAL SÉRIE A2- SUB 15"
  category: string; // normalized, e.g. "SUB-15"
  year: number;
  rodada: string | null;
  homeName: string;
  awayName: string;
  matchDate: string; // ISO
  homeScore: number | null;
  awayScore: number | null;
}

export interface FerjSumulaPdf {
  header: FerjParsedHeader;
  roster: { home: FerjRosterPlayer[]; away: FerjRosterPlayer[] };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** "SUB 15" / "SUB-15" / "Sub-15" → "SUB-15" (must exist in categoria_ordem). */
function normalizeCategory(raw: string): string {
  const m = raw.match(/sub[\s-]*(\d{1,2})/i);
  if (!m) throw new Error(`could not derive category from "${raw}"`);
  return `SUB-${m[1]!}`;
}

/** "31/07/2026" → "2026-07-31". */
function toIsoDate(br: string): string {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new Error(`could not parse date "${br}"`);
  return `${m[3]!}-${m[2]!}-${m[1]!}`;
}

// Matches one roster row: shirt, "apelido+nome completo" GLUED with no delimiter
// (pdf-parse confirmed to insert zero separator between these two PDF columns — even
// checked against the raw, un-normalized text), T/R/C, P/A, then the BIRA number
// (plain digits, no "/{ano}" suffix unlike the FPF's Registro).
//
// CONFIRMED LIVE (a real SUB-20 súmula, Torneio OPG): the team's captain gets a "C"
// in the first flag column instead of "T" ("...SANTIAGOCA225881...") — the legend
// itself documents this ("T = Titular | C = Capitão | R = Reserva"), easy to miss
// since the one fixture used to build this parser had no captain marked. Missing "C"
// here meant the regex skipped that whole row, silently merging it into the NEXT
// player's row instead (the non-greedy name group just kept extending until it found
// the next valid T/R+P/A+BIRA sequence) — corrupting two players' data for the price
// of one missed captain flag, including that player's own BIRA and, transitively,
// dropping any goal/card/substitution event matched against their now-corrupted
// `gluedName`.
const ROW = /(\d{1,2})(.+?)([TRC])([PA])(\d{5,7})/g;

// The apelido is not always a literal prefix of the full name (e.g. "BENTO" for
// "ARTHUR BENTO TRINDADE FIUZA" — a middle-name nickname, not the first word), so
// there is no general way to recover the exact apelido/nome-completo split from the
// glued string alone. Best-effort: if the glued string DOES repeat its own prefix
// (the common case — "LUCASLUCAS MONTALVÃO ARAÚJO", "JOÃO GABRIELJOÃO GABRIEL..."),
// strip the duplicated apelido and keep the real full name. Otherwise keep the glued
// string as-is (still usable: `buildFerjSumula` matches roster→event players by
// checking the glued string ENDS WITH the event's full name, which works regardless
// of whether this cleanup succeeds — the split is a display-name nicety, not load-
// bearing for identity/stat matching).
function cleanGluedName(glued: string): string {
  for (let i = 2; i <= Math.floor(glued.length / 2); i++) {
    if (glued.slice(i).startsWith(glued.slice(0, i)) && glued[i - 1] !== glued[i]) {
      return glued.slice(i).trim();
    }
  }
  return glued.trim();
}

function parseRosterRows(block: string): FerjRosterPlayer[] {
  const players: FerjRosterPlayer[] = [];
  for (const m of block.matchAll(ROW)) {
    const gluedName = m[2]!.trim();
    players.push({
      shirt: Number(m[1]!),
      name: cleanGluedName(gluedName),
      gluedName,
      starter: m[3] === "T" || m[3] === "C",
      captain: m[3] === "C",
      professional: m[4] === "P",
      bira: m[5]!,
    });
  }
  return players;
}

export interface ParseFerjSumulaPdfOptions {
  /** Authoritative "SUB-N" from the discovery layer's own listing card (e.g. "Torneio
   * OPG"'s category, confirmed live: its PDF header reads "Campeonato:OPG - 2026" with
   * NO "SUB" text anywhere — not every FERJ competition's PDF label encodes its own
   * category, so the discovery-time label is the fallback of record, not a guess). */
  categoryHint?: string;
}

export function parseFerjSumulaPdf(rawText: string, opts: ParseFerjSumulaPdfOptions = {}): FerjSumulaPdf {
  const text = normalizeWhitespace(rawText);

  // --- Header ---------------------------------------------------------------
  const campeonatoMatch = text.match(/Campeonato:(.+?)Rodada:(\d+)/i);
  if (!campeonatoMatch) throw new Error("could not locate 'Campeonato:' header");
  const tournamentRaw = campeonatoMatch[1]!.trim();
  let category: string;
  try {
    category = normalizeCategory(tournamentRaw);
  } catch (e) {
    if (!opts.categoryHint) throw e;
    category = opts.categoryHint;
  }
  const rodada = campeonatoMatch[2]!;

  // Anchored after "Rodada:N" — the header also has an EARLIER, unrelated "Jogo: N /
  // {ano}" line (the match's internal sequence number, not the matchup) before this.
  const teamsMatch = text.match(/Rodada:\d+\s*Jogo:(.+?)\s+X\s+(.+?)\s*Data:/i);
  if (!teamsMatch) throw new Error("could not locate the 'Jogo: A X B' teams line");
  const homeName = teamsMatch[1]!.trim();
  const awayName = teamsMatch[2]!.trim();

  const dateMatch = text.match(/Data:(\d{2}\/\d{2}\/\d{4})/i);
  if (!dateMatch) throw new Error("could not locate 'Data:' header");
  const matchDate = toIsoDate(dateMatch[1]!);
  const year = Number(matchDate.slice(0, 4));

  const finalScore = text.match(/Resultado Final:\s*(\d+)\s*x\s*(\d+)/i);
  const homeScore = finalScore ? Number(finalScore[1]!) : null;
  const awayScore = finalScore ? Number(finalScore[2]!) : null;

  // Tournament name: championship label without the trailing "- {ano}" and
  // "- SUB N" suffixes (raw label shape: "CAMPEONATO ... SÉRIE A2- SUB 15 - 2026").
  const tournamentName = tournamentRaw
    .replace(/-?\s*\d{4}\s*$/, "")
    .replace(/-?\s*sub[\s-]*\d{1,2}\s*$/i, "")
    .trim();

  // --- Roster ("Relação de Jogadores") -------------------------------------
  const rosterStart = text.search(/Relação de Jogadores/i);
  if (rosterStart === -1) throw new Error("could not locate 'Relação de Jogadores'");
  const rosterEnd = text.search(/T\s*=\s*Titular/i);
  const rosterSection = text.slice(rosterStart, rosterEnd === -1 ? undefined : rosterEnd);

  // The two team blocks are delimited by their own name (echoed verbatim as a
  // sub-heading) followed by the column header row.
  const headerRe = /Nro\.?\s*Apelido\.?\s*Nome\s*Completo\s*T\/RP\/ABIRA/gi;
  const headerMatches = [...rosterSection.matchAll(headerRe)];
  if (headerMatches.length < 2) throw new Error("could not locate both roster column headers");

  const homeBlock = rosterSection.slice(headerMatches[0]!.index! + headerMatches[0]![0].length, headerMatches[1]!.index);
  const awayBlock = rosterSection.slice(headerMatches[1]!.index! + headerMatches[1]![0].length);

  const home = parseRosterRows(homeBlock);
  const away = parseRosterRows(awayBlock);

  return {
    header: { tournamentName, category, year, rodada, homeName, awayName, matchDate, homeScore, awayScore },
    roster: { home, away },
  };
}

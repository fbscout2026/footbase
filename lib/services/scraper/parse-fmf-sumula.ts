// FOOTBASE Phase 6.6 — FMF (Federação Mineira de Futebol) súmula PARSER (pure text → ParsedMatch).
//
// Turns the plain text of an official FMF súmula
// (`sge.fmf.com.br/sumulas/Sumula_Jogo_{id}_F10.pdf`, extracted with pdf-parse) into
// the format-agnostic `ParsedMatch` consumed by `ingest.ts`. Pure (text in, object
// out) so it is unit-testable and safe inside dry-run.
//
// SCOPE: match header (competição/fase/rodada/data), final score, and the "Relação
// de Jogadores" roster keyed by the athlete's real CBF bid — the roster column is
// literally labeled "CBF" and carries the same 6-digit id used by the CBF adapter
// (confirmed live, fixture `fmf-sumula-44868.txt`), so unlike FERJ/FPF, FMF athletes
// resolve directly against `atletas.bid` — no identity crosswalk/bridge needed.
// Per-player stats (goals/cards/subs → minutes) are parsed from the event sections
// by `parse-fmf-events.ts`. FMF has no athlete-profile endpoint (no birth date
// source), so athletes stay provisional (`birthDate: null`) exactly like CBF before
// its 6.3 profile enrichment — `ingest.ts` will not seed a brand-new athlete without
// one, but existing athletes (already seeded via CBF) still get their appearances.
//
// ROSTER LAYOUT (confirmed live, fixture): unlike CBF/FERJ's alternating
// home-row/away-row pattern, FMF groups ALL home titulares, then ALL away titulares,
// then a "Substitutos" marker + home reserves, then a second "Substitutos" marker +
// away reserves. Each player is TWO separate lines — the shirt number alone, then
// the glued "ApelidoNomeCompleto (C)?bid" blob — never glued onto the shirt number
// itself (different from CBF, where pdf-parse glues shirt+blob+role+bid on one
// line). A handful of real rows have NO trailing bid at all (fixture: shirt 18 away
// reserve, "AdrianAdrian Leonardo Moreira Oliveira" — no digits) — kept as a
// bid-less roster entry (`bid: null`) rather than merged into the next player's row,
// which is why parsing walks line PAIRS instead of a single multiline regex sweep
// (a regex spanning "no bid here, find the next digit run" would silently swallow
// the following player into this one's name).

import type { ParsedAthlete, ParsedClub, ParsedMatch } from "./types.ts";
import { buildFmfAppearances } from "./parse-fmf-events.ts";

export interface FmfRosterPlayer {
  shirt: number;
  side: "home" | "away";
  starter: boolean;
  /** Nickname+full-name blob, still glued — same recovery approach as CBF. */
  gluedName: string;
  bid: number | null;
  captain: boolean;
}

export interface FmfSumula {
  match: ParsedMatch;
  roster: { home: FmfRosterPlayer[]; away: FmfRosterPlayer[] };
  /** The match was decided W.O. (walkover) — an administrative score with no real
   * gameplay, so the "Gols" section is legitimately empty even though the score
   * isn't 0-0 (confirmed live: "1º Tempo: W.O.2º Tempo: W.O..." header + an
   * "Ocorrências" note explaining the no-show). Callers should relax goal
   * reconciliation for these — there is no missing data to recover, the source
   * itself has no gameplay events to report. */
  isWalkover: boolean;
}

export interface ParseFmfOptions {
  sourceUrl?: string | null;
  homeSourceKey?: string;
  awaySourceKey?: string;
  homeCrestUrl?: string | null;
  awayCrestUrl?: string | null;
}

const FEDERATION = "FMF";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** "Sub 15" / "SUB-17" → "SUB-15". */
function normalizeCategory(raw: string): string {
  const m = raw.match(/sub-?\s*(\d{1,2})/i);
  if (!m) throw new Error(`could not derive category from "${raw}"`);
  return `SUB-${m[1]!}`;
}

/** "15/08/2026" → "2026-08-15". */
function toIsoDate(br: string): string {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new Error(`could not parse date "${br}"`);
  return `${m[3]!}-${m[2]!}-${m[1]!}`;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function provisionalSourceKey(name: string): string {
  return `fmf-club:${slug(name)}`;
}

// Same recovery heuristic as CBF's `nomeCompletoFromGlued` (accent-insensitive
// repeat detection) — kept as a local copy rather than a shared import so each
// adapter stays independently readable/testable, per the project's one-adapter-
// per-source convention.
function foldForCompare(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function nomeCompletoFromGlued(blob: string): string {
  const folded = foldForCompare(blob);
  for (let i = 2; i <= Math.floor(blob.length / 2); i++) {
    if (folded.slice(i).startsWith(folded.slice(0, i)) && folded[i - 1] !== folded[i]) {
      return cleanName(blob.slice(i));
    }
  }
  return cleanName(blob);
}

/** Walk a roster block as shirt-line / name-line PAIRS (see module header). */
function parsePlayerRows(block: string, side: "home" | "away", starter: boolean): FmfRosterPlayer[] {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const players: FmfRosterPlayer[] = [];
  for (let i = 0; i < lines.length; i++) {
    const shirtLine = lines[i]!;
    if (!/^\d{1,3}$/.test(shirtLine)) continue; // defensive: skip any stray non-shirt line
    const nameLine = lines[i + 1];
    if (nameLine == null) break;
    // A player with no CBF bid sometimes has an extra placeholder line in that
    // column's place (confirmed live, real fixture: a lone "845.86" then "9" instead
    // of a name — some internal local-registration id split across two lines by
    // pdf-parse, not a bid). A real name line always has letters; a line that is
    // ONLY digits/punctuation is never a name — skip it as noise WITHOUT consuming it
    // as this shirt's pair, so the scan re-syncs on the next real shirt+name pair.
    // Confirmed live: without this, that noise line got treated as the NEXT player's
    // shirt number, which silently swallowed the real next player's name+bid line as
    // its own "name" — dropping a real, bid-having player (and their goals) entirely.
    if (!/[A-Za-zÀ-ÿ]/.test(nameLine)) continue;
    i++; // consume the name line

    const captain = /\(C\)/.test(nameLine);
    const stripped = nameLine.replace(/\s*\(C\)\s*/, " ").trim();
    const m = stripped.match(/^(.*?)(\d{4,7})$/);
    const gluedName = (m ? m[1]! : stripped).trim();
    const bid = m ? Number(m[2]) : null;

    players.push({ shirt: Number(shirtLine), side, starter, gluedName, bid, captain });
  }
  return players;
}

/**
 * "CONTAGEM ESPORTE CLUBE 1 x 6 ASSOCIACAO DESPORTIVA INTERNACIONAL DE MINAS" — the
 * one line in the whole súmula that states both club names AND the final score
 * together, unambiguously. The preceding "1º Tempo: 1 x 32º Tempo: 0 x 3..." line
 * ALSO contains "N x N" substrings (half-time/extra-time/penalty scores glued with
 * no separators), so this is deliberately anchored on team-name groups containing
 * no digits/colons — the half-time line fails that immediately (starts with "1º"),
 * the real confirmation line passes.
 */
function findResultLine(lines: string[]): { home: string; homeScore: number; awayScore: number; away: string; isWalkover: boolean } {
  const startIdx = lines.findIndex((l) => /^Resultado do Jogo$/i.test(l));
  if (startIdx === -1) throw new Error("could not locate 'Resultado do Jogo'");
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^Arbitragem$/i.test(l));
  const scope = lines.slice(startIdx + 1, endIdx === -1 ? undefined : endIdx);
  // A walkover ("1º Tempo: W.O.2º Tempo: W.O.Prorrogação: W.O.Pênaltis: W.O.") means
  // the match never happened — the score line right below it is a real, official
  // administrative result, but "Gols" is legitimately empty (confirmed live: two real
  // fixtures, both with an "Ocorrências" note explaining the no-show).
  const isWalkover = scope.some((l) => /W\.O\./i.test(l));
  for (const line of scope) {
    const m = line.match(/^([^\d:]+?)\s+(\d{1,2})\s+x\s+(\d{1,2})\s+([^\d:]+)$/);
    if (m) return { home: cleanName(m[1]!), homeScore: Number(m[2]), awayScore: Number(m[3]), away: cleanName(m[4]!), isWalkover };
  }
  throw new Error("could not locate the final-score confirmation line under 'Resultado do Jogo'");
}

export function parseFmfSumula(rawText: string, opts: ParseFmfOptions = {}): FmfSumula {
  const rawLines = rawText.split("\n").map((l) => l.trim());
  const text = normalizeWhitespace(rawText);

  // --- Header ---------------------------------------------------------------
  const competicao = text.match(/Competição:\s*(.+?)\s*Fase:\s*(.+?)\s*Rodada:\s*(\d+)/i);
  if (!competicao) throw new Error("could not locate 'Competição:' header");
  const competicaoRaw = competicao[1]!.trim();
  const rodada = competicao[3]!;

  const yearMatch = competicaoRaw.match(/(\d{4})\s*$/);
  const category = normalizeCategory(competicaoRaw);
  const tournamentName = competicaoRaw.replace(/\s*-?\s*\d{4}\s*$/, "").trim();

  const dateMatch = text.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!dateMatch) throw new Error("could not locate 'Data:' header");
  const matchDate = toIsoDate(dateMatch[1]!);
  const year = yearMatch ? Number(yearMatch[1]) : Number(matchDate.slice(0, 4));

  const result = findResultLine(rawLines);

  const home: ParsedClub = {
    sourceKey: opts.homeSourceKey ?? provisionalSourceKey(result.home),
    name: result.home,
    state: "MG",
    federacao: FEDERATION,
    crestUrl: opts.homeCrestUrl ?? null,
  };
  const away: ParsedClub = {
    sourceKey: opts.awaySourceKey ?? provisionalSourceKey(result.away),
    name: result.away,
    state: "MG",
    federacao: FEDERATION,
    crestUrl: opts.awayCrestUrl ?? null,
  };

  // --- Roster ("Relação de Jogadores") --------------------------------------
  // See module header: home titulares, away titulares, "Substitutos" + home
  // reserves, "Substitutos" + away reserves — grouped, not alternating.
  const rosterStart = rawText.search(/Relação de Jogadores/i);
  if (rosterStart === -1) throw new Error("could not locate 'Relação de Jogadores'");
  const rosterEnd = rawText.search(/Árbitro Principal/i);
  const rosterSection = rawText.slice(rosterStart, rosterEnd === -1 ? undefined : rosterEnd);

  const headerRe = /N[ºo]\s*Apelido\s*Nome\s*Completo\s*CBF/i;
  const afterHeader = rosterSection.split(headerRe);
  if (afterHeader.length < 3) throw new Error("could not locate both 'NºApelidoNome CompletoCBF' roster headers");
  const homeTitularesBlock = afterHeader[1]!;
  const rest = afterHeader.slice(2).join(""); // in case a false-positive third split ever occurs

  const substitutosSplit = rest.split(/^\s*Substitutos\s*$/m);
  const awayTitularesBlock = substitutosSplit[0] ?? "";
  const homeSubsBlock = substitutosSplit[1] ?? "";
  const awaySubsBlock = substitutosSplit[2] ?? "";

  const homeRoster = [
    ...parsePlayerRows(homeTitularesBlock, "home", true),
    ...parsePlayerRows(homeSubsBlock, "home", false),
  ];
  const awayRoster = [
    ...parsePlayerRows(awayTitularesBlock, "away", true),
    ...parsePlayerRows(awaySubsBlock, "away", false),
  ];

  // A handful of real rows carry no bid at all (see module header) — they cannot
  // be resolved against `atletas.bid` and are excluded from `athletes`/appearances
  // rather than seeded with a fabricated identity.
  const identifiable = (p: FmfRosterPlayer) => p.bid != null;

  const athletes: ParsedAthlete[] = [...homeRoster, ...awayRoster].filter(identifiable).map((p) => ({
    bid: p.bid!,
    name: nomeCompletoFromGlued(p.gluedName),
    birthDate: null,
    nacionalidade: null,
    mainPosition: null,
  }));

  // A walkover never kicked off — the roster is still printed (both teams were
  // present/named), but `buildFmfAppearances` would otherwise credit every listed
  // starter with a real (if empty-stat) appearance, which is wrong: nobody actually
  // played a single minute. No appearances at all is the honest result here.
  const { appearances, ownGoals } = result.isWalkover
    ? { appearances: [], ownGoals: 0 }
    : buildFmfAppearances(
        text,
        {
          home: homeRoster.filter(identifiable) as (FmfRosterPlayer & { bid: number })[],
          away: awayRoster.filter(identifiable) as (FmfRosterPlayer & { bid: number })[],
        },
        { homeName: home.name, awayName: away.name, matchCategory: category },
      );

  const match: ParsedMatch = {
    tournament: { name: tournamentName, federation: FEDERATION, year, category },
    matchDate,
    matchCategory: category,
    rodada,
    home,
    away,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    sourceUrl: opts.sourceUrl ?? null,
    athletes,
    appearances,
    ownGoals,
  };

  return { match, roster: { home: homeRoster, away: awayRoster }, isWalkover: result.isWalkover };
}

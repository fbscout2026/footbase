// FOOTBASE Phase 6.2 — CBF súmula PARSER (pure text → ParsedMatch).
//
// Turns the plain text of an official CBF electronic súmula ("Súmula On-Line",
// `conteudo.cbf.com.br/sumulas/{ano}/{código}se.pdf`, extracted with pdf-parse)
// into the format-agnostic `ParsedMatch` consumed by `ingest.ts`. This function
// is PURE (text in, object out) so it is unit-testable and safe inside dry-run.
//
// SCOPE: match header (championship / round / date / stadium), final score, and the
// "Relação de Jogadores" roster keyed by the athlete's 6-digit CBF id. Per-player
// statistics (goals, cards, substitutions → minutes, clean sheets) are parsed from
// the event sections of the same PDF by `parse-cbf-events.ts` (6.3) and populate
// `match.appearances`. Each athlete's `birth_date` + canonical name still come from
// the CBF athlete profile (6.3 seeding), which is NOT in the súmula — until then the
// roster name is provisional and `birthDate` is null (so those atletas do not seed).
//
// Club `sourceKey`: the súmula PDF does NOT carry the numeric CBF club id (that is
// discovered from the crest URL by the Playwright discovery step). Until a real
// `cbf:{id}` is injected via `opts`, a deterministic provisional key derived from
// name+UF is used. It is stable for a given club, so dry-run idempotency holds; the
// discovery layer overrides it before any live write (blocked until Fase 6.5).

import type { ParsedAthlete, ParsedClub, ParsedMatch } from "./types.ts";
import type { CbfAthleteProfile } from "./cbf-athlete-profile.ts";
import { buildAppearances } from "./parse-cbf-events.ts";

export interface RosterPlayer {
  shirt: number;
  /** Nickname + full-name column, cleaned of truncation ellipses (see note). */
  displayName: string;
  /** The same column before ellipsis-cleaning — needed to recover the full name (see `nomeCompletoFromGlued`). */
  rawBlob: string;
  bid: number;
  isGoalkeeper: boolean;
  starter: boolean;
  present: boolean; // P/A column: 'P' present, 'A' absent
}

export interface CbfSumula {
  match: ParsedMatch;
  roster: { home: RosterPlayer[]; away: RosterPlayer[] };
}

export interface ParseCbfOptions {
  sourceUrl?: string | null;
  /** Real `cbf:{id}` keys when known from discovery; override the provisional ones. */
  homeSourceKey?: string;
  awaySourceKey?: string;
  /**
   * Direct crest URL from the source's own page, when it exposes one (e.g. FGF's
   * match-listing `<img>` — same idea as FERJ/FMF's `ParsedClub.crestUrl`). CBF
   * proper never sets this (its crest is a formula on the numeric club id instead),
   * so this stays unset there and `ingest.ts` falls through to that formula.
   */
  homeCrestUrl?: string | null;
  awayCrestUrl?: string | null;
  /**
   * CBF athlete profiles (canonical name + `birth_date`) keyed by BID. When supplied,
   * the matching athletes carry a `birthDate`, so `ingest.ts` can seed them; without
   * them athletes stay provisional (no seed). Fetched by the discovery layer (6.3).
   */
  profiles?: CbfAthleteProfile[];
}

const FEDERATION = "CBF";

/** Collapse the whitespace pdf-parse leaves behind, so regexes stay simple. */
function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** "Sub-20" / "SUB 17" → "SUB-20" (must exist in categoria_ordem). */
function normalizeCategory(raw: string): string {
  const m = raw.match(/sub-?\s*(\d{1,2})/i);
  if (!m) throw new Error(`could not derive category from "${raw}"`);
  return `SUB-${m[1]!}`;
}

/** "01/07/2026" → "2026-07-01". */
function toIsoDate(br: string): string {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new Error(`could not parse date "${br}"`);
  return `${m[3]!}-${m[2]!}-${m[1]!}`;
}

/** Strip the " ..." / "…" truncation markers pdf columns leave and tidy spaces. */
function cleanName(raw: string): string {
  return raw.replace(/\s*(?:\.\.\.|…)\s*/g, " ").replace(/\s+/g, " ").trim();
}

// The roster column glues "Apelido" (nickname) directly onto "Nome Completo" (full
// legal name) with no separator — e.g. "WeversonWeverson Guilherme M ...". We want
// `atletas.name` to carry the full name, not the nickname, whenever it can be
// recovered from the glued text alone (until the CBF athlete-profile endpoint is
// wired — see module header — the súmula is the only name source).
//
// Two patterns cover most real rows (confirmed against a live fixture, Session 52):
//  1. The apelido itself got truncated ("Gabriel We ...Gabriel Laizo Werneck") — the
//     literal "..."/"…" marks the boundary; everything after it is the full name.
//  2. The apelido is a short, case-insensitive prefix of the full name and both are
//     glued with no truncation in between ("WeversonWeverson Guilherme M ...") — find
//     the repeat and keep the suffix.
// When neither pattern matches (e.g. "Da Mata" as a nickname for "João Pedro do
// Nascimento..." — not a prefix at all, same ambiguity FERJ's súmulas have; or an
// abbreviated apelido like "JOSÉ H." for "José Henrique" — the abbreviation itself
// isn't a literal prefix), there is no reliable way to recover the split from text
// alone, so the glued blob is kept as-is: no worse than before, still a usable
// display name.
//
// The repeat check is accent-INSENSITIVE, not just case-insensitive (confirmed live,
// Session 52: "VINÍCIUSVinicius Rodrigues M" — the apelido carries the accent, the
// full name doesn't, so a plain `.toLowerCase()` compare never finds the repeat).
function foldForCompare(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function nomeCompletoFromGlued(blob: string): string {
  const ellipsisAt = blob.search(/\.\.\.|…/);
  if (ellipsisAt !== -1) {
    const after = blob.slice(ellipsisAt).replace(/^(?:\.\.\.|…)\s*/, "");
    if (after.trim()) return cleanName(after);
    blob = blob.slice(0, ellipsisAt); // trailing-only truncation; try the repeat check below
  }
  const folded = foldForCompare(blob);
  for (let i = 2; i <= Math.floor(blob.length / 2); i++) {
    if (folded.slice(i).startsWith(folded.slice(0, i)) && folded[i - 1] !== folded[i]) {
      return cleanName(blob.slice(i));
    }
  }
  return cleanName(blob);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Flamengo / RJ" → { name: "Flamengo", state: "RJ" }. */
function parseClubLabel(label: string): { name: string; state: string | null } {
  const m = label.match(/^(.*?)\s*\/\s*([A-Z]{2})\s*$/);
  if (m) return { name: cleanName(m[1]!), state: m[2]! };
  return { name: cleanName(label), state: null };
}

function provisionalSourceKey(name: string, state: string | null): string {
  return `cbf-club:${slug(name)}${state ? `-${state.toLowerCase()}` : ""}`;
}

// Matches one roster row: shirt, nickname+fullname blob, T/R, optional "(g)" goalkeeper
// marker, P/A, 6-digit CBF id. `pdf-parse` does NOT reliably insert whitespace between
// adjacent narrow table columns (confirmed live, Session 44 — real extracted text has
// runs like "1Gabriel We ...Gabriel Laizo WerneckT(g)P718455", no spaces at all
// between shirt/blob/role/P-A/id), so every separator here is `\s*` (optional), never
// `\s+`. The blob is matched lazily so it stops at the first valid `T|R (g)? P|A
// 6-digits` suffix — safe in practice because that exact 6-digit-anchored shape never
// occurs inside a player's name.
const ROW = /(\d{1,2})\s*(.+?)\s*(T|R)\s*(\(g\))?\s*([PA])\s*(\d{6})(?=\s|$)/g;

function parseRosterBlock(block: string): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  for (const m of block.matchAll(ROW)) {
    const shirt = m[1]!, blob = m[2]!, role = m[3]!, goalkeeperMarker = m[4], pa = m[5]!, cbf = m[6]!;
    players.push({
      shirt: Number(shirt),
      displayName: cleanName(blob),
      rawBlob: blob,
      bid: Number(cbf),
      isGoalkeeper: !!goalkeeperMarker,
      starter: role === "T",
      present: pa === "P",
    });
  }
  return players;
}

export function parseCbfSumula(rawText: string, opts: ParseCbfOptions = {}): CbfSumula {
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
  const homeLabel = parseClubLabel(teams[1]!);
  const awayLabel = parseClubLabel(teams[2]!);

  const dateMatch = text.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!dateMatch) throw new Error("could not locate 'Data:' header");
  const matchDate = toIsoDate(dateMatch[1]!);
  const year = Number(matchDate.slice(0, 4));

  // Tournament name: championship label without the trailing "/{year}".
  const tournamentName = campeonatoRaw.replace(/\s*\/\s*\d{4}\s*$/, "").trim();

  const finalScore = text.match(/Resultado Final:\s*(\d+)\s*X\s*(\d+)/i);
  const homeScore = finalScore ? Number(finalScore[1]!) : null;
  const awayScore = finalScore ? Number(finalScore[2]!) : null;

  const home: ParsedClub = {
    sourceKey: opts.homeSourceKey ?? provisionalSourceKey(homeLabel.name, homeLabel.state),
    name: homeLabel.name,
    state: homeLabel.state,
    federacao: null,
    crestUrl: opts.homeCrestUrl ?? null,
  };
  const away: ParsedClub = {
    sourceKey: opts.awaySourceKey ?? provisionalSourceKey(awayLabel.name, awayLabel.state),
    name: awayLabel.name,
    state: awayLabel.state,
    federacao: null,
    crestUrl: opts.awayCrestUrl ?? null,
  };

  // --- Roster ("Relação de Jogadores") -------------------------------------
  const rosterStart = text.search(/Relação de Jogadores/i);
  if (rosterStart === -1) throw new Error("could not locate 'Relação de Jogadores'");
  const rosterEnd = text.search(/Comissão Técnica/i);
  const rosterSection = text.slice(rosterStart, rosterEnd === -1 ? undefined : rosterEnd);

  // Two column headers ("Nº Apelido Nome Completo T/R P/A CBF") — one per team. `\s*`
  // (not `\s+`): confirmed live that pdf-parse doesn't always insert a space between
  // adjacent header cells either.
  const headerRe = /N[ºo]\s*Apelido\s*Nome\s*Completo\s*T\/R\s*P\/A\s*CBF/gi;
  const parts = rosterSection.split(headerRe);
  // parts[0] = preamble + home club name; parts[1] = home rows (+ away name); parts[2] = away rows.
  const homeRoster = parts[1] ? parseRosterBlock(parts[1]) : [];
  const awayRoster = parts[2] ? parseRosterBlock(parts[2]) : [];

  // Athlete bios. The súmula has no birth date, so we enrich from CBF profiles when
  // provided (canonical name + `birth_date` → seedable); otherwise the athlete stays
  // provisional (`birthDate: null`) and `ingest.ts` will not seed it.
  const profileByBid = new Map((opts.profiles ?? []).map((p) => [p.bid, p]));
  const athletes: ParsedAthlete[] = [...homeRoster, ...awayRoster].map((p) => {
    const profile = profileByBid.get(p.bid);
    return {
      bid: p.bid,
      name: profile?.name ?? nomeCompletoFromGlued(p.rawBlob),
      birthDate: profile?.birthDate ?? null,
      nacionalidade: profile?.nacionalidade ?? null,
      mainPosition: profile?.mainPosition ?? (p.isGoalkeeper ? "GK" : null),
    };
  });

  // Appearances built from the event sections (6.3): goals/cards/subs → minutes,
  // clean sheets. Only players who actually played get an atuação.
  const { appearances, ownGoals } = buildAppearances(text, { home: homeRoster, away: awayRoster }, {
    homeName: homeLabel.name,
    awayName: awayLabel.name,
    matchCategory: category,
  });

  const match: ParsedMatch = {
    tournament: { name: tournamentName, federation: FEDERATION, year, category },
    matchDate,
    matchCategory: category,
    rodada,
    home,
    away,
    homeScore,
    awayScore,
    sourceUrl: opts.sourceUrl ?? null,
    athletes,
    appearances,
    ownGoals,
  };

  return { match, roster: { home: homeRoster, away: awayRoster } };
}

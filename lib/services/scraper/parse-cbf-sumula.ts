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
  };
  const away: ParsedClub = {
    sourceKey: opts.awaySourceKey ?? provisionalSourceKey(awayLabel.name, awayLabel.state),
    name: awayLabel.name,
    state: awayLabel.state,
    federacao: null,
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
      name: profile?.name ?? p.displayName,
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

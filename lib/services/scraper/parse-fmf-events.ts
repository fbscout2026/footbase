// FOOTBASE Phase 6.6 — FMF súmula EVENT parser + appearance builder (pure).
//
// Mirrors `parse-cbf-events.ts`'s approach (team-name-prefix token, minutes/clean
// sheets reconstructed from the substitution timeline, assists always 0 — not in
// the súmula) but adapted to two real format differences confirmed live against the
// fixture (`fmf-sumula-44868.txt`):
//  - Own goals are marked "GC" ("Gol Contra"), not CBF's "CT".
//  - The substitution timing column glues time+period into ONE token with no
//    separator ("10:002T"), and can ALSO be a bare marker with no period suffix at
//    all: "ANT" (before kickoff), "INT" (half-time), "TER" (after full-time) — CBF
//    only has the INT case (as a literal "-"); FMF's legend documents all three.

import type { ParsedAppearance } from "./types.ts";
import type { FmfRosterPlayer } from "./parse-fmf-sumula.ts";

type Side = "home" | "away";
type IdentifiedPlayer = FmfRosterPlayer & { bid: number };

const HALF = 45;
const FULL = 90;

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** See parse-cbf-events.ts's identical helper — same fix, same real incident
 * (a club and its own reserve-team variant sharing a common prefix, e.g.
 * "Internacional" / "Internacional Sm"), just replicated here since this
 * parser keeps its own copy of the appearance-composition logic. */
function disambiguatedTeamToken(name: string, otherName: string): string {
  if (otherName.length > name.length && otherName.startsWith(name)) {
    return `${escapeRegExp(name)}(?!${escapeRegExp(otherName.slice(name.length))})`;
  }
  return escapeRegExp(name);
}

/**
 * FMF's card reason isn't behind a "Motivo:" label like CBF/FGF — it's a bare
 * "- <reason>;" line wedged between the player's name and their team, e.g.
 * "Julio Cesar Cordeiro Silva - desrespeito ao jogo; ASSOCIACAO...". Pull just
 * that dash-prefixed, semicolon-terminated segment out of the raw text
 * between the shirt number and the team token.
 */
function extractDashReason(raw: string): string | null {
  const m = raw.match(/-\s*([^;]+);/);
  if (!m) return null;
  const cleaned = m[1]!.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function section(text: string, startRe: RegExp, endRe: RegExp): string {
  const s = text.search(startRe);
  if (s === -1) return "";
  const rest = text.slice(s);
  const e = rest.slice(1).search(endRe);
  return e === -1 ? rest : rest.slice(0, e + 1);
}

/** "12:00"+"2T" → 57; "ANT" → 0; "INT" → 45; "TER" → 90. */
function timeline(rawTime: string, period: string | undefined): number {
  if (rawTime === "ANT") return 0;
  if (rawTime === "INT") return HALF;
  if (rawTime === "TER") return FULL;
  const base = period === "2T" ? HALF : 0;
  const mm = parseInt(rawTime, 10);
  return base + (Number.isFinite(mm) ? mm : 0);
}

interface EventContext {
  homeName: string;
  awayName: string;
  matchCategory: string;
}

interface GoalEvent {
  scorer: Side;
  shirt: number;
  ownGoal: boolean;
  beneficiary: Side;
  at: number;
}

export interface BuildFmfAppearancesResult {
  appearances: ParsedAppearance[];
  ownGoals: number;
}

export function buildFmfAppearances(
  text: string,
  roster: { home: IdentifiedPlayer[]; away: IdentifiedPlayer[] },
  ctx: EventContext,
): BuildFmfAppearancesResult {
  const homeSlug = slug(ctx.homeName);
  const awaySlug = slug(ctx.awayName);
  const sideOf = (teamToken: string): Side => {
    const s = slug(teamToken);
    // See parse-cbf-events.ts's identical fix: exact match first, since the
    // collision-safe path can capture a FULL club name that is itself a strict
    // prefix of the other team's name (e.g. "Internacional" / "Internacional Sm").
    if (s === awaySlug) return "away";
    if (s === homeSlug) return "home";
    return s.startsWith(homeSlug) || homeSlug.startsWith(s) ? "home" : "away";
  };

  // Same short-prefix technique as CBF's parser: the team name gets glued directly
  // onto the preceding text with no delimiter, and can wrap/truncate across lines
  // (collapsed to spaces here by the caller's `normalizeWhitespace`), so anchoring
  // on the full literal name is unsafe.
  const prefixLen = 8;
  const homePrefix = ctx.homeName.slice(0, prefixLen);
  const awayPrefix = ctx.awayName.slice(0, prefixLen);
  const teamToken =
    homePrefix === awayPrefix
      ? `(?:${disambiguatedTeamToken(ctx.homeName, ctx.awayName)}|${disambiguatedTeamToken(ctx.awayName, ctx.homeName)})`
      : `(?:${escapeRegExp(homePrefix)}|${escapeRegExp(awayPrefix)})`;

  // --- Goals -----------------------------------------------------------------
  const goalsBlock = section(text, /Gols\s*Tempo/i, /NR\s*=\s*Normal|Cartões|Comissão/i);
  const goalRe = new RegExp(`(\\d{1,2}:\\d{2})\\s*(1T|2T)\\s*(\\d{1,2})\\s*(NR|PN|GC|FT).*?(${teamToken})`, "g");
  const goals: GoalEvent[] = [];
  for (const m of goalsBlock.matchAll(goalRe)) {
    const scorer = sideOf(m[5]!);
    const ownGoal = m[4] === "GC";
    goals.push({
      scorer,
      shirt: Number(m[3]!),
      ownGoal,
      beneficiary: ownGoal ? (scorer === "home" ? "away" : "home") : scorer,
      at: timeline(m[1]!, m[2]!),
    });
  }

  // --- Yellow cards ------------------------------------------------------------
  const yellowBlock = section(text, /Cartões Amarelos/i, /Cartões Vermelhos|Comissão|Ocorrências/i);
  const yellowRe = new RegExp(`(\\d{1,2}:\\d{2})\\s*(1T|2T)\\s*(\\d{1,2})([\\s\\S]*?)(${teamToken})`, "g");
  const yellowCount = new Map<string, number>();
  const yellowReasons = new Map<string, string[]>();
  for (const m of yellowBlock.matchAll(yellowRe)) {
    const key = `${sideOf(m[5]!)}:${Number(m[3]!)}`;
    yellowCount.set(key, (yellowCount.get(key) ?? 0) + 1);
    const reason = extractDashReason(m[4]!);
    if (reason) (yellowReasons.get(key) ?? yellowReasons.set(key, []).get(key)!).push(reason);
  }

  // --- Red cards -----------------------------------------------------------------
  const redBlock = section(text, /Cartões Vermelhos/i, /Comissão|Ocorrências|Substituições/i);
  const redAt = new Map<string, number>();
  const redReasons = new Map<string, string>();
  if (!/N[ÃA]O HOUVE/i.test(redBlock)) {
    const redRe = new RegExp(`(\\d{1,2}:\\d{2})\\s*(1T|2T)\\s*(\\d{1,2})([\\s\\S]*?)(${teamToken})`, "g");
    for (const m of redBlock.matchAll(redRe)) {
      const key = `${sideOf(m[5]!)}:${Number(m[3]!)}`;
      redAt.set(key, timeline(m[1]!, m[2]!));
      const reason = extractDashReason(m[4]!);
      if (reason) redReasons.set(key, reason);
    }
  }

  // --- Substitutions ---------------------------------------------------------
  // Time+period glued with no separator ("10:002T"), or a bare ANT/INT/TER marker
  // with no period suffix at all — see module header.
  const subsBlock = section(text, /Substituições\s*Tempo/i, /ANT\s*=\s*Antes/i);
  const subRe = new RegExp(
    `(ANT|INT|TER|\\d{1,2}:\\d{2})\\s*(1T|2T)?\\s*(${teamToken}).*?(\\d{1,2})\\s*-\\s*.+?(\\d{1,2})\\s*-\\s*`,
    "g",
  );
  const subOnAt = new Map<string, number>();
  const subOffAt = new Map<string, number>();
  for (const m of subsBlock.matchAll(subRe)) {
    const side = sideOf(m[3]!);
    const at = timeline(m[1]!, m[2]);
    subOnAt.set(`${side}:${Number(m[4]!)}`, at); // "Entrou"
    subOffAt.set(`${side}:${Number(m[5]!)}`, at); // "Saiu"
  }

  // --- Compose appearances -----------------------------------------------------
  const appearances: ParsedAppearance[] = [];
  for (const side of ["home", "away"] as const) {
    const players = side === "home" ? roster.home : roster.away;
    const concededHere = goals.filter((g) => g.beneficiary !== side);
    for (const p of players) {
      const key = `${side}:${p.shirt}`;
      const cameOn = subOnAt.get(key);
      // A reserve credited with a goal is proof they were on the pitch, even with no
      // "Entrou" row for their shirt in the súmula's own Substituições table — a real
      // gap in the source's own data entry (see parse-cbf-events.ts's identical fix,
      // Session 57, for the confirmed real FES/FGF cases this pattern was found in).
      const scorerGoals = goals.filter((g) => !g.ownGoal && g.scorer === side && g.shirt === p.shirt);
      const playedViaGoal = cameOn == null && !p.starter && scorerGoals.length > 0;
      const played = p.starter || cameOn != null || playedViaGoal;
      if (!played) continue; // reserve who never entered and never scored → no atuação

      const entry = p.starter ? 0 : playedViaGoal ? Math.min(...scorerGoals.map((g) => g.at)) : cameOn!;
      const off = subOffAt.get(key);
      const red = redAt.get(key);
      const exitCandidates = [off, red].filter((v): v is number => v != null);
      const minutesExit = exitCandidates.length ? Math.min(...exitCandidates) : FULL;
      const minutesPlayed = Math.max(0, Math.min(130, Math.round(minutesExit - entry)));

      const windowExit = exitCandidates.length ? Math.min(...exitCandidates) : Infinity;
      const goalsAgainstWhileOn = concededHere.filter((g) => g.at >= entry && g.at < windowExit).length;

      const goalsScored = scorerGoals.length;
      const redCard = red != null || (yellowCount.get(key) ?? 0) >= 2 ? 1 : 0;

      appearances.push({
        bid: p.bid,
        side,
        playerCategory: ctx.matchCategory,
        minutesPlayed,
        goals: goalsScored,
        assists: 0, // not present in the súmula
        yellowCards: Math.min(2, yellowCount.get(key) ?? 0),
        redCards: redCard,
        cleanSheet: false, // no goalkeeper marker in the FMF roster to compute this safely
        yellowCardReasons: yellowReasons.get(key),
        redCardReasons: redCard && redReasons.has(key) ? [redReasons.get(key)!] : undefined,
      });
    }
  }

  return { appearances, ownGoals: goals.filter((g) => g.ownGoal).length };
}

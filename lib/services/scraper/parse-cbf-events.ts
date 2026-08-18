// FOOTBASE Phase 6.3 — CBF súmula EVENT parser + appearance builder (pure).
//
// The same súmula PDF that lists the roster (6.2) also carries the match events in
// later sections: "Gols", "Cartões Amarelos", "Cartões Vermelhos" and
// "Substituições". This module turns those sections + the parsed roster into the
// `ParsedAppearance[]` consumed by `ingest.ts` → `atuacoes_sumula`.
//
// It is PURE (text + roster in, appearances out) so it is unit-testable and safe in
// dry-run. Minutes played and clean sheets are RECONSTRUCTED from the substitution
// timeline (the súmula does not state them directly), so they are a documented
// approximation on a 0..90 nominal timeline until richer data exists. Assists are
// not present in the súmula → always 0. Own goals ("Contra") do not count toward the
// scorer's personal goals but do count as conceded by their own team.

import type { ParsedAppearance } from "./types.ts";
import type { RosterPlayer } from "./parse-cbf-sumula.ts";

type Side = "home" | "away";

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

/** Cut the text between two section markers (start inclusive of content, end exclusive). */
function section(text: string, startRe: RegExp, endRe: RegExp): string {
  const s = text.search(startRe);
  if (s === -1) return "";
  const rest = text.slice(s);
  const e = rest.slice(1).search(endRe);
  return e === -1 ? rest : rest.slice(0, e + 1);
}

/**
 * "12:00"+"2T" → 57; "+5"/"+05:00"+"2T" → 90 (end of half); "20:00"+"1T" → 20;
 * "-"+"INT" → 45 (a substitution made at the half-time break itself, no exact
 * minute given — confirmed live, Session 44: the time column reads a literal "-").
 */
function timeline(rawTime: string, period: string): number {
  if (period === "INT") return HALF;
  const base = period === "2T" ? HALF : 0;
  if (rawTime.trim().startsWith("+")) return period === "2T" ? FULL : HALF;
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
  beneficiary: Side; // team that got the point (opponent for an own goal)
  at: number; // timeline minute
}

export interface BuildAppearancesResult {
  appearances: ParsedAppearance[];
  /** Own goals ("Contra") — count toward the final score, not any player's tally. */
  ownGoals: number;
}

export function buildAppearances(
  text: string,
  roster: { home: RosterPlayer[]; away: RosterPlayer[] },
  ctx: EventContext,
): BuildAppearancesResult {
  const homeSlug = slug(ctx.homeName);
  const awaySlug = slug(ctx.awayName);
  const sideOf = (teamToken: string): Side => {
    const name = teamToken.split("/")[0] ?? teamToken;
    const s = slug(name);
    return s.startsWith(homeSlug) || homeSlug.startsWith(s) ? "home" : "away";
  };

  // Team token, anchored on a short PREFIX of the two known club names rather than a
  // generic `\S+\/[A-Z]{2}` pattern or the full literal name. Two things confirmed
  // live (Session 44):
  //  - `pdf-parse` glues the team token directly onto the end of the preceding
  //    player's surname with no delimiter at all in the Gols/Cartões sections (e.g.
  //    "...SoaresAvaí/SC"), so a whitespace-bounded `\S+` capture would grab part of
  //    the surname along with the team.
  //  - Long club names get truncated with "..." in the Substituições section
  //    (same convention as player names elsewhere), e.g. "Sao Paulo Futebol Clube
  //    do..." — cutting off the "/UF" suffix entirely, so anchoring on the FULL
  //    literal name (which worked for Gols/Cartões) silently matched nothing there
  //    and dropped every substitution for that team, which meant those players'
  //    entire appearances (not just their sub timing) went missing.
  // A short prefix (well under the shortest truncation length seen, ~10 chars)
  // survives both: it's long enough to disambiguate two real club names, short
  // enough to never itself be cut off, and doesn't depend on a "/UF" suffix that
  // isn't reliably present.
  const prefixLen = 8;
  const homePrefix = ctx.homeName.slice(0, prefixLen);
  const awayPrefix = ctx.awayName.slice(0, prefixLen);
  const teamToken = `(?:${escapeRegExp(homePrefix)}|${escapeRegExp(awayPrefix)})`;

  // --- Goals ---------------------------------------------------------------
  const goalsBlock = section(text, /Gols\s*Tempo/i, /NR\s*=\s*Normal|Cartões|Comissão/i);
  const goalRe = new RegExp(`(\\+?\\d+(?::\\d{2})?)\\s*(1T|2T)\\s*(\\d{1,2})\\s*(NR|PN|CT|FT).*?(${teamToken})`, "g");
  const goals: GoalEvent[] = [];
  for (const m of goalsBlock.matchAll(goalRe)) {
    const scorer = sideOf(m[5]!);
    const ownGoal = m[4] === "CT";
    goals.push({
      scorer,
      shirt: Number(m[3]!),
      ownGoal,
      beneficiary: ownGoal ? (scorer === "home" ? "away" : "home") : scorer,
      at: timeline(m[1]!, m[2]!),
    });
  }

  // --- Yellow cards --------------------------------------------------------
  const yellowBlock = section(text, /Cartões Amarelos/i, /Cartões Vermelhos|Comissão|Ocorrências/i);
  // `.*?Motivo:` (not `\s*Motivo:`): same reason as subRe below — the team token is
  // only an 8-char prefix, so any leftover name/"/UF" text before "Motivo:" needs to
  // be skipped, not required to be whitespace.
  const yellowRe = new RegExp(`(?:\\+?\\d+(?::\\d{2})?)\\s*(1T|2T)\\s*(\\d{1,2}).*?(${teamToken}).*?Motivo:`, "g");
  const yellowCount = new Map<string, number>();
  for (const m of yellowBlock.matchAll(yellowRe)) {
    const key = `${sideOf(m[3]!)}:${Number(m[2]!)}`;
    yellowCount.set(key, (yellowCount.get(key) ?? 0) + 1);
  }

  // --- Red cards -----------------------------------------------------------
  const redBlock = section(text, /Cartões Vermelhos/i, /Comissão|Ocorrências|Substituições|Confederação/i);
  const redAt = new Map<string, number>();
  if (!/NÃO HOUVE EXPULS/i.test(redBlock)) {
    const redRe = new RegExp(`(\\+?\\d+(?::\\d{2})?)\\s*(1T|2T)\\s*(\\d{1,2}).*?(${teamToken}).*?Motivo:`, "g");
    for (const m of redBlock.matchAll(redRe)) {
      redAt.set(`${sideOf(m[4]!)}:${Number(m[3]!)}`, timeline(m[1]!, m[2]!));
    }
  }

  // --- Substitutions -------------------------------------------------------
  // A substitution made right at the half-time break has no exact minute — the time
  // column reads a literal "-" and the period reads "INT" instead of "1T"/"2T"
  // (confirmed live, Session 44: e.g. "-INTRed Bull Bragantino/SP17 - ..."). Missing
  // this meant that player's entry was never recorded, so `played` came out false for
  // them even though they were on the pitch (and could have scored) — silently
  // dropping their whole appearance, not just the substitution timing.
  const subsBlock = section(text, /Substituições\s*Tempo/i, /Confederação|Ocorrências|www\.tcpdf/i);
  // `.*?` (not `\s*`) between the team token and the shirt number: the token is only
  // an 8-char PREFIX now, so whatever's left of the team name/"/UF" before the shirt
  // digit (present when the name wasn't long enough to truncate) needs to be skipped,
  // not required to be whitespace.
  const subRe = new RegExp(
    `(-|\\d{1,2}:\\d{2})\\s*(1T|2T|INT)\\s*(${teamToken}).*?(\\d{1,2})\\s*-\\s*.+?(\\d{1,2})\\s*-\\s*`,
    "g",
  );
  const subOnAt = new Map<string, number>(); // key side:shirt → minute the player entered
  const subOffAt = new Map<string, number>(); // key side:shirt → minute the player left
  for (const m of subsBlock.matchAll(subRe)) {
    const side = sideOf(m[3]!);
    const at = timeline(m[1]!, m[2]!);
    subOnAt.set(`${side}:${Number(m[4]!)}`, at); // "Entrou"
    subOffAt.set(`${side}:${Number(m[5]!)}`, at); // "Saiu"
  }

  // --- Compose appearances -------------------------------------------------
  const appearances: ParsedAppearance[] = [];
  for (const side of ["home", "away"] as const) {
    const players = side === "home" ? roster.home : roster.away;
    const concededHere = goals.filter((g) => g.beneficiary !== side); // goals against this side
    for (const p of players) {
      const key = `${side}:${p.shirt}`;
      const cameOn = subOnAt.get(key);
      const played = p.starter || cameOn != null;
      if (!played) continue; // reserve who never entered → no atuação

      const entry = p.starter ? 0 : cameOn!;
      const off = subOffAt.get(key);
      const red = redAt.get(key);
      const exitCandidates = [off, red].filter((v): v is number => v != null);
      const minutesExit = exitCandidates.length ? Math.min(...exitCandidates) : FULL;
      const minutesPlayed = Math.max(0, Math.min(130, Math.round(minutesExit - entry)));

      // clean-sheet window: to the end of the match unless the player left early.
      const windowExit = exitCandidates.length ? Math.min(...exitCandidates) : Infinity;
      const goalsAgainstWhileOn = concededHere.filter((g) => g.at >= entry && g.at < windowExit).length;

      const goalsScored = goals.filter((g) => !g.ownGoal && g.scorer === side && g.shirt === p.shirt).length;

      appearances.push({
        bid: p.bid,
        playerCategory: ctx.matchCategory,
        minutesPlayed,
        goals: goalsScored,
        assists: 0, // not present in the súmula
        yellowCards: Math.min(2, yellowCount.get(key) ?? 0),
        redCards: red != null || (yellowCount.get(key) ?? 0) >= 2 ? 1 : 0,
        cleanSheet: p.isGoalkeeper && goalsAgainstWhileOn === 0,
      });
    }
  }

  return { appearances, ownGoals: goals.filter((g) => g.ownGoal).length };
}

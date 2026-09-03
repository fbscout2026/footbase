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

/** Collapse pdf-parse's word-wrapped "Motivo:" text into one clean line. */
function cleanReason(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned || null;
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
 * `period` starts with "2" ("2T" normally, or a bare "2" — see `goalRe`'s doc for why).
 */
function timeline(rawTime: string, period: string): number {
  if (period === "INT") return HALF;
  const isSecondHalf = period.startsWith("2");
  const base = isSecondHalf ? HALF : 0;
  if (rawTime.trim().startsWith("+")) return isSecondHalf ? FULL : HALF;
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
  // The period token is normally "1T"/"2T" (confirmed for CBF's own súmulas and for
  // this same PDF's OWN Cartões/Substituições sections), but a real FGF súmula
  // (same underlying template, served from `conteudo.cbf.com.br/federacoes/{id}/`)
  // renders the "T" as dropped specifically in the Gols table's column — "111NR"
  // (period "1", shirt "11", type "NR"), not "1T11NR".
  //
  // A "+MM" stoppage-time entry needs its OWN, stricter period rule: real CBF data
  // keeps the full "2T" there ("+52T13NR" = "+5", "2T", shirt 13, "NR" — confirmed
  // against a real CBF fixture), but a real FGF one can OMIT the period digit
  // entirely ("+1210PN..." = "+12", shirt 10, "PN", no period at all — confirmed
  // against a real fixture, cross-checked: shirt 10 is independently confirmed via
  // that same match's Cartões section). Accepting a BARE "1"/"2" as period after a
  // "+" (as an earlier version of this regex did, mirroring the colon-time branch)
  // is fatally ambiguous whenever the shirt itself starts with that same digit —
  // greedy backtracking "finds" period="1" + shirt="0" (a shirt on no real roster),
  // silently dropping the real shirt's goal instead of throwing. Requiring the FULL
  // "1T"/"2T" (never a bare digit) specifically in the "+" branch resolves both real
  // shapes correctly: CBF's still matches (it always has the "T"), FGF's period
  // group simply doesn't match at all (correctly leaving all the digits for shirt).
  // `timeline()` defaults to 1st-half when no period was captured — same behavior as
  // before this fix, and correct whenever a period WAS present and got matched.
  const goalsBlock = section(text, /Gols\s*Tempo/i, /NR\s*=\s*Normal|Cartões|Comissão/i);
  const goalRe = new RegExp(
    `(?:(\\d{1,2}:\\d{2})\\s*(1T?|2T?)|(\\+\\d{1,2})\\s*(1T|2T)?)\\s*(\\d{1,2})\\s*(NR|PN|CT|FT).*?(${teamToken})`,
    "g",
  );
  const goals: GoalEvent[] = [];
  for (const m of goalsBlock.matchAll(goalRe)) {
    const rawTime = m[1] ?? m[3]!;
    const period = m[2] ?? m[4] ?? "";
    const scorer = sideOf(m[7]!);
    const ownGoal = m[6] === "CT";
    goals.push({
      scorer,
      shirt: Number(m[5]!),
      ownGoal,
      beneficiary: ownGoal ? (scorer === "home" ? "away" : "home") : scorer,
      at: timeline(rawTime, period),
    });
  }

  // --- Yellow cards --------------------------------------------------------
  const yellowBlock = section(text, /Cartões Amarelos/i, /Cartões Vermelhos|Comissão|Ocorrências/i);
  // `.*?Motivo:` (not `\s*Motivo:`): same reason as subRe below — the team token is
  // only an 8-char prefix, so any leftover name/"/UF" text before "Motivo:" needs to
  // be skipped, not required to be whitespace.
  //
  // The captured reason (group 4) runs from right after "Motivo:" up to the next
  // event's own time+period token (or the end of the block) — real reason text is
  // word-wrapped across multiple lines by pdf-parse (confirmed live, Session 55:
  // "Motivo: A1.13.  Dar uma entrada ... temerária na\ndisputa de bola "), so this
  // needs `[\s\S]*?` (matches newlines too), not `.*?`.
  const yellowRe = new RegExp(
    `(?:\\+?\\d+(?::\\d{2})?)\\s*(1T|2T)\\s*(\\d{1,2}).*?(${teamToken}).*?Motivo:\\s*([\\s\\S]*?)(?=(?:\\+?\\d+(?::\\d{2})?)\\s*(?:1T|2T)|$)`,
    "g",
  );
  const yellowCount = new Map<string, number>();
  const yellowReasons = new Map<string, string[]>();
  for (const m of yellowBlock.matchAll(yellowRe)) {
    const key = `${sideOf(m[3]!)}:${Number(m[2]!)}`;
    yellowCount.set(key, (yellowCount.get(key) ?? 0) + 1);
    const reason = cleanReason(m[4]);
    if (reason) (yellowReasons.get(key) ?? yellowReasons.set(key, []).get(key)!).push(reason);
  }

  // --- Red cards -----------------------------------------------------------
  const redBlock = section(text, /Cartões Vermelhos/i, /Comissão|Ocorrências|Substituições|Confederação/i);
  const redAt = new Map<string, number>();
  const redReasons = new Map<string, string>();
  if (!/NÃO HOUVE EXPULS/i.test(redBlock)) {
    const redRe = new RegExp(
      `(\\+?\\d+(?::\\d{2})?)\\s*(1T|2T)\\s*(\\d{1,2}).*?(${teamToken}).*?Motivo:\\s*([\\s\\S]*?)(?=(?:\\+?\\d+(?::\\d{2})?)\\s*(?:1T|2T)|$)`,
      "g",
    );
    for (const m of redBlock.matchAll(redRe)) {
      const key = `${sideOf(m[4]!)}:${Number(m[3]!)}`;
      redAt.set(key, timeline(m[1]!, m[2]!));
      const reason = cleanReason(m[5]);
      if (reason) redReasons.set(key, reason);
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
      // A reserve credited with a goal is proof they were on the pitch, even when the
      // súmula's own Substituições table has no "Entrou" row for their shirt — a real
      // gap in the source's own data entry (confirmed live, Session 57: real FES/FGF
      // súmulas where a reserve scores and is simply never listed as substituted in),
      // not a parser miss. Before this, that goal was silently dropped from the whole
      // match's total, failing reconciliation for a match that was otherwise parsed
      // correctly. Their earliest credited goal is the latest possible entry time we
      // can PROVE — used as a lower-bound estimate, never a guess at their real minute.
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

      // clean-sheet window: to the end of the match unless the player left early.
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
        cleanSheet: p.isGoalkeeper && goalsAgainstWhileOn === 0,
        yellowCardReasons: yellowReasons.get(key),
        redCardReasons: redCard && redReasons.has(key) ? [redReasons.get(key)!] : undefined,
      });
    }
  }

  return { appearances, ownGoals: goals.filter((g) => g.ownGoal).length };
}

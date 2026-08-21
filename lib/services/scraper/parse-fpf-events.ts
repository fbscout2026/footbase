// FOOTBASE Phase 6.x — FPF súmula EVENT parser + appearance builder (pure).
//
// Mirrors `parse-cbf-events.ts`, adapted to the FPF súmula's actual text shape
// (verified against one real SUB-17 sample): event rows are prefixed with the exact
// team NAME (not a "/UF" club token like CBF), and the minute is either "MM:SS" or a
// stoppage-time "+N" marker, immediately followed by the period ("1T"/"2T", or "INT"
// for a substitution made at half-time with no exact minute).
//
// KNOWN GAP: unlike the CBF súmula (a `g\` marker flags the goalkeeper), this FPF
// súmula's roster rows carry NO position/goalkeeper marker at all — shirt number is
// not a reliable convention either (this sample's starting XI had its usual #1 on the
// bench). Clean sheets therefore CANNOT be computed from this source and are always
// `false` here, never guessed — a real limitation to revisit if a source that states
// goalkeeper position turns up (e.g. the roster/registry endpoint, or admin curation).

import type { FpfRosterPlayer } from "./parse-fpf-sumula.ts";

type Side = "home" | "away";

const HALF = 45;
const FULL = 90;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Unlike the CBF súmula (where "MM:SS" is relative to the current half, so 2T needs a
// +45 offset), the FPF súmula's "MM:SS" is already the ABSOLUTE match minute — verified
// against the real sample: a substitution at "69:00" "2T" and a goal at "77:00" "2T"
// only make sense as literal 69th/77th match minutes (a 90-minute SUB-17 match cannot
// have a normal-time event 69 or 77 minutes into a ~45-minute second half). Only the
// stoppage-time "+N" marker (no absolute minute given) still needs a half-based estimate.
/** "25:00"+"1T" → 25 (already absolute); "+ 4"+"2T" → 90 (end of half, estimated); "-"+"INT" → 45. */
function timeline(rawTime: string, period: string): number {
  const t = rawTime.trim();
  if (period === "INT") return HALF; // substitution made at the half-time break
  if (t.startsWith("+")) return period === "2T" ? FULL : HALF; // stoppage time, no absolute minute given
  const mm = parseInt(t, 10);
  return Number.isFinite(mm) ? mm : (period === "2T" ? FULL : 0);
}

/** Cut the text between two section markers (start inclusive of content, end exclusive). */
function section(text: string, startRe: RegExp, endRe: RegExp): string {
  const s = text.search(startRe);
  if (s === -1) return "";
  const rest = text.slice(s);
  const e = rest.slice(1).search(endRe);
  return e === -1 ? rest : rest.slice(0, e + 1);
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

export interface FpfParsedAppearance {
  registro: string;
  side: "home" | "away";
  playerCategory: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheet: boolean; // always false here — see module doc comment (no GK marker in this source)
  yellowCardReasons?: (string | null)[];
  redCardReasons?: (string | null)[];
}

const TIME = String.raw`(\+\s*\d{1,2}|\d{1,3}(?::\d{2})?|-)`;
const PERIOD = String.raw`(1T|2T|INT)`;

export interface BuildFpfAppearancesResult {
  appearances: FpfParsedAppearance[];
  /** Own goals ("Contra") — count toward the final score, not any player's tally. */
  ownGoals: number;
}

export function buildFpfAppearances(
  text: string,
  roster: { home: FpfRosterPlayer[]; away: FpfRosterPlayer[] },
  ctx: EventContext,
): BuildFpfAppearancesResult {
  const teamAlt = `(${escapeRegex(ctx.homeName)}|${escapeRegex(ctx.awayName)})`;
  const sideOf = (teamName: string): Side => (teamName === ctx.homeName ? "home" : "away");

  // --- Goals ---------------------------------------------------------------
  const goalsBlock = section(text, /Gols\s+Equipe/i, /NR\s*=\s*Normal|Advertências|Comissão/i);
  const goalRe = new RegExp(`${teamAlt}(\\d{1,2})(.+?)(NR|PN|CT|FT)${TIME}${PERIOD}`, "g");
  const goals: GoalEvent[] = [];
  for (const m of goalsBlock.matchAll(goalRe)) {
    const scorer = sideOf(m[1]!);
    const ownGoal = m[4] === "CT";
    goals.push({
      scorer,
      shirt: Number(m[2]!),
      ownGoal,
      beneficiary: ownGoal ? (scorer === "home" ? "away" : "home") : scorer,
      at: timeline(m[5]!, m[6]!),
    });
  }

  // --- Yellow cards ("Advertências") ----------------------------------------
  const yellowBlock = section(text, /Advertências\s+Equipe/i, /Expulsões|Comissão/i);
  const yellowRe = new RegExp(`${teamAlt}(\\d{1,2})([^\\d]+?)${TIME}${PERIOD}\\s*Motivo:\\s*(.*?)(?=${teamAlt}\\d|$)`, "g");
  const yellowCount = new Map<string, number>();
  const yellowReasons = new Map<string, string[]>();
  for (const m of yellowBlock.matchAll(yellowRe)) {
    const key = `${sideOf(m[1]!)}:${Number(m[2]!)}`;
    yellowCount.set(key, (yellowCount.get(key) ?? 0) + 1);
    const reason = m[6]?.replace(/\s+/g, " ").trim() || null;
    if (reason) (yellowReasons.get(key) ?? yellowReasons.set(key, []).get(key)!).push(reason);
  }

  // --- Red cards ("Expulsões") -----------------------------------------------
  const redBlock = section(text, /Expulsões/i, /Motivo de atraso|Comissão|Ocorrências/i);
  const redAt = new Map<string, number>();
  const redReasons = new Map<string, string>();
  if (!/NÃO HOUVE EXPULS/i.test(redBlock)) {
    const redRe = new RegExp(`${teamAlt}(\\d{1,2})([^\\d]+?)${TIME}${PERIOD}\\s*Motivo:\\s*(.*?)(?=${teamAlt}\\d|$)`, "g");
    for (const m of redBlock.matchAll(redRe)) {
      const key = `${sideOf(m[1]!)}:${Number(m[2]!)}`;
      // (Session 55) `m[4]`/`m[5]` are TIME/PERIOD — this call previously read
      // `m[5]`/`m[6]`, one index too high (no reason group existed yet, so
      // `m[6]` was always `undefined`), meaning every red card's minute
      // silently fell back to 0. Fixed while adding the reason group here,
      // since the two are directly adjacent in this same regex.
      redAt.set(key, timeline(m[4]!, m[5]!));
      const reason = m[6]?.replace(/\s+/g, " ").trim() || null;
      if (reason) redReasons.set(key, reason);
    }
  }

  // --- Substitutions ---------------------------------------------------------
  const subsBlock = section(text, /Substituições\s+Equipe/i, /Substituições por concussão|Comissão|Gols/i);
  const subRe = new RegExp(`${teamAlt}(\\d{1,2})([^\\d]+?)(\\d{1,2})([^\\d]+?)${TIME}${PERIOD}`, "g");
  const subOnAt = new Map<string, number>(); // key side:shirt (of the player coming IN)
  const subOffAt = new Map<string, number>(); // key side:shirt (of the player going OUT)
  for (const m of subsBlock.matchAll(subRe)) {
    const side = sideOf(m[1]!);
    const at = timeline(m[6]!, m[7]!);
    subOffAt.set(`${side}:${Number(m[2]!)}`, at); // shirt that left
    subOnAt.set(`${side}:${Number(m[4]!)}`, at); // shirt that entered
  }

  // --- Compose appearances ----------------------------------------------------
  const appearances: FpfParsedAppearance[] = [];
  for (const side of ["home", "away"] as const) {
    const players = side === "home" ? roster.home : roster.away;
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

      const goalsScored = goals.filter((g) => !g.ownGoal && g.scorer === side && g.shirt === p.shirt).length;
      const redCard = red != null || (yellowCount.get(key) ?? 0) >= 2 ? 1 : 0;

      appearances.push({
        registro: p.registro,
        side,
        playerCategory: ctx.matchCategory,
        minutesPlayed,
        goals: goalsScored,
        assists: 0, // not present in the súmula
        yellowCards: Math.min(2, yellowCount.get(key) ?? 0),
        redCards: redCard,
        cleanSheet: false, // no goalkeeper marker in this source — never guessed
        yellowCardReasons: yellowReasons.get(key),
        redCardReasons: redCard && redReasons.has(key) ? [redReasons.get(key)!] : undefined,
      });
    }
  }

  return { appearances, ownGoals: goals.filter((g) => g.ownGoal).length };
}

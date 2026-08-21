// FOOTBASE Phase 6.x — FERJ match-page EVENT parser + appearance builder + PDF/HTML
// composer (pure).
//
// Source: the match's own HTML page (`fferj.com.br/partidas/{id}`), NOT the PDF súmula
// (see `parse-ferj-sumula.ts`'s module doc for why the two are split: this HTML is
// server-rendered and `fetch`-able, but only carries events, not the roster — the
// "Escala" tab's lineup loads client-side and was never captured).
//
// CONFIRMED LIVE (one real SUB-15 match): every event card renders TWICE in the raw
// HTML (a duplicate — same pattern already seen in the FPF round-selector widget, see
// `discovery/fpf-discover.ts`'s module doc), so `parseFerjEvents` dedupes by the full
// matched block text.
//
// Minute convention: the minute shown ("35m") is RELATIVE to the current half (2T's
// "35m" is 35 minutes into the second half, not the 80th match minute) — confirmed
// against the PDF's absolute wall-clock cronologia for the same events. This mirrors
// the CBF súmula's convention (not the FPF's, which is already absolute), so
// `timeline` below is the CBF one (+45 offset for 2T), not the FPF one.

import type { FerjSumulaPdf } from "./parse-ferj-sumula.ts";

const HALF = 45;
const FULL = 90;

type Side = "home" | "away";

export interface FerjMatchTeam {
  name: string; // full display name, e.g. "E.C Nova Cidade" — NOT the PDF's short form
  clubId: number; // FERJ's own numeric club id (the crest image's `data-id`)
  // Real crest URL straight from the match page's own <img src> — NOT derivable
  // from `clubId` by a formula (confirmed live: `data-id="916"` but the crest
  // file is `img_icone_929.jpg` — the ids don't match), so it has to be
  // captured here, unlike the CBF crest (which IS a `{id}/escudo.jpg` formula).
  crestUrl: string | null;
}

interface RawEvent {
  minute: number | null; // null only for "Intervalo" (half-time) substitutions
  period: "1T" | "2T" | "Intervalo";
  teamName: string;
  type: "GOL" | "GOL DE PENALTI" | "GOL CONTRA" | "CARTÃO AMARELO" | "CARTÃO VERMELHO" | "SUBSTITUICAO";
  playerName?: string; // GOL / GOL DE PENALTI / GOL CONTRA / CARTÃO
  motivo?: string; // CARTÃO only
  enteredName?: string; // SUBSTITUICAO
  leftName?: string; // SUBSTITUICAO
}

// Matches one event card. Two shapes for the header (see module doc): normal events
// carry `<strong>Nm</strong>` before the period; a substitution made exactly at the
// half-time break has no minute at all, just the "Intervalo" label alone.
const EVENT_RE =
  /(?:<span><strong>(\d+)m<\/strong><\/span>)?<span class="font-light text-gray-500">([^<]+)<\/span><\/div><div class="flex gap-4 items-center"><img alt="([^"]+)" data-id="(\d+)"[^>]*\/><\/div><\/div><div class="mb-4"><div class="flex gap-2 items-center">.*?<\/svg><span>([^<]+)<\/span><\/div><\/div>(<p>[\s\S]*?<\/p>(?:<p>[\s\S]*?<\/p>)?)/g;

function stripTags(s: string): string {
  return s
    .replace(/<!--\s*-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRawEvents(html: string): RawEvent[] {
  const seen = new Set<string>();
  const events: RawEvent[] = [];

  for (const m of html.matchAll(EVENT_RE)) {
    const blockKey = m[0];
    if (seen.has(blockKey)) continue; // the whole page renders every event card twice
    seen.add(blockKey);

    const minute = m[1] != null ? Number(m[1]) : null;
    const period = m[2]!.trim() as RawEvent["period"];
    // Whitespace-normalized (trim + collapse internal runs) for the same reason as
    // parseFerjTeams' crest map: some club names carry a trailing space, others a
    // double internal space, in the raw `alt` attribute that isn't in the `<h1>`
    // heading (confirmed live, both variants) — an unnormalized compare here silently
    // sent every one of that team's events to the WRONG side (`sideOf`'s exact-match
    // fell through to "away"), so real goals/cards/subs were attributed to the
    // opponent's roster and never matched a real player there — not "missing", just
    // silently misfiled.
    const teamName = m[3]!.replace(/\s+/g, " ").trim();
    const type = m[5]!.trim() as RawEvent["type"];
    const body = m[6]!;
    const paragraphs = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => stripTags(p[1]!));

    if (type === "SUBSTITUICAO") {
      const enteredName = paragraphs[0]?.replace(/^Entrou:\s*/i, "").trim();
      const leftName = paragraphs[1]?.replace(/^Saiu:\s*/i, "").trim();
      events.push({ minute, period, teamName, type, enteredName, leftName });
    } else if (type === "CARTÃO AMARELO" || type === "CARTÃO VERMELHO") {
      // "PLAYER NAME rest-of-sentence-motivo" — the motivo is a normal sentence, so
      // its FIRST word is also capitalized ("Dar uma entrada...") and a single
      // uppercase/lowercase character-class split doesn't find the boundary. Split by
      // WORD instead: the player name is the leading run of words that are fully
      // upper-case (every letter, no exceptions) — "Dar" fails that test ('ar' is
      // lower-case) even though its first letter is capitalized like a name would be.
      const text = paragraphs[0] ?? "";
      const words = text.split(" ");
      const isAllUpper = (w: string) => w.length > 0 && w === w.toUpperCase() && w !== w.toLowerCase();
      let splitAt = 0;
      while (splitAt < words.length && isAllUpper(words[splitAt]!)) splitAt++;
      const playerName = words.slice(0, splitAt).join(" ").trim();
      const motivo = words.slice(splitAt).join(" ").trim() || undefined;
      events.push({ minute, period, teamName, type, playerName: playerName || text, motivo });
    } else if (type === "GOL DE PENALTI") {
      // CONFIRMED LIVE (a real SUB-15 match): a penalty goal's body markup reuses the
      // SUBSTITUICAO card's "Entrou: NAME" paragraph (no "Saiu:" second paragraph) —
      // looks like a shared UI component on FERJ's own site, not a parsing quirk on
      // this end. Strip the same "Entrou: " prefix to recover the scorer's name.
      const playerName = paragraphs[0]?.replace(/^Entrou:\s*/i, "").trim();
      events.push({ minute, period, teamName, type, playerName });
    } else {
      events.push({ minute, period, teamName, type, playerName: paragraphs[0] });
    }
  }

  return events;
}

/** "35m"+"2T" → 80 (absolute); "Intervalo" (no minute) → 45. */
function timeline(minute: number | null, period: RawEvent["period"]): number {
  if (period === "Intervalo" || minute == null) return HALF;
  const base = period === "2T" ? HALF : 0;
  return base + minute;
}

export interface FerjParsedAppearance {
  bira: string;
  side: "home" | "away";
  playerCategory: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheet: boolean; // always false — no goalkeeper marker in either source, never guessed
  yellowCardReasons?: (string | null)[];
  redCardReasons?: (string | null)[];
}

export interface BuildFerjAppearancesResult {
  appearances: FerjParsedAppearance[];
  ownGoals: number;
}

interface FerjEventRoster {
  gluedName: string;
  shirt: number;
  bira: string;
  starter: boolean;
}

/**
 * Builds appearances by matching each event's player NAME against the roster's
 * GLUED "apelido+nomeCompleto" string with `.endsWith(...)` — this works whether or
 * not `cleanGluedName` (in parse-ferj-sumula.ts) recovered the real split, because
 * the event's name is always the true full name, i.e. always the SUFFIX of the glued
 * string (see that module's doc for why the split itself can't always be recovered).
 */
export function buildFerjAppearances(
  html: string,
  roster: { home: FerjEventRoster[]; away: FerjEventRoster[] },
  ctx: { homeTeam: FerjMatchTeam; awayTeam: FerjMatchTeam; matchCategory: string },
): BuildFerjAppearancesResult {
  const events = parseRawEvents(html);
  const sideOf = (teamName: string): Side => (teamName === ctx.homeTeam.name ? "home" : "away");

  // Strips accents/diacritics AND the punctuation some names carry for them (an
  // apostrophe-like surname such as "Sant'Ana"), because the PDF and the HTML encode
  // that punctuation DIFFERENTLY for the exact same name — confirmed live: the PDF's
  // text layer yields "SANT" + U+0020 + U+0301 (a stray space then a floating
  // COMBINING ACUTE ACCENT, not attached to any letter — a pdf-parse extraction
  // artifact), while the HTML renders "SANT" + U+00B4 (ACUTE ACCENT, a standalone
  // punctuation mark) + "ANA" — visually similar, byte-for-byte different, so an exact
  // `endsWith` never matches. NFD-decomposing accented LETTERS (Ã→A+combining-tilde)
  // then stripping every combining mark AND common name-punctuation makes both sides
  // collapse to the same plain "SANTANA", independent of which artifact produced it.
  // Whitespace is stripped ENTIRELY (not just collapsed) — the PDF's floating
  // combining-accent artifact isn't just the accent, it's a genuine stray space
  // character adjacent to it too ("SANT" + " " + combining-accent + "ANA"), which a
  // same-length collapse can't repair without knowing which spaces are "real" word
  // breaks. This is only used for identity matching (`endsWith`), never display, so
  // losing word boundaries doesn't matter.
  const foldName = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // combining diacritics (from NFD decomposition, or floating like the PDF's)
      .replace(/[´'’´]/g, "") // apostrophe-like punctuation used in place of an accent
      .replace(/\s+/g, "")
      .toUpperCase();

  const findPlayer = (side: Side, name: string): FerjEventRoster | undefined => {
    const players = side === "home" ? roster.home : roster.away;
    const normalized = foldName(name);
    return players.find((p) => foldName(p.gluedName).endsWith(normalized));
  };

  interface GoalEvent {
    side: Side;
    bira: string | null;
    ownGoal: boolean;
    beneficiary: Side;
    at: number;
  }
  const goals: GoalEvent[] = [];
  const yellowCount = new Map<string, number>();
  const yellowReasons = new Map<string, string[]>();
  const redAt = new Map<string, number>();
  const redReasons = new Map<string, string>();
  const subOnAt = new Map<string, number>();
  const subOffAt = new Map<string, number>();

  for (const ev of events) {
    const side = sideOf(ev.teamName);
    const at = timeline(ev.minute, ev.period);

    if (ev.type === "GOL" || ev.type === "GOL DE PENALTI" || ev.type === "GOL CONTRA") {
      const ownGoal = ev.type === "GOL CONTRA";
      const player = ev.playerName ? findPlayer(side, ev.playerName) : undefined;
      goals.push({ side, bira: player?.bira ?? null, ownGoal, beneficiary: ownGoal ? (side === "home" ? "away" : "home") : side, at });
    } else if (ev.type === "CARTÃO AMARELO" || ev.type === "CARTÃO VERMELHO") {
      const player = ev.playerName ? findPlayer(side, ev.playerName) : undefined;
      if (player) {
        const key = `${side}:${player.bira}`;
        const reason = ev.motivo?.trim() || null;
        if (ev.type === "CARTÃO VERMELHO") {
          redAt.set(key, at);
          if (reason) redReasons.set(key, reason);
        } else {
          yellowCount.set(key, (yellowCount.get(key) ?? 0) + 1);
          if (reason) (yellowReasons.get(key) ?? yellowReasons.set(key, []).get(key)!).push(reason);
        }
      }
    } else if (ev.type === "SUBSTITUICAO") {
      const entered = ev.enteredName ? findPlayer(side, ev.enteredName) : undefined;
      const left = ev.leftName ? findPlayer(side, ev.leftName) : undefined;
      if (entered) subOnAt.set(`${side}:${entered.bira}`, at);
      if (left) subOffAt.set(`${side}:${left.bira}`, at);
    }
  }

  const appearances: FerjParsedAppearance[] = [];
  for (const side of ["home", "away"] as const) {
    const players = side === "home" ? roster.home : roster.away;
    for (const p of players) {
      const key = `${side}:${p.bira}`;
      const cameOn = subOnAt.get(key);
      const played = p.starter || cameOn != null;
      if (!played) continue; // reserve who never entered → no atuação

      const entry = p.starter ? 0 : cameOn!;
      const off = subOffAt.get(key);
      const red = redAt.get(key);
      const exitCandidates = [off, red].filter((v): v is number => v != null);
      const minutesExit = exitCandidates.length ? Math.min(...exitCandidates) : FULL;
      const minutesPlayed = Math.max(0, Math.min(130, Math.round(minutesExit - entry)));

      const goalsScored = goals.filter((g) => !g.ownGoal && g.side === side && g.bira === p.bira).length;
      const redCard = red != null || (yellowCount.get(key) ?? 0) >= 2 ? 1 : 0;

      appearances.push({
        bira: p.bira,
        side,
        playerCategory: ctx.matchCategory,
        minutesPlayed,
        goals: goalsScored,
        assists: 0, // not present in either source
        yellowCards: Math.min(2, yellowCount.get(key) ?? 0),
        redCards: redCard,
        cleanSheet: false, // no goalkeeper marker in either source — never guessed
        yellowCardReasons: yellowReasons.get(key),
        redCardReasons: redCard && redReasons.has(key) ? [redReasons.get(key)!] : undefined,
      });
    }
  }

  return { appearances, ownGoals: goals.filter((g) => g.ownGoal).length };
}

/** Extracts the two teams (full display name + FERJ numeric club id) from the match
 * page's `<h1>A X B</h1>` heading and the first two distinct crest `data-id`s. */
export function parseFerjTeams(html: string): { home: FerjMatchTeam; away: FerjMatchTeam } {
  const h1 = html.match(/<h1>(.+?)<!--\s*-->\s*X\s*<!--\s*-->(.+?)<\/h1>/);
  if (!h1) throw new Error("could not locate the '<h1>A X B</h1>' teams heading");
  const homeName = stripTags(h1[1]!);
  const awayName = stripTags(h1[2]!);

  // `alt` is whitespace-normalized the SAME way `stripTags` normalizes `homeName`/
  // `awayName` (trim AND collapse internal runs of whitespace to one space) —
  // confirmed live, two distinct artifacts: some club names carry a trailing space in
  // the raw `alt` (`alt="S. E. de Búzios "`) that isn't in the `<h1>` heading; others
  // carry a DOUBLE internal space (`alt="Rio Barra Futebol  Clube Ltda"`, note
  // "Futebol  Clube") that `stripTags`'s `\s+`-collapse already normalizes away on the
  // `<h1>` side but a plain `.trim()` here didn't touch — either mismatch alone
  // silently failed to resolve that team's crest id.
  const crestRe = /alt="([^"]+)" data-id="(\d+)"[^>]*?src="([^"]+)"/g;
  const ids = new Map<string, { clubId: number; crestUrl: string }>();
  for (const m of html.matchAll(crestRe)) {
    const name = m[1]!.replace(/\s+/g, " ").trim();
    if (!ids.has(name)) ids.set(name, { clubId: Number(m[2]!), crestUrl: m[3]! });
  }

  const home = ids.get(homeName);
  const away = ids.get(awayName);
  if (!home || !away) throw new Error("could not resolve both teams' crest data-id");

  return {
    home: { name: homeName, clubId: home.clubId, crestUrl: home.crestUrl },
    away: { name: awayName, clubId: away.clubId, crestUrl: away.crestUrl },
  };
}

// --- Composer: PDF (header + roster) + HTML (teams + events) → FerjParsedMatch ------

export interface FerjParsedClub {
  name: string;
  clubId: number; // FERJ's own numeric club id — sourceKey is `ferj:{clubId}`
  crestUrl: string | null;
}

export interface FerjParsedAthlete {
  bira: string;
  name: string;
}

export interface FerjParsedMatch {
  tournament: { name: string; federation: "FERJ"; year: number; category: string };
  matchDate: string;
  matchCategory: string;
  rodada: string | null;
  home: FerjParsedClub;
  away: FerjParsedClub;
  homeScore: number | null;
  awayScore: number | null;
  sourceUrl: string | null;
  athletes: FerjParsedAthlete[];
  appearances: FerjParsedAppearance[];
  ownGoals: number;
}

export interface FerjSumula {
  match: FerjParsedMatch;
  roster: { home: FerjEventRoster[]; away: FerjEventRoster[] };
}

export interface BuildFerjSumulaOptions {
  sourceUrl?: string | null; // the PDF súmula URL (recorded as partidas_sumula.source_url)
}

/** Combines the PDF súmula (header + roster + BIRA) with the match page's own HTML
 * (team crest ids + events) into one `FerjParsedMatch`. Both parsers agree on team
 * ORDER (home first, away second) independently — the PDF from "Jogo:A X B", the HTML
 * from "<h1>A X B</h1>" — so they're paired positionally, not by name matching. */
export function buildFerjSumula(pdf: FerjSumulaPdf, html: string, opts: BuildFerjSumulaOptions = {}): FerjSumula {
  const teams = parseFerjTeams(html);

  const toEventRoster = (players: FerjSumulaPdf["roster"]["home"]): FerjEventRoster[] =>
    players.map((p) => ({ gluedName: p.gluedName, shirt: p.shirt, bira: p.bira, starter: p.starter }));

  const roster = { home: toEventRoster(pdf.roster.home), away: toEventRoster(pdf.roster.away) };

  const { appearances, ownGoals } = buildFerjAppearances(html, roster, {
    homeTeam: teams.home,
    awayTeam: teams.away,
    matchCategory: pdf.header.category,
  });

  const athletes: FerjParsedAthlete[] = [...pdf.roster.home, ...pdf.roster.away].map((p) => ({ bira: p.bira, name: p.name }));

  const match: FerjParsedMatch = {
    tournament: { name: pdf.header.tournamentName, federation: "FERJ", year: pdf.header.year, category: pdf.header.category },
    matchDate: pdf.header.matchDate,
    matchCategory: pdf.header.category,
    rodada: pdf.header.rodada,
    home: { name: teams.home.name, clubId: teams.home.clubId, crestUrl: teams.home.crestUrl },
    away: { name: teams.away.name, clubId: teams.away.clubId, crestUrl: teams.away.crestUrl },
    homeScore: pdf.header.homeScore,
    awayScore: pdf.header.awayScore,
    sourceUrl: opts.sourceUrl ?? null,
    athletes,
    appearances,
    ownGoals,
  };

  return { match, roster };
}

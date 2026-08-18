// FOOTBASE — classificação (standings) + artilharia (top scorers) calculators.
//
// Pure functions over already-fetched match/appearance rows — no IO, computed
// server-side in `lib/services/torneios.ts` from `partidas_sumula`/`atuacoes_sumula`
// (real ingested data, e.g. the CBF's 405 matches live since Session 50). Standard
// football table rules: 3 points win, 1 draw, 0 loss; tie-break by points → goal
// difference → goals scored → name (deterministic, never arbitrary DB order).

export interface MatchResult {
  homeClubId: string;
  awayClubId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ClubRef {
  id: string;
  name: string;
  crestUrl: string | null;
}

export interface StandingRow {
  club: ClubRef;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Only finished matches (both scores present) count — a scheduled/future match
 * (homeScore/awayScore null) is silently excluded, not treated as 0x0. */
export function computeStandings(matches: MatchResult[], clubs: Map<string, ClubRef>): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  const rowFor = (clubId: string): StandingRow => {
    const existing = rows.get(clubId);
    if (existing) return existing;
    const club = clubs.get(clubId) ?? { id: clubId, name: clubId, crestUrl: null };
    const fresh: StandingRow = { club, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
    rows.set(clubId, fresh);
    return fresh;
  };

  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null) continue; // not finished yet

    const home = rowFor(m.homeClubId);
    const away = rowFor(m.awayClubId);

    home.played++;
    away.played++;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.wins++;
      home.points += 3;
      away.losses++;
    } else if (m.homeScore < m.awayScore) {
      away.wins++;
      away.points += 3;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
      home.points++;
      away.points++;
    }
  }

  for (const row of rows.values()) row.goalDiff = row.goalsFor - row.goalsAgainst;

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.club.name.localeCompare(b.club.name),
  );
}

export interface AppearanceGoals {
  bid: number;
  name: string;
  goals: number;
}

export interface ScorerRow {
  bid: number;
  name: string;
  goals: number;
}

/** Sums goals per athlete across every appearance row given, sorted descending
 * (ties broken by name, deterministic). Callers slice to a top-N if needed. */
export function computeTopScorers(appearances: AppearanceGoals[]): ScorerRow[] {
  const totals = new Map<number, ScorerRow>();
  for (const a of appearances) {
    if (a.goals <= 0) continue;
    const existing = totals.get(a.bid);
    if (existing) existing.goals += a.goals;
    else totals.set(a.bid, { bid: a.bid, name: a.name, goals: a.goals });
  }
  return [...totals.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

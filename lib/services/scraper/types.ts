// FOOTBASE Phase 6 — ingestion contract (format-agnostic).
//
// A parser (6.2/6.3) turns a raw súmula (+ CBF athlete profiles) into a
// `ParsedMatch`, which the orchestrator (`ingest.ts`) upserts idempotently into
// `torneios` / `clubes` / `atletas` / `partidas_sumula` / `atuacoes_sumula`.
// The normalized shape maps 1:1 to the DB columns, so it is stable regardless of
// how each source formats its súmula.

export interface ParsedTournament {
  name: string;
  federation: string; // 'CBF', 'FPF', 'FERJ', ...
  year: number;
  category: string; // must exist in categoria_ordem (e.g. 'SUB-17')
}

export interface ParsedClub {
  sourceKey: string; // stable upsert key, e.g. 'cbf:12345'
  name: string;
  state?: string | null; // UF
  federacao?: string | null;
}

// Athletes are keyed by CBF BID. `birthDate` comes from the CBF athlete profile
// (NOT the súmula) — required because atletas.birth_date is NOT NULL. When an
// athlete is not yet in the DB and no profile birthDate is available, the
// orchestrator records it as a skip (never fabricates data).
export interface ParsedAthlete {
  bid: number;
  name: string;
  birthDate?: string | null; // ISO date from CBF profile
  nacionalidade?: string | null;
  mainPosition?: string | null;
}

export interface ParsedAppearance {
  bid: number;
  playerCategory: string; // categoria_ordem
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number; // 0..2
  redCards: number; // 0..1
  cleanSheet: boolean;
}

export interface ParsedMatch {
  tournament: ParsedTournament;
  matchDate: string; // ISO date
  matchCategory: string; // categoria_ordem
  rodada?: string | null;
  home: ParsedClub;
  away: ParsedClub;
  homeScore?: number | null;
  awayScore?: number | null;
  sourceUrl?: string | null;
  // Athlete bios keyed by BID, used only to seed athletes missing from the DB.
  athletes: ParsedAthlete[];
  appearances: ParsedAppearance[];
  // Own goals ("Contra") count toward the final score but are deliberately NOT
  // credited to any player's personal `goals` tally (football convention — an own
  // goal isn't "their" goal). Reconciliation needs this separately to verify
  // personal-goals-summed + ownGoals === final score, instead of expecting the two
  // to already be equal.
  ownGoals?: number;
}

export interface IngestReport {
  dryRun: boolean;
  scrapingLogId: string | null;
  tournamentResolved: boolean;
  clubsUpserted: number;
  athletesSeeded: number;
  matchUpserted: boolean;
  appearancesUpserted: number;
  skippedAppearances: number; // e.g. athlete missing and no profile birthDate
  errors: string[];
}

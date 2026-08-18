import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestReport } from "./types.ts";
import { fetchSumulaText } from "./extract-pdf-text.ts";
import { parseCbfSumula, type ParseCbfOptions } from "./parse-cbf-sumula.ts";
import { reconcileParsedMatch } from "./reconciliation.ts";
import { ingestMatch } from "./ingest.ts";

// FOOTBASE Phase 6.5 — mandatory dry-run runner for a single CBF súmula.
//
// Composes the whole read path — fetch the static PDF → extract text → parse
// (metadata + roster + events) → reconcile → plan the ingest — WITHOUT writing
// anything (`dryRun: true`). This is the artifact the operator reviews before live
// ingestion is enabled: it shows exactly what WOULD be written and any reconciliation
// warning. The PDF bytes are never persisted (only `sourceUrl` is kept downstream).

export interface SumulaDryRunResult {
  sourceUrl: string;
  match: {
    tournament: string;
    date: string;
    category: string;
    rodada: string | null;
    home: string;
    away: string;
    score: string;
    athletes: number;
    appearances: number;
  };
  reconciliation: string[]; // empty = clean; non-empty would block a live write
  ingest: IngestReport; // dry-run plan (counts of what would be written)
}

/** Fetch + parse + reconcile + plan a súmula by URL. Never writes (dryRun). */
export async function runCbfSumulaDryRun(
  admin: SupabaseClient,
  sourceUrl: string,
  opts: ParseCbfOptions = {},
): Promise<SumulaDryRunResult> {
  const text = await fetchSumulaText(sourceUrl);
  const { match } = parseCbfSumula(text, { ...opts, sourceUrl });
  const reconciliation = reconcileParsedMatch(match);
  const ingest = await ingestMatch(admin, match, { dryRun: true });

  return {
    sourceUrl,
    match: {
      tournament: `${match.tournament.name} (${match.tournament.federation} ${match.tournament.year})`,
      date: match.matchDate,
      category: match.matchCategory,
      rodada: match.rodada ?? null,
      home: match.home.name,
      away: match.away.name,
      score: `${match.homeScore ?? "?"}-${match.awayScore ?? "?"}`,
      athletes: match.athletes.length,
      appearances: match.appearances.length,
    },
    reconciliation,
    ingest,
  };
}

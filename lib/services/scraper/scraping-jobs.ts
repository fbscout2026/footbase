// FOOTBASE Phase 6.x — scraping_jobs bookkeeping (Session 45).
//
// Every item the executor attempts (one súmula = one job) gets recorded here,
// keyed by the table's own `unique(source, job_type, ref)` constraint — so calling
// this again for the same item (a later run retrying a failure) updates the SAME
// row instead of piling up duplicates. This is pure operational bookkeeping (which
// items succeeded/failed and how many times), not football data, so it's written
// regardless of dry-run/live: `ingestMatch`'s own `scraping_logs` writes stay
// live-only (that's the "did we actually write match data" log), this is the
// "did we successfully process this item at all" queue CLAUDE.md's ingestion design
// calls for (`scraping_jobs (pending/done/failed+tentativas): pula e retenta no
// próximo run`).
//
// Never throws: a bookkeeping failure (e.g. a transient Supabase hiccup) must never
// be mistaken for the actual scrape/parse/reconcile outcome it's recording, so
// errors here are logged and swallowed, not propagated to the caller.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ScrapingJobStatus = "pending" | "done" | "failed";

export interface ScrapingJobKey {
  source: string; // 'CBF' | 'FPF' | ...
  jobType: string; // 'sumula' | 'registry' | 'profile'
  ref: string; // stable identifier for the item (e.g. idJogoGrande, idJogo)
}

export interface ScrapingJobOutcome {
  status: ScrapingJobStatus;
  error?: string | null; // required context when status is "failed"
  payload?: Record<string, unknown> | null; // optional context (url, rodada, ...)
}

/**
 * Upserts one job row reflecting the latest attempt's outcome. `attempts` only
 * increments on a "failed" outcome (it counts failures, not total tries) and is
 * never reset back down on a later success — it stays as a record of how many times
 * this item needed retrying before it went through.
 */
export async function recordScrapingJob(admin: SupabaseClient, key: ScrapingJobKey, outcome: ScrapingJobOutcome): Promise<void> {
  try {
    const existing = await admin
      .from("scraping_jobs")
      .select("attempts")
      .eq("source", key.source)
      .eq("job_type", key.jobType)
      .eq("ref", key.ref)
      .maybeSingle();

    const priorAttempts = (existing.data as { attempts: number } | null)?.attempts ?? 0;
    const attempts = outcome.status === "failed" ? priorAttempts + 1 : priorAttempts;

    const { error } = await admin.from("scraping_jobs").upsert(
      {
        source: key.source,
        job_type: key.jobType,
        ref: key.ref,
        status: outcome.status,
        attempts,
        last_error: outcome.status === "failed" ? (outcome.error ?? "unknown error").slice(0, 2000) : null,
        payload: outcome.payload ?? null,
      },
      { onConflict: "source,job_type,ref" },
    );
    if (error) throw error;
  } catch (e) {
    console.error(`[scraping_jobs] failed to record ${key.source}/${key.jobType}/${key.ref}:`, e instanceof Error ? e.message : e);
  }
}

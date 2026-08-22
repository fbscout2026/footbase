// FOOTBASE Session 55 — provisional (non-CBF) athlete identity, shared across every
// source that doesn't carry a real CBF bid (FERJ's BIRA, FPF's Registro, and any
// future federation with its own numbering).
//
// Mirrors the club-merge precedent already established as a permanent rule
// (CLAUDE.md "Fusão de clubes entre fontes", Session 55): ingestion never blocks
// waiting for a perfect identity match. Every source creates its own record
// automatically; a SEPARATE scan+merge pass (scan-athlete-duplicates.ts +
// merge-atleta.ts) reconciles true duplicates later, with a human confirming each
// merge. Applying that same shape to athletes: `resolveAthleteIdentity`'s
// 'ambiguous'/'new' outcomes no longer sit in a review queue nobody processes —
// they get a provisional fb_id immediately.
//
// Provisional fb_ids live in a clearly separate range. Confirmed live against
// production (Session 55): real CBF bids are 6 digits (100000-999999); some early
// seed/mock data used 7-digit ids up to ~2.6M; nothing has ever used 9+ digits.
// `fb_id >= PROVISIONAL_BID_FLOOR` is therefore an unambiguous "this identity isn't
// CBF-confirmed yet" flag, usable directly in queries (UI badges, the dup scan,
// future merge-into-a-real-bid tooling) without a separate boolean column.
//
// Session 56 ("FB-ID: chave suprema" — see the plan file for the full design):
// `atletas.bid` was renamed to `fb_id` at the schema level, and every source's own
// number (including CBF's) is meant to become just another `atleta_fontes` row
// instead of a special case. This module's exported names (`PROVISIONAL_BID_FLOOR`,
// `isProvisionalBid`, `nextProvisionalBid`, `seedProvisionalAthlete`) are left
// unchanged for now — renaming them ripples into every call site (run-live-
// ingestion.ts, scan-athlete-duplicates.ts, merge-atleta-core.ts), which belongs to
// the ingest.ts generalization step (adapting every adapter to resolve via
// atleta_fontes first) so that ripple only happens once, not twice. Only the raw
// column references below were updated, since the DB migration requires it.

import type { SupabaseClient } from "@supabase/supabase-js";

export const PROVISIONAL_BID_FLOOR = 900_000_000;

export function isProvisionalBid(fbId: number): boolean {
  return fbId >= PROVISIONAL_BID_FLOOR;
}

/** Next free provisional fb_id. Callers run sequentially (rate-limited ingestion, one
 * process at a time) — no locking needed; a collision would fail loudly on the `fb_id`
 * primary key constraint rather than silently corrupt anything. */
export async function nextProvisionalBid(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("atletas")
    .select("fb_id")
    .gte("fb_id", PROVISIONAL_BID_FLOOR)
    .order("fb_id", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = (data?.[0]?.fb_id as number | undefined) ?? PROVISIONAL_BID_FLOOR - 1;
  return max + 1;
}

/**
 * Creates a brand-new provisional `atletas` row + its `atleta_fontes` mapping, for a
 * candidate that resolved 'ambiguous' or 'new' (no confirmed CBF identity). Never
 * called for 'bid'/'mapped'/'matched' — those already have a real, confirmed fb_id to
 * reuse (see the callers in backfill-ferj-athletes.ts / run-live-ingestion.ts).
 */
export async function seedProvisionalAthlete(
  admin: SupabaseClient,
  fbId: number,
  candidate: { fonte: string; externalId: string; name: string; birthDate?: string | null },
): Promise<void> {
  const insA = await admin.from("atletas").insert({ fb_id: fbId, name: candidate.name, birth_date: candidate.birthDate ?? null });
  if (insA.error) throw insA.error;
  const insM = await admin.from("atleta_fontes").insert({ fonte: candidate.fonte, id_externo: candidate.externalId, fb_id: fbId });
  if (insM.error) throw insM.error;
}

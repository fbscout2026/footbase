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
// they get a provisional bid immediately.
//
// Provisional bids live in a clearly separate range. Confirmed live against
// production (Session 55): real CBF bids are 6 digits (100000-999999); some early
// seed/mock data used 7-digit ids up to ~2.6M; nothing has ever used 9+ digits.
// `bid >= PROVISIONAL_BID_FLOOR` is therefore an unambiguous "this identity isn't
// CBF-confirmed yet" flag, usable directly in queries (UI badges, the dup scan,
// future merge-into-a-real-bid tooling) without a separate boolean column.

import type { SupabaseClient } from "@supabase/supabase-js";

export const PROVISIONAL_BID_FLOOR = 900_000_000;

export function isProvisionalBid(bid: number): boolean {
  return bid >= PROVISIONAL_BID_FLOOR;
}

/** Next free provisional bid. Callers run sequentially (rate-limited ingestion, one
 * process at a time) — no locking needed; a collision would fail loudly on the `bid`
 * primary key constraint rather than silently corrupt anything. */
export async function nextProvisionalBid(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("atletas")
    .select("bid")
    .gte("bid", PROVISIONAL_BID_FLOOR)
    .order("bid", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = (data?.[0]?.bid as number | undefined) ?? PROVISIONAL_BID_FLOOR - 1;
  return max + 1;
}

/**
 * Creates a brand-new provisional `atletas` row + its `atleta_fontes` mapping, for a
 * candidate that resolved 'ambiguous' or 'new' (no confirmed CBF identity). Never
 * called for 'bid'/'mapped'/'matched' — those already have a real, confirmed bid to
 * reuse (see the callers in backfill-ferj-athletes.ts / run-live-ingestion.ts).
 */
export async function seedProvisionalAthlete(
  admin: SupabaseClient,
  bid: number,
  candidate: { fonte: string; externalId: string; name: string; birthDate?: string | null },
): Promise<void> {
  const insA = await admin.from("atletas").insert({ bid, name: candidate.name, birth_date: candidate.birthDate ?? null });
  if (insA.error) throw insA.error;
  const insM = await admin.from("atleta_fontes").insert({ fonte: candidate.fonte, id_externo: candidate.externalId, bid });
  if (insM.error) throw insM.error;
}

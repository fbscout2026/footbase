import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateCandidateStatus = "pending" | "merged" | "dismissed";
export type DuplicateCandidateTier = "forte" | "clube+nome";

export interface DuplicateCandidateAthlete {
  fbId: number;
  name: string;
  birthDate: string | null;
  currentCategory: string | null;
  currentClubName: string | null;
  totalMatches: number;
}

export interface AdminDuplicateCandidate {
  id: string;
  tier: DuplicateCandidateTier;
  status: DuplicateCandidateStatus;
  detectedAt: string;
  a: DuplicateCandidateAthlete;
  b: DuplicateCandidateAthlete;
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

function mapAthlete(a: {
  fb_id: number;
  name: string;
  birth_date: string | null;
  current_category: string | null;
  total_matches: number;
  clubes: unknown;
}): DuplicateCandidateAthlete {
  return {
    fbId: a.fb_id,
    name: a.name,
    birthDate: a.birth_date,
    currentCategory: a.current_category,
    currentClubName: one<{ name?: string }>(a.clubes as never)?.name ?? null,
    totalMatches: a.total_matches,
  };
}

/** Admin reads pending duplicate candidates found by scan-athlete-duplicates.ts
 * --write. Never club/agent-visible — RLS restricts this table to admins only. */
export async function loadDuplicateCandidates(client: SupabaseClient): Promise<AdminDuplicateCandidate[]> {
  const { data, error } = await client
    .from("atleta_duplicate_candidates")
    .select("id, fb_id_a, fb_id_b, tier, status, detected_at")
    .eq("status", "pending")
    .order("detected_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const bids = [...new Set(data.flatMap((r) => [r.fb_id_a, r.fb_id_b]))];
  const { data: athletes, error: athErr } = await client
    .from("atletas")
    .select("fb_id, name, birth_date, current_category, total_matches, clubes:current_club_id(name)")
    .in("fb_id", bids);
  if (athErr) throw athErr;
  const byBid = new Map((athletes ?? []).map((a) => [a.fb_id as number, mapAthlete(a as never)]));

  return data
    .map((r) => {
      const a = byBid.get(r.fb_id_a as number);
      const b = byBid.get(r.fb_id_b as number);
      if (!a || !b) return null; // one side got deleted/merged elsewhere since detection
      return {
        id: r.id as string,
        tier: r.tier as DuplicateCandidateTier,
        status: r.status as DuplicateCandidateStatus,
        detectedAt: r.detected_at as string,
        a,
        b,
      } satisfies AdminDuplicateCandidate;
    })
    .filter((c): c is AdminDuplicateCandidate => c !== null);
}

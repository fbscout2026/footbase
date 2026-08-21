import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "agent" | "club" | "admin";
export type AccountStatus = "pending" | "approved" | "rejected";

export interface SessionProfile {
  userId: string;
  email: string | null;
  role: Role;
  accountStatus: AccountStatus;
  fullName: string | null;
}

/**
 * Server-side: returns the current user's profile, or null if not signed in.
 * RLS lets a user read their own `profiles` row.
 *
 * Session 55: uses `getSession()` (decodes the JWT already sitting in cookies,
 * no network call) instead of `getUser()` (always revalidates against Supabase's
 * auth server over the network) — safe here specifically because `middleware.ts`
 * already called the network-validated `getUser()` for this exact request before
 * it ever reached this layout (its matcher covers every route this runs under).
 * Removing this redundant round-trip cut real, measured latency off every single
 * navigation. The `profiles` query right below is still the real authorization
 * gate either way — RLS checks `auth.uid()` against the row, so a tampered/stale
 * token simply returns no profile rather than silently trusting a fake identity.
 *
 * Wrapped in React's `cache()`: `app/(app)/layout.tsx` AND most page.tsx files
 * under it each call this once per request — without dedup that ran the same
 * `profiles` query against Supabase TWICE on every single navigation. `cache()`
 * makes every call within the same request reuse the first call's result instead
 * of re-querying (React's built-in per-request memoization, the same mechanism
 * Next.js's own docs recommend for exactly this "layout + page both need the
 * session" shape) — same return value, purely fewer round-trips.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, account_status, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role as Role,
    accountStatus: profile.account_status as AccountStatus,
    fullName: profile.full_name,
  };
});

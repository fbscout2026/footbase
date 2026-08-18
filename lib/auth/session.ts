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
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
}

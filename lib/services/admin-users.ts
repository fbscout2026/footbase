import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole = "agent" | "club" | "admin";
export type UserStatus = "pending" | "approved" | "rejected";

export interface AdminUser {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: UserRole;
  accountStatus: UserStatus;
  organization: string | null;
  whatsapp: string | null;
  createdAt: string;
}

// Admin-only reads (RLS: profiles_select_own allows `id = auth.uid() OR is_admin()`).
export async function loadUsers(client: SupabaseClient): Promise<AdminUser[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, role, account_status, full_name, organization, whatsapp, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: String(r.id),
    fullName: r.full_name as string | null,
    email: null,
    role: r.role as UserRole,
    accountStatus: r.account_status as UserStatus,
    organization: r.organization as string | null,
    whatsapp: r.whatsapp as string | null,
    createdAt: r.created_at as string,
  }));
}

// Emails live in auth.users, not in profiles — only the service_role admin client
// can read them. Call from a SERVER context (never a Client Component). Returns a
// { userId: email } map so the admin can contact each account for approval.
export async function loadUserEmails(admin: SupabaseClient): Promise<Record<string, string>> {
  const emails: Record<string, string> = {};
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) emails[u.id] = u.email;
    if (data.users.length < 200) break;
  }
  return emails;
}

// Approve/reject. RLS profiles_update_own + guard_profile_update allow an admin to
// change account_status on any account. Never used to grant/revoke `role` here.
export async function setAccountStatus(client: SupabaseClient, userId: string, status: UserStatus): Promise<void> {
  const { error } = await client.from("profiles").update({ account_status: status }).eq("id", userId);
  if (error) throw error;
}

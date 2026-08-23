import type { SupabaseClient } from "@supabase/supabase-js";

// Request side never reveals whether the e-mail exists (Supabase Auth's behavior is
// already generic here) and never touches password_reset_used — only a *completed*
// reset burns the account's single use, per the product decision below.
export async function requestPasswordReset(
  client: SupabaseClient,
  email: string,
  redirectTo: string
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Called once the recovery-link session is active (the user landed on the completion
// page via the e-mail link). Reads the account's one-time flag; a plain self-select,
// no RPC needed, RLS already lets a user read their own profile row.
export async function isPasswordResetAvailable(client: SupabaseClient): Promise<boolean> {
  const { data: userRes } = await client.auth.getUser();
  if (!userRes.user) throw new Error("no-recovery-session");
  const { data, error } = await client
    .from("profiles")
    .select("password_reset_used")
    .eq("id", userRes.user.id)
    .single();
  if (error) throw error;
  return data.password_reset_used !== true;
}

// Sets the new password, then claims the one-time flag. Order matters: if updateUser
// fails (weak password, expired recovery link, etc.), the flag is never touched — only
// a password change that actually succeeds consumes the account's single use.
//
// Also claims this device's session slot (Session 57 — single active device): a
// recovery-link session never goes through LoginForm, so without this the very next
// request after a successful reset would get bounced by middleware.ts's device check
// (the DB still has the OLD device's active_session_id, and this device never got a
// fb_session_id cookie) — right after the user just proved account ownership by e-mail.
export async function completePasswordReset(client: SupabaseClient, newPassword: string): Promise<void> {
  const { data: userRes, error: userError } = await client.auth.getUser();
  if (userError || !userRes.user) throw new Error("no-recovery-session");

  const { error: updateError } = await client.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;

  const deviceSessionId = crypto.randomUUID();
  const { error: claimError } = await client
    .from("profiles")
    .update({ password_reset_used: true, active_session_id: deviceSessionId })
    .eq("id", userRes.user.id);
  if (claimError) throw claimError;

  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `fb_session_id=${deviceSessionId}; path=/; max-age=31536000; samesite=lax${secure}`;
}

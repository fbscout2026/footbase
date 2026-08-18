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
export async function completePasswordReset(client: SupabaseClient, newPassword: string): Promise<void> {
  const { data: userRes, error: userError } = await client.auth.getUser();
  if (userError || !userRes.user) throw new Error("no-recovery-session");

  const { error: updateError } = await client.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;

  const { error: claimError } = await client
    .from("profiles")
    .update({ password_reset_used: true })
    .eq("id", userRes.user.id);
  if (claimError) throw claimError;
}

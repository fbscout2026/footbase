import type { SupabaseClient } from "@supabase/supabase-js";

export interface PromotionRecord {
  id: string;
  userId: string;
  justificativa: string;
  promovidoPor: string;
  createdAt: string;
  // Filled server-side (page.tsx) from the already-loaded user list.
  userName: string | null;
  promovidoPorName: string | null;
}

// The only sanctioned way to grant admin: admin_promover_para_admin (SECURITY
// DEFINER) validates the target is approved + not already admin, blocks
// self-promotion, and records an immutable history row atomically with the
// profiles.role update. There is deliberately no "demote" counterpart here —
// removing an admin stays a manual, direct-Supabase operation.
export async function promoteToAdmin(client: SupabaseClient, userId: string, justificativa: string): Promise<void> {
  const { error } = await client.rpc("admin_promover_para_admin", { p_user_id: userId, p_justificativa: justificativa });
  if (error) throw error;
}

export async function loadPromotionHistory(client: SupabaseClient): Promise<PromotionRecord[]> {
  const { data, error } = await client
    .from("admin_promocoes")
    .select("id, user_id, justificativa, promovido_por, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    justificativa: r.justificativa as string,
    promovidoPor: String(r.promovido_por),
    createdAt: r.created_at as string,
    userName: null,
    promovidoPorName: null,
  }));
}

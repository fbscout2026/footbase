import type { SupabaseClient } from "@supabase/supabase-js";

export interface FavoriteRecord {
  id: string;
  userId: string;
  fbId: number;
  rating: number;
  notes: string | null;
}

interface FavoriteRow {
  id: string;
  user_id: string;
  fb_id_atleta: number;
  nota: number | null;
  notas: string | null;
}

function fromRow(row: FavoriteRow): FavoriteRecord {
  return {
    id: row.id,
    userId: row.user_id,
    fbId: Number(row.fb_id_atleta),
    rating: row.nota ?? 50,
    notes: row.notas,
  };
}

// `favoritos_owner_select` (RLS) intentionally also lets admins read every row, for
// oversight elsewhere in the app — but "my favorites" must always mean the caller's
// own rows. Filtering by user_id explicitly (rather than relying on RLS scoping) keeps
// this query correct for admin accounts too, instead of silently returning everyone's
// favorites merged together as if they belonged to the admin.
export async function listFavorites(client: SupabaseClient, userId: string): Promise<FavoriteRecord[]> {
  const { data, error } = await client
    .from("favoritos")
    .select("id,user_id,fb_id_atleta,nota,notas")
    .eq("user_id", userId)
    .order("nota", { ascending: false });
  if (error) throw error;
  return (data as FavoriteRow[]).map(fromRow);
}

export async function upsertFavorite(
  client: SupabaseClient,
  input: { userId: string; fbId: number; rating: number; notes: string | null }
): Promise<FavoriteRecord> {
  const rating = Math.max(0, Math.min(100, Math.round(input.rating)));
  const notes = input.notes?.trim() || null;
  const { data, error } = await client
    .from("favoritos")
    .upsert(
      { user_id: input.userId, fb_id_atleta: input.fbId, nota: rating, notas: notes },
      { onConflict: "user_id,fb_id_atleta" }
    )
    .select("id,user_id,fb_id_atleta,nota,notas")
    .single();
  if (error) throw error;
  return fromRow(data as FavoriteRow);
}

export async function removeFavorite(client: SupabaseClient, fbId: number): Promise<void> {
  const { error } = await client.rpc("remove_favorite_and_slot", { p_fb_id: fbId });
  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ClubFavoriteRecord {
  id: string;
  userId: string;
  clubId: string;
}

interface ClubFavoriteRow {
  id: string;
  user_id: string;
  club_id: string;
}

function fromRow(row: ClubFavoriteRow): ClubFavoriteRecord {
  return { id: row.id, userId: row.user_id, clubId: row.club_id };
}

export async function listClubFavorites(client: SupabaseClient, userId: string): Promise<ClubFavoriteRecord[]> {
  const { data, error } = await client
    .from("favoritos_clube")
    .select("id,user_id,club_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data as ClubFavoriteRow[]).map(fromRow);
}

export async function addClubFavorite(client: SupabaseClient, userId: string, clubId: string): Promise<ClubFavoriteRecord> {
  const { data, error } = await client
    .from("favoritos_clube")
    .insert({ user_id: userId, club_id: clubId })
    .select("id,user_id,club_id")
    .single();
  if (error) throw error;
  return fromRow(data as ClubFavoriteRow);
}

export async function removeClubFavorite(client: SupabaseClient, userId: string, clubId: string): Promise<void> {
  const { error } = await client.from("favoritos_clube").delete().eq("user_id", userId).eq("club_id", clubId);
  if (error) throw error;
}

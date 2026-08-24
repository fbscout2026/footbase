import type { SupabaseClient } from "@supabase/supabase-js";

export interface TournamentFavoriteRecord {
  id: string;
  userId: string;
  torneioId: string;
}

interface TournamentFavoriteRow {
  id: string;
  user_id: string;
  torneio_id: string;
}

function fromRow(row: TournamentFavoriteRow): TournamentFavoriteRecord {
  return { id: row.id, userId: row.user_id, torneioId: row.torneio_id };
}

export async function listTournamentFavorites(client: SupabaseClient, userId: string): Promise<TournamentFavoriteRecord[]> {
  const { data, error } = await client
    .from("favoritos_torneio")
    .select("id,user_id,torneio_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data as TournamentFavoriteRow[]).map(fromRow);
}

export async function addTournamentFavorite(client: SupabaseClient, userId: string, torneioId: string): Promise<TournamentFavoriteRecord> {
  const { data, error } = await client
    .from("favoritos_torneio")
    .insert({ user_id: userId, torneio_id: torneioId })
    .select("id,user_id,torneio_id")
    .single();
  if (error) throw error;
  return fromRow(data as TournamentFavoriteRow);
}

export async function removeTournamentFavorite(client: SupabaseClient, userId: string, torneioId: string): Promise<void> {
  const { error } = await client.from("favoritos_torneio").delete().eq("user_id", userId).eq("torneio_id", torneioId);
  if (error) throw error;
}

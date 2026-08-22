import type { SupabaseClient } from "@supabase/supabase-js";
import type { Formation, TacticalPosition } from "@/lib/prancheta-formations";

export interface TacticalBoardRecord {
  id: string;
  userId: string;
  name: string;
  formation: Formation;
  lineupInitialized: boolean;
}

export interface TacticalBoardSlotRecord {
  fbId: number;
  position: TacticalPosition;
  order: number;
}

interface BoardRow {
  id: string;
  user_id: string;
  name: string;
  formation: Formation;
  lineup_initialized: boolean;
}

interface SlotRow {
  fb_id_atleta: number;
  position_code: TacticalPosition;
  slot_order: number;
}

function boardFromRow(row: BoardRow): TacticalBoardRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    formation: row.formation,
    lineupInitialized: row.lineup_initialized,
  };
}

export async function getOrCreateBoard(
  client: SupabaseClient,
  userId: string
): Promise<TacticalBoardRecord> {
  const { data: existing, error: selectError } = await client
    .from("prancheta_tatica")
    .select("id,user_id,name,formation,lineup_initialized")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return boardFromRow(existing as BoardRow);

  const { data, error } = await client
    .from("prancheta_tatica")
    .upsert(
      { user_id: userId, name: "Minha Prancheta", formation: "4-3-3" },
      { onConflict: "user_id" }
    )
    .select("id,user_id,name,formation,lineup_initialized")
    .single();
  if (error) throw error;
  return boardFromRow(data as BoardRow);
}

export async function updateBoardName(
  client: SupabaseClient,
  boardId: string,
  name: string
): Promise<string> {
  const normalized = name.trim().slice(0, 80) || "Minha Prancheta";
  const { data, error } = await client
    .from("prancheta_tatica")
    .update({ name: normalized })
    .eq("id", boardId)
    .select("name")
    .single();
  if (error) throw error;
  return String(data.name);
}

export async function listBoardSlots(
  client: SupabaseClient,
  boardId: string
): Promise<TacticalBoardSlotRecord[]> {
  const { data, error } = await client
    .from("prancheta_slots")
    .select("fb_id_atleta,position_code,slot_order")
    .eq("prancheta_id", boardId)
    .eq("slot_type", "starter")
    .order("slot_order");
  if (error) throw error;
  return (data as SlotRow[]).map((row) => ({
    fbId: Number(row.fb_id_atleta), position: row.position_code, order: row.slot_order,
  }));
}

export async function replaceBoardSlots(
  client: SupabaseClient,
  boardId: string,
  formation: Formation,
  slots: TacticalBoardSlotRecord[]
): Promise<void> {
  const { error } = await client.rpc("replace_prancheta_slots", {
    p_board_id: boardId,
    p_formation: formation,
    p_slots: slots.map((slot) => ({
      fb_id_atleta: slot.fbId,
      position_code: slot.position,
      slot_order: slot.order,
    })),
  });
  if (error) throw error;
}

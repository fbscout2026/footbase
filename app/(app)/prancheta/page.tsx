import { redirect } from "next/navigation";
import { TacticalBoardClient } from "@/components/prancheta/TacticalBoardClient";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateBoard, listBoardSlots } from "@/lib/services/tactical-board";

export default async function PranchetaPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const supabase = await createClient();

  const board = await getOrCreateBoard(supabase, session.userId);
  const slots = await listBoardSlots(supabase, board.id);
  return <TacticalBoardClient board={board} initialSlots={slots} />;
}

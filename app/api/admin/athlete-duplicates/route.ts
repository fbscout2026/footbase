import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeAtleta } from "@/lib/services/scraper/merge-atleta-core";

export const runtime = "nodejs";

// Admin-only. Resolves one `atleta_duplicate_candidates` row: "merge" actually
// fuses the two athletes (via the SAME logic merge-atleta.ts's CLI uses — never a
// separate reimplementation), "dismiss" just marks it not-a-duplicate. Both require
// an explicit `candidateId` + which bid the admin picked as the winner — this route
// never guesses which profile to keep.
export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId : null;
  const action = body?.action;
  if (!candidateId || (action !== "merge" && action !== "dismiss")) {
    return NextResponse.json({ error: "candidateId and action ('merge'|'dismiss') are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: candidate, error: candErr } = await admin
    .from("atleta_duplicate_candidates")
    .select("id, bid_a, bid_b, status")
    .eq("id", candidateId)
    .single();
  if (candErr || !candidate) return NextResponse.json({ error: "candidate-not-found" }, { status: 404 });
  if (candidate.status !== "pending") return NextResponse.json({ error: "already-resolved" }, { status: 409 });

  if (action === "dismiss") {
    const { error } = await admin
      .from("atleta_duplicate_candidates")
      .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: session.userId })
      .eq("id", candidateId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ outcome: "dismissed" });
  }

  // action === "merge"
  const winnerBid = Number(body?.winnerBid);
  const loserBid = winnerBid === candidate.bid_a ? candidate.bid_b : candidate.bid_a;
  if (winnerBid !== candidate.bid_a && winnerBid !== candidate.bid_b) {
    return NextResponse.json({ error: "winnerBid must be one of the candidate's two bids" }, { status: 400 });
  }

  const result = await mergeAtleta(admin, loserBid, winnerBid, true);
  if (result.outcome === "merged") {
    await admin
      .from("atleta_duplicate_candidates")
      .update({ status: "merged", resolved_at: new Date().toISOString(), resolved_by: session.userId })
      .eq("id", candidateId);
  }
  return NextResponse.json(result);
}

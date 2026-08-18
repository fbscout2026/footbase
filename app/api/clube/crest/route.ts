import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Read-only crest delivery. Crests are captured automatically from official
// sources by the ingestion service (or set by admin curation) and stored in the
// private `club-crests` bucket. Clubs cannot upload — they may only SUGGEST a
// different version via an institutional correction (field "crest"). There is
// intentionally no POST handler here.
export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || session.accountStatus !== "approved") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clubId = request.nextUrl.searchParams.get("club");
  if (!clubId) return NextResponse.json({ error: "club-required" }, { status: 400 });

  const client = await createClient();
  const { data: club } = await client.from("clubes").select("crest_storage_path").eq("id", clubId).maybeSingle();
  if (!club?.crest_storage_path) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("club-crests").download(club.crest_storage_path);
  if (error || !data) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return new NextResponse(await data.arrayBuffer(), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" },
  });
}

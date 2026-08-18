import { notFound } from "next/navigation";
import { ClubProfile } from "@/components/clubes/ClubProfile";
import { ClubLoadError } from "@/components/clubes/ClubDirectory";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadClubProfile } from "@/lib/services/clubs";

export default async function ClubProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionProfile();
  if (!session) notFound();
  const { id } = await params;
  try {
    const data = await loadClubProfile(await createClient(), id, session);
    return <ClubProfile key={data.club.id} initialData={data} />;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "PGRST116") notFound();
    return <ClubLoadError profile />;
  }
}

import { ClubDirectory, ClubLoadError } from "@/components/clubes/ClubDirectory";
import { createClient } from "@/lib/supabase/server";
import { listClubs } from "@/lib/services/clubs";

export default async function ClubsPage() {
  const supabase = await createClient();
  try {
    return <ClubDirectory clubs={await listClubs(supabase)} />;
  } catch {
    return <ClubLoadError />;
  }
}

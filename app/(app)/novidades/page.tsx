import { createClient } from "@/lib/supabase/server";
import { loadAnnouncements } from "@/lib/services/admin-announcements";
import { NovidadesList } from "@/components/novidades/NovidadesList";

export default async function NovidadesPage() {
  const supabase = await createClient();
  try {
    return <NovidadesList announcements={await loadAnnouncements(supabase)} />;
  } catch {
    return <NovidadesList announcements={null} />;
  }
}

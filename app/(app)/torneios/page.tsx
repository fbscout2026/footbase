import { TorneioDirectory, TorneioLoadError } from "@/components/torneios/TorneioDirectory";
import { createClient } from "@/lib/supabase/server";
import { loadTorneioExplorer } from "@/lib/services/torneios";

export default async function TorneiosPage() {
  const supabase = await createClient();
  try {
    return <TorneioDirectory data={await loadTorneioExplorer(supabase)} />;
  } catch {
    return <TorneioLoadError />;
  }
}

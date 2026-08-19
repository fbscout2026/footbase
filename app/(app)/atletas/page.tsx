import { AtletasExplorer, AtletasLoadError } from "@/components/atletas/AtletasExplorer";
import { createClient } from "@/lib/supabase/server";
import { loadAtletasExplorer } from "@/lib/services/atletas";

export default async function AtletasPage() {
  const supabase = await createClient();
  try {
    const { atletas, totalCount } = await loadAtletasExplorer(supabase);
    return <AtletasExplorer initialAtletas={atletas} totalCount={totalCount} />;
  } catch {
    return <AtletasLoadError />;
  }
}

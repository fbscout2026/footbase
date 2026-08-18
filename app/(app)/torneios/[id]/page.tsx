import { notFound } from "next/navigation";
import { TorneioDetail } from "@/components/torneios/TorneioDetail";
import { TorneioLoadError } from "@/components/torneios/TorneioDirectory";
import { createClient } from "@/lib/supabase/server";
import { loadTorneioDetail } from "@/lib/services/torneios";

export default async function TorneioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await loadTorneioDetail(await createClient(), id);
    return <TorneioDetail data={data} />;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "PGRST116") notFound();
    return <TorneioLoadError />;
  }
}

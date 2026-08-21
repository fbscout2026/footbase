import { notFound } from "next/navigation";
import { AtletaDossie } from "@/components/atletas/dossie/AtletaDossie";
import { AtletaDossieLoadError } from "@/components/atletas/AtletasExplorer";
import { createClient } from "@/lib/supabase/server";
import { loadAtletaDossie, loadConquistas, loadAgenteContact, loadEvolucaoReal, loadCategoriaAcimaMatches, loadCardEvents } from "@/lib/services/atletas";

export default async function DossiePage({ params }: { params: Promise<{ bid: string }> }) {
  const { bid } = await params;
  const bidNum = Number(bid);
  if (!Number.isInteger(bidNum)) notFound();

  const supabase = await createClient();
  let atleta;
  try {
    atleta = await loadAtletaDossie(supabase, bidNum);
  } catch {
    return <AtletaDossieLoadError />;
  }
  if (!atleta) notFound();

  const [conquistas, evolucao, agent, categoriaAcimaMatches, cardEvents] = await Promise.all([
    loadConquistas(supabase, bidNum),
    loadEvolucaoReal(supabase, bidNum),
    atleta.agentId ? loadAgenteContact(supabase, atleta.agentId) : Promise.resolve(null),
    loadCategoriaAcimaMatches(supabase, bidNum, atleta.currentCategory),
    loadCardEvents(supabase, bidNum),
  ]);
  return (
    <AtletaDossie
      atleta={atleta}
      conquistas={conquistas}
      agent={agent}
      evolucao={evolucao}
      categoriaAcimaMatches={categoriaAcimaMatches}
      cardEvents={cardEvents}
    />
  );
}

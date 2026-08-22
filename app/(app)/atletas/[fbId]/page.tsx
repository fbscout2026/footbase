import { notFound } from "next/navigation";
import { AtletaDossie } from "@/components/atletas/dossie/AtletaDossie";
import { AtletaDossieLoadError } from "@/components/atletas/AtletasExplorer";
import { createClient } from "@/lib/supabase/server";
import { loadAtletaDossie, loadConquistas, loadAgenteContact, loadEvolucaoReal, loadCategoriaAcimaMatches, loadCardEvents, loadMatchHistory } from "@/lib/services/atletas";

export default async function DossiePage({ params }: { params: Promise<{ fbId: string }> }) {
  const { fbId } = await params;
  const fbIdNum = Number(fbId);
  if (!Number.isInteger(fbIdNum)) notFound();

  const supabase = await createClient();
  let atleta;
  try {
    atleta = await loadAtletaDossie(supabase, fbIdNum);
  } catch {
    return <AtletaDossieLoadError />;
  }
  if (!atleta) notFound();

  const [conquistas, evolucao, agent, categoriaAcimaMatches, cardEvents, matchHistory] = await Promise.all([
    loadConquistas(supabase, fbIdNum),
    loadEvolucaoReal(supabase, fbIdNum),
    atleta.agentId ? loadAgenteContact(supabase, atleta.agentId) : Promise.resolve(null),
    loadCategoriaAcimaMatches(supabase, fbIdNum, atleta.currentCategory),
    loadCardEvents(supabase, fbIdNum),
    loadMatchHistory(supabase, fbIdNum),
  ]);
  return (
    <AtletaDossie
      atleta={atleta}
      conquistas={conquistas}
      agent={agent}
      evolucao={evolucao}
      categoriaAcimaMatches={categoriaAcimaMatches}
      cardEvents={cardEvents}
      matchHistory={matchHistory}
    />
  );
}

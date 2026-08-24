import { HeroBanner } from "@/components/dashboard/HeroBanner";
import { TorneiosDestaque } from "@/components/dashboard/TorneiosDestaque";
import { RadarContratos } from "@/components/dashboard/RadarContratos";
import { GemasCategoriaAcima } from "@/components/dashboard/GemasCategoriaAcima";
import { AlertaInatividade } from "@/components/dashboard/AlertaInatividade";
import { AtalhoPrancheta } from "@/components/dashboard/AtalhoPrancheta";
import { Artilheiros } from "@/components/dashboard/Artilheiros";
import { AgentesLivres } from "@/components/dashboard/AgentesLivres";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session";
import {
  loadHeroStats, loadTorneiosDestaque, loadContratosVencendo, loadGemasCategoriaAcima,
  loadInativos, loadBoardSummary, loadTopScorers, loadAgentesLivres, loadNotificationsSummary,
} from "@/lib/services/dashboard";

// Full-width, Transfermarkt-style dense grid: 3 rails (left / center / right)
// that fill the whole viewport with no empty corners. All data is fetched once
// here, in parallel, and handed down as props — every widget below used to
// read `lib/mock-data.ts` directly (Session 52 migration).
export default async function DashboardPage() {
  const supabase = await createClient();
  const session = await getSessionProfile();

  const [hero, torneios, contratos, gemas, inativos, board, artilheiros, livres, notifications] = await Promise.all([
    loadHeroStats(supabase),
    loadTorneiosDestaque(supabase, 20),
    loadContratosVencendo(supabase, 20),
    loadGemasCategoriaAcima(supabase, 20),
    loadInativos(supabase, 20),
    session ? loadBoardSummary(supabase, session.userId) : Promise.resolve({ exists: false, formation: "4-3-3", starters: 0, bench: 0 }),
    loadTopScorers(supabase, 20),
    loadAgentesLivres(supabase, 20),
    session ? loadNotificationsSummary(supabase, session.userId) : Promise.resolve({ count: 0, contractsExpiring: 0, inactive: 0, newGems: 0, favoritedClubs: 0, favoritedTournaments: 0 }),
  ]);

  return (
    <div className="space-y-4">
      <HeroBanner stats={hero} notifications={notifications} />

      {/* Session 57: Torneios+Artilheiros+Agentes Livres stacked in the left rail
          (fills vertical space instead of leaving the right rail short); every list
          card now requests up to 20 rows and scrolls internally (WidgetCard's
          `scrollable` prop) instead of hard-cutting at 6. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left rail — competitions + scoring/market feeds */}
        <aside className="space-y-4 lg:col-span-3">
          <TorneiosDestaque torneios={torneios} />
          <Artilheiros athletes={artilheiros} />
          <AgentesLivres athletes={livres} />
        </aside>

        {/* Center — main analysis */}
        <div className="space-y-4 lg:col-span-6">
          <AtalhoPrancheta board={board} />
          <RadarContratos athletes={contratos} />
          <GemasCategoriaAcima athletes={gemas} />
        </div>

        {/* Right rail — activity alerts */}
        <aside className="space-y-4 lg:col-span-3">
          <AlertaInatividade athletes={inativos} />
        </aside>
      </div>
    </div>
  );
}

import { HeroBanner } from "@/components/dashboard/HeroBanner";
import { TorneiosDestaque } from "@/components/dashboard/TorneiosDestaque";
import { RadarContratos } from "@/components/dashboard/RadarContratos";
import { GemasCategoriaAcima } from "@/components/dashboard/GemasCategoriaAcima";
import { AlertaInatividade } from "@/components/dashboard/AlertaInatividade";
import { AtalhoPrancheta } from "@/components/dashboard/AtalhoPrancheta";
import { Artilheiros } from "@/components/dashboard/Artilheiros";
import { AgentesLivres } from "@/components/dashboard/AgentesLivres";

// Full-width, Transfermarkt-style dense grid: 3 rails (left / center / right)
// that fill the whole viewport with no empty corners.
export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <HeroBanner />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left rail — competitions */}
        <aside className="space-y-4 lg:col-span-3">
          <TorneiosDestaque />
        </aside>

        {/* Center — main analysis */}
        <div className="space-y-4 lg:col-span-6">
          <AtalhoPrancheta />
          <RadarContratos />
          <GemasCategoriaAcima />
        </div>

        {/* Right rail — feeds */}
        <aside className="space-y-4 lg:col-span-3">
          <AlertaInatividade />
          <Artilheiros />
          <AgentesLivres />
        </aside>
      </div>
    </div>
  );
}

"use client";

import { Star } from "lucide-react";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { Badge } from "@/components/ui/Badge";
import { useT } from "@/lib/i18n/I18nProvider";
import type { AtletaRecord } from "@/lib/services/atletas";
import type { RankingCandidate } from "@/lib/prancheta-ranking";

export function BenchPanel({ candidates, athletes }: { candidates: RankingCandidate[]; athletes: Map<number, AtletaRecord> }) {
  const { t } = useT();
  return (
    <section className="matchday-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-extrabold uppercase italic tracking-wide">{t("board.bench")}</h2>
        <p className="mt-1 text-xs text-muted">{t("board.benchHelp")}</p>
      </div>
      <div className="scroll-brand max-h-[680px] space-y-2 overflow-y-auto p-3">
        {candidates.length === 0 && <p className="py-8 text-center text-sm text-muted">{t("board.emptyBench")}</p>}
        {candidates.map((candidate, index) => {
          const athlete = athletes.get(candidate.bid);
          if (!athlete) return null;
          return (
            <div key={candidate.bid} className="flex items-center gap-3 border border-border bg-background p-3">
              <span className="w-5 text-center text-xs font-bold text-muted">{index + 1}</span>
              <ClubeCrest src={athlete.currentClubCrestUrl} name={athlete.currentClubName ?? "?"} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{athlete.name}</p>
                <p className="text-xs text-muted">{athlete.mainPosition ?? "—"} · {athlete.currentCategory ?? "—"}</p>
              </div>
              <Badge tone="brand"><Star size={10} /> {candidate.favoriteRating}</Badge>
            </div>
          );
        })}
      </div>
    </section>
  );
}

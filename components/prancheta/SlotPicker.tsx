"use client";

import { X } from "lucide-react";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/I18nProvider";
import type { AtletaRecord } from "@/lib/services/atletas";
import type { FormationSlot } from "@/lib/prancheta-formations";
import type { RankedCandidate } from "@/lib/prancheta-ranking";

export function SlotPicker({
  slot,
  candidates,
  athletes,
  hasCurrent,
  onChoose,
  onClear,
  onClose,
}: {
  slot: FormationSlot;
  candidates: RankedCandidate[];
  athletes: Map<number, AtletaRecord>;
  hasCurrent: boolean;
  onChoose: (bid: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-sm border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand">{t("board.chooseAthlete")}</p>
            <h2 className="mt-1 text-lg font-bold">{slot.position}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-hover" aria-label={t("common.cancel")}>
            <X size={18} />
          </button>
        </div>
        <div className="scroll-brand mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {candidates.length === 0 && <p className="py-8 text-center text-sm text-muted">{t("board.noCompatible")}</p>}
          {candidates.map(({ candidate, score, secondary }) => {
            const athlete = athletes.get(candidate.fbId);
            if (!athlete) return null;
            return (
              <button
                key={candidate.fbId}
                type="button"
                onClick={() => onChoose(candidate.fbId)}
                className="flex w-full items-center gap-3 border border-border bg-background p-3 text-left transition-colors hover:border-brand/50 hover:bg-surface-hover"
              >
                <ClubeCrest src={athlete.currentClubCrestUrl} name={athlete.currentClubName ?? "?"} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{athlete.name}</span>
                  <span className="block text-xs text-muted">{athlete.mainPosition ?? "—"}{athlete.posicaoSecundaria ? ` · ${athlete.posicaoSecundaria}` : ""}</span>
                </span>
                {secondary && <Badge tone="warning">{t("board.secondary")}</Badge>}
                <span className="rounded-lg bg-brand/15 px-2 py-1 text-sm font-extrabold text-brand">{Math.round(score)}</span>
              </button>
            );
          })}
        </div>
        {hasCurrent && (
          <div className="mt-4 border-t border-border pt-4">
            <Button variant="ghost" onClick={onClear} className="text-danger">{t("board.clearSlot")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

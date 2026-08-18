"use client";

import { Plus } from "lucide-react";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { getAtletaByBid, getClubeById } from "@/lib/mock-data";
import type { FormationSlot } from "@/lib/prancheta-formations";
import type { TacticalBoardSlotRecord } from "@/lib/services/tactical-board";
import { useT } from "@/lib/i18n/I18nProvider";

export function TacticalPitch({
  slots,
  lineup,
  scores,
  zoom = 100,
  onSelectSlot,
  disabled = false,
}: {
  slots: FormationSlot[];
  lineup: TacticalBoardSlotRecord[];
  scores: Map<number, number>;
  zoom?: number;
  onSelectSlot: (slot: FormationSlot) => void;
  disabled?: boolean;
}) {
  const { t } = useT();

  const scale = zoom / 100;

  return (
    <div
      className="relative mx-auto aspect-[68/100] shrink-0 overflow-hidden border border-white/20 bg-[rgb(var(--brand-dim))] shadow-inner transition-[width] duration-200"
      style={{ width: `${zoom}%`, maxWidth: `${720 * scale}px` }}
    >
      <svg aria-hidden="true" viewBox="0 0 68 100" className="absolute inset-0 h-full w-full">
        <rect x="2" y="2" width="64" height="96" rx="1" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
        <line x1="2" y1="50" x2="66" y2="50" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
        <circle cx="34" cy="50" r="9" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
        <circle cx="34" cy="50" r=".6" fill="rgba(255,255,255,.8)" />
        <rect x="17" y="2" width="34" height="16" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
        <rect x="25" y="2" width="18" height="6" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
        <rect x="17" y="82" width="34" height="16" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
        <rect x="25" y="92" width="18" height="6" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth=".45" />
      </svg>

      {slots.map((slot, order) => {
        const entry = lineup.find((item) => item.order === order);
        const athlete = entry ? getAtletaByBid(entry.bid) : undefined;
        const club = athlete ? getClubeById(athlete.currentClubId) : undefined;
        return (
          <button
            key={slot.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelectSlot(slot)}
            aria-label={athlete ? `${athlete.name}, ${slot.position}` : `${t("board.emptySlot")} ${slot.position}`}
            className="group absolute z-10 rounded-full transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand disabled:cursor-wait disabled:opacity-70"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: `translate(-50%, -50%) scale(${scale})` }}
          >
            {athlete ? (
              <span className="flex w-[76px] flex-col items-center sm:w-[92px]">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-brand bg-surface shadow-lg transition-transform group-hover:scale-105 sm:h-12 sm:w-12">
                  <ClubeCrest src={club?.webpCrestUrl ?? null} name={club?.name ?? "?"} size={28} />
                  <span className="absolute -right-2 -top-1 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-extrabold text-black">
                    {Math.round(scores.get(order) ?? 0)}
                  </span>
                </span>
                <span className="mt-1 max-w-full truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white sm:text-xs">
                  {athlete.apelido ?? athlete.name.split(" ")[0]}
                </span>
                <span className="mt-0.5 text-[9px] font-bold text-white/80">{slot.position}</span>
              </span>
            ) : (
              <span className="flex flex-col items-center text-white/90">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-white/70 bg-black/20 group-hover:border-brand group-hover:text-brand">
                  <Plus size={18} />
                </span>
                <span className="mt-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold">{slot.position}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

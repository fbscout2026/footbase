"use client";

import { LockKeyhole, X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/I18nProvider";
import { mockAtletas } from "@/lib/mock-data";

export function AtletaCompareSelector({
  selectedBids,
  onChange,
}: {
  selectedBids: number[];
  onChange: (bids: number[]) => void;
}) {
  const { t } = useT();

  function selectAt(index: number, rawBid: string) {
    const bid = Number(rawBid);
    if (!Number.isInteger(bid) || selectedBids.includes(bid)) return;
    const next = [...selectedBids];
    next[index] = bid;
    onChange(next.slice(0, 3));
  }

  function removeAt(index: number) {
    onChange(selectedBids.filter((_, current) => current !== index));
  }

  return (
    <section className="matchday-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold uppercase italic tracking-wide">
            {t("compare.selector.title")}
          </h2>
          <p className="mt-1 text-xs text-muted">{t("compare.selector.help")}</p>
        </div>
        <span className="text-xs font-semibold text-brand">
          {selectedBids.length}/3 {t("compare.selected")}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => {
          const currentBid = selectedBids[index];
          const isLocked = index > selectedBids.length;
          const options = mockAtletas
            .filter((a) => a.bid === currentBid || !selectedBids.includes(a.bid))
            .map((a) => ({
              value: String(a.bid),
              label: a.name,
              hint: `${a.mainPosition} · ${a.currentCategory}`,
            }));

          return (
            <div key={index} className="border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase text-muted">
                  {t("compare.slot")} {index + 1}
                </span>
                {currentBid !== undefined && (
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    aria-label={`${t("compare.remove")} ${index + 1}`}
                    className="rounded-md p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {isLocked ? (
                <div className="flex min-h-9 items-center gap-2 rounded-lg border border-dashed border-border px-2.5 text-xs text-muted">
                  <LockKeyhole size={13} /> {t("compare.selector.locked")}
                </div>
              ) : (
                <Select
                  value={currentBid === undefined ? "" : String(currentBid)}
                  onChange={(value) => selectAt(index, value)}
                  options={options}
                  placeholder={t("compare.selector.placeholder")}
                  ariaLabel={`${t("compare.slot")} ${index + 1}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

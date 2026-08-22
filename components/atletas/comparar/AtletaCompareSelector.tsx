"use client";

import { useState, useEffect, useRef } from "react";
import { LockKeyhole, X, Search } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { formatAthleteCode } from "@/lib/format";

interface SlotResult {
  fbId: number;
  name: string;
  mainPosition: string | null;
  currentCategory: string | null;
}

export function AtletaCompareSelector({
  selectedBids,
  selectedNames,
  onChange,
}: {
  selectedBids: number[];
  selectedNames: Record<number, string>;
  onChange: (bids: number[]) => void;
}) {
  const { t } = useT();

  function selectAt(index: number, bid: number) {
    if (selectedBids.includes(bid)) return;
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
              ) : currentBid !== undefined ? (
                <div className="flex min-h-9 items-center rounded-lg border border-border bg-surface px-2.5 text-sm font-medium">
                  {selectedNames[currentBid] ?? formatAthleteCode(currentBid)}
                </div>
              ) : (
                <SlotSearch
                  excludeBids={selectedBids}
                  placeholder={t("compare.selector.placeholder")}
                  ariaLabel={`${t("compare.slot")} ${index + 1}`}
                  onPick={(r) => selectAt(index, r.fbId)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// A full <select> listing every athlete doesn't scale past a handful of
// fixtures — the real dataset is 3,000+ — so each empty slot is a small
// debounced search instead, same pattern as `UniversalSearch`.
function SlotSearch({
  excludeBids,
  placeholder,
  ariaLabel,
  onPick,
}: {
  excludeBids: number[];
  placeholder: string;
  ariaLabel: string;
  onPick: (result: SlotResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SlotResult[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const safeQuery = query.trim().replace(/[%_]/g, "");
      if (safeQuery.length < 2) return;
      // Accepts a raw fb_id or the displayed "FB-" code.
      const fbIdDigits = safeQuery.replace(/^fb-?/i, "");
      const isNumeric = /^\d+$/.test(fbIdDigits);
      const q = createClient().from("atletas").select("fb_id,name,main_position,current_category").order("name").limit(8);
      const { data } = isNumeric ? await q.eq("fb_id", Number(fbIdDigits)) : await q.ilike("name", `%${safeQuery}%`);
      if (active) {
        setResults(
          (data ?? [])
            .filter((a) => !excludeBids.includes(Number(a.fb_id)))
            .map((a) => ({ fbId: Number(a.fb_id), name: a.name, mainPosition: a.main_position, currentCategory: a.current_category })),
        );
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, excludeBids]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
        <Search size={13} className="shrink-0 text-muted" />
        <input
          type="text"
          aria-label={ariaLabel}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto border border-border bg-surface shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">—</p>
          ) : (
            results.map((r) => (
              <button
                key={r.fbId}
                type="button"
                onClick={() => { onPick(r); setQuery(""); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover"
              >
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block text-xs text-muted">{[r.mainPosition, r.currentCategory].filter(Boolean).join(" · ")}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { GitCompareArrows, ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { AtletaRecord } from "@/lib/services/atletas";
import { AtletaFilters } from "@/components/atletas/AtletaFilters";
import { AtletasTable } from "@/components/atletas/AtletasTable";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { loadAtletasExplorer } from "@/lib/services/atletas";
import { emptyFilters, type AtletaFilterState } from "@/lib/atletas-filters";

const PAGE_SIZE = 20;

export function AtletasExplorer({ initialAtletas, totalCount: initialTotalCount }: { initialAtletas: AtletaRecord[]; totalCount: number }) {
  const { t } = useT();
  const [filters, setFilters] = useState<AtletaFilterState>(emptyFilters);
  const [atletas, setAtletas] = useState(initialAtletas);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // The server already gave us page 1, unfiltered (SSR) — skip re-fetching it
  // on mount, only once, so the first paint doesn't pay for a request it
  // already has the answer to.
  const isFirstRender = useRef(true);

  // Real server-side search (Session 55): filters are pushed down into the
  // Supabase query (see `loadAtletasExplorer`/`applyAtletaFilters`) instead of
  // only narrowing whichever 20 rows happen to be on the CURRENT page — a
  // filter like "Gema" used to come back empty almost every time even when
  // real matches existed, just scattered across the other 465 pages. Changing
  // a filter always jumps back to page 1: a stale page number from a
  // different, larger result set wouldn't mean anything for the new one.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const client = createClient();
    loadAtletasExplorer(client, page - 1, filters)
      .then(({ atletas: next, totalCount: nextTotal }) => {
        if (!cancelled) {
          setAtletas(next);
          setTotalCount(nextTotal);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, filters]);

  const goToPage = useCallback((next: number) => {
    setPage(Math.max(1, next));
  }, []);

  const handleFiltersChange = useCallback((next: AtletaFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const nationalities = useMemo(
    () => Array.from(new Set(atletas.map((a) => a.nacionalidade))).sort(),
    [atletas],
  );
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold uppercase italic tracking-tight">
            {t("atletas.title")}
          </h1>
          <span className="text-sm text-muted">
            {totalCount} {t("atletas.count")}
          </span>
        </div>
        <Button href="/atletas/comparar" variant="secondary">
          <GitCompareArrows size={16} /> {t("compare.cta")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <aside className="lg:col-span-1">
          <AtletaFilters filters={filters} onChange={handleFiltersChange} nationalities={nationalities} />
        </aside>
        <div className="space-y-3 lg:col-span-3 xl:col-span-4">
          <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <AtletasTable atletas={atletas} />
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={goToPage} />
        </div>
      </div>
    </div>
  );
}

export function AtletasLoadError() {
  const { t } = useT();
  return (
    <div className="matchday-surface p-10 text-center">
      <h1 className="matchday-heading text-2xl">{t("atletas.loadError")}</h1>
    </div>
  );
}

export function AtletaDossieLoadError() {
  const { t } = useT();
  return (
    <div className="border border-border bg-surface p-10 text-center">
      <p className="text-muted">{t("atletas.loadError")}</p>
      <Link href="/atletas" className="mt-4 inline-flex items-center gap-1 text-sm text-brand hover:underline">
        <ChevronLeft size={16} /> {t("nav.atletas")}
      </Link>
    </div>
  );
}

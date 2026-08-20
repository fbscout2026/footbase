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
import { applyFilters, emptyFilters, type AtletaFilterState } from "@/lib/atletas-filters";

const PAGE_SIZE = 20;

export function AtletasExplorer({ initialAtletas, totalCount }: { initialAtletas: AtletaRecord[]; totalCount: number }) {
  const { t } = useT();
  const [filters, setFilters] = useState<AtletaFilterState>(emptyFilters);
  const [atletas, setAtletas] = useState(initialAtletas);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // The server already gave us page 1 (SSR) — skip re-fetching it on mount.
  const isFirstRender = useRef(true);

  // Real server-side pagination: exactly one page (20 athletes) is ever held
  // in client state, fetched fresh per page via `.range()` (see `atletas.ts`)
  // instead of accumulating an ever-growing "carregar mais" list. The quick
  // search/filters below still only run over the CURRENT page's 20 rows, not
  // the whole database — a real server-side search is the proper follow-up
  // once that's worth the extra complexity; this keeps the page itself light.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const client = createClient();
    loadAtletasExplorer(client, page - 1)
      .then(({ atletas: next }) => {
        if (!cancelled) setAtletas(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const goToPage = useCallback((next: number) => {
    setPage(Math.max(1, next));
  }, []);

  const nationalities = useMemo(
    () => Array.from(new Set(atletas.map((a) => a.nacionalidade))).sort(),
    [atletas],
  );
  const results = useMemo(() => applyFilters(atletas, filters), [atletas, filters]);
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
          <AtletaFilters filters={filters} onChange={setFilters} nationalities={nationalities} />
        </aside>
        <div className="space-y-3 lg:col-span-3 xl:col-span-4">
          <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <AtletasTable atletas={results} />
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

"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { GitCompareArrows, ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { AtletaRecord } from "@/lib/services/atletas";
import { AtletaFilters } from "@/components/atletas/AtletaFilters";
import { AtletasTable } from "@/components/atletas/AtletasTable";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { loadAtletasExplorer } from "@/lib/services/atletas";
import { applyFilters, emptyFilters, type AtletaFilterState } from "@/lib/atletas-filters";

export function AtletasExplorer({ initialAtletas, totalCount }: { initialAtletas: AtletaRecord[]; totalCount: number }) {
  const { t } = useT();
  const [filters, setFilters] = useState<AtletaFilterState>(emptyFilters);
  const [atletas, setAtletas] = useState(initialAtletas);
  const [loadingMore, setLoadingMore] = useState(false);

  // Server-side pagination (Session 52: the full unpaginated dataset — 3,000+
  // real athletes now — hit a Postgres statement timeout, see `atletas.ts`).
  // "Carregar mais" appends the next page; the quick search/filters below still
  // only run over whatever has been loaded so far, not the whole database — a
  // real server-side search is the proper follow-up once this needs to scale
  // further, this is the honest stopgap for now.
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const client = createClient();
      const { atletas: next } = await loadAtletasExplorer(client, Math.floor(atletas.length / 500));
      setAtletas((prev) => [...prev, ...next]);
    } finally {
      setLoadingMore(false);
    }
  }, [atletas.length]);

  const nationalities = useMemo(
    () => Array.from(new Set(atletas.map((a) => a.nacionalidade))).sort(),
    [atletas],
  );
  const results = useMemo(() => applyFilters(atletas, filters), [atletas, filters]);
  const hasMore = atletas.length < totalCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold uppercase italic tracking-tight">
            {t("atletas.title")}
          </h1>
          <span className="text-sm text-muted">
            {results.length} / {totalCount} {t("atletas.count")}
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
          <AtletasTable atletas={results} />
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t("common.loading") : t("atletas.loadMore")}
              </Button>
            </div>
          )}
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

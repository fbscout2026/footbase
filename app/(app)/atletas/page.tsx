"use client";

import { useState, useMemo } from "react";
import { GitCompareArrows } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { mockAtletas } from "@/lib/mock-data";
import { AtletaFilters } from "@/components/atletas/AtletaFilters";
import { AtletasTable } from "@/components/atletas/AtletasTable";
import { Button } from "@/components/ui/Button";
import { applyFilters, emptyFilters, type AtletaFilterState } from "@/lib/atletas-filters";

export default function AtletasPage() {
  const { t } = useT();
  const [filters, setFilters] = useState<AtletaFilterState>(emptyFilters);

  const results = useMemo(() => applyFilters(mockAtletas, filters), [filters]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold uppercase italic tracking-tight">
            {t("atletas.title")}
          </h1>
          <span className="text-sm text-muted">
            {results.length} {t("atletas.count")}
          </span>
        </div>
        <Button href="/atletas/comparar" variant="secondary">
          <GitCompareArrows size={16} /> {t("compare.cta")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <aside className="lg:col-span-1">
          <AtletaFilters filters={filters} onChange={setFilters} />
        </aside>
        <div className="lg:col-span-3 xl:col-span-4">
          <AtletasTable atletas={results} />
        </div>
      </div>
    </div>
  );
}

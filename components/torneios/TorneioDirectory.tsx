"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useT } from "@/lib/i18n/I18nProvider";
import {
  initialTorneioFilters, paisesForConfederacao, federacoesForPais, categoriasForFederacao, filterTorneios,
  type TorneioFilterState,
} from "@/lib/torneios-filter-rules";
import type { TorneioExplorerData } from "@/lib/services/torneios";

// Cap DOM rows to keep the table snappy — same fix as ClubDirectory.tsx.
const ROWS_PER_PAGE = 20;

export function TorneioDirectory({ data }: { data: TorneioExplorerData }) {
  const { t } = useT();
  const [filters, setFilters] = useState<TorneioFilterState>(initialTorneioFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [page, setPage] = useState(1);

  const paisOptions = useMemo(() => paisesForConfederacao(data.paises, filters.confederacaoId), [data.paises, filters.confederacaoId]);
  const federacaoOptions = useMemo(() => federacoesForPais(data.federacoes, filters.paisId), [data.federacoes, filters.paisId]);
  const selectedFederacao = useMemo(() => data.federacoes.find((f) => f.id === filters.federacaoId), [data.federacoes, filters.federacaoId]);
  const categoriaOptions = useMemo(() => categoriasForFederacao(data.torneios, selectedFederacao), [data.torneios, selectedFederacao]);
  const results = useMemo(() => filterTorneios(data.torneios, filters), [data.torneios, filters]);

  useEffect(() => {
    setPage(1);
  }, [results]);

  const pageCount = Math.max(1, Math.ceil(results.length / ROWS_PER_PAGE));
  const paged = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return results.slice(start, start + ROWS_PER_PAGE);
  }, [results, page]);

  const setConfederacao = (confederacaoId: string) => setFilters({ ...initialTorneioFilters, query: filters.query, confederacaoId });
  const setPais = (paisId: string) => setFilters({ ...filters, paisId, federacaoId: "", categoria: "" });
  const setFederacao = (federacaoId: string) => setFilters({ ...filters, federacaoId, categoria: "" });
  const setCategoria = (categoria: string) => setFilters({ ...filters, categoria });
  const clearAdvanced = () => setFilters({ ...initialTorneioFilters, query: filters.query });

  return (
    <div className="space-y-5">
      <section className="matchday-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-brand"><Trophy size={18} /><span className="text-xs font-extrabold uppercase tracking-widest">{t("torneios.badge")}</span></div>
            <h1 className="matchday-heading text-3xl">{t("torneios.title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("torneios.subtitle")}</p>
          </div>
          <span className="metric-value text-sm text-muted">{results.length} {t("torneios.count")}</span>
        </div>

        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">{t("torneios.quickSearch")}</span>
          <span className="flex min-h-11 items-center border border-border bg-background px-3 focus-within:border-brand">
            <Search size={16} className="mr-2 text-muted" />
            <input value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder={t("torneios.searchPlaceholder")} className="w-full bg-transparent text-sm outline-none" />
          </span>
        </label>

        <button type="button" onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen} className="mt-4 min-h-9 border border-border px-3 text-xs font-extrabold uppercase tracking-wide text-muted hover:border-brand hover:text-foreground">
          {advancedOpen ? t("torneios.hideAdvanced") : t("torneios.showAdvanced")}
        </button>

        {advancedOpen && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label={t("torneios.continent")}>
              <Select ariaLabel={t("torneios.continent")} value={filters.confederacaoId} onChange={setConfederacao}
                options={[{ value: "", label: t("torneios.allContinents") }, ...data.confederacoes.map((c) => ({ value: c.id, label: `${c.continente} · ${c.codigo}` }))]} />
            </Field>
            <Field label={t("torneios.country")}>
              <Select ariaLabel={t("torneios.country")} value={filters.paisId} onChange={setPais} disabled={!filters.confederacaoId}
                options={[{ value: "", label: t("torneios.allCountries") }, ...paisOptions.map((p) => ({ value: p.id, label: p.nome }))]} />
            </Field>
            <Field label={t("torneios.federation")}>
              <Select ariaLabel={t("torneios.federation")} value={filters.federacaoId} onChange={setFederacao} disabled={!filters.paisId}
                options={[{ value: "", label: t("torneios.allFederations") }, ...federacaoOptions.map((f) => ({ value: f.id, label: f.tipo === "nacional" ? `${t("torneios.national")} ${f.sigla}` : `${f.sigla} — ${f.nome}` }))]} />
            </Field>
            <Field label={t("torneios.category")}>
              <Select ariaLabel={t("torneios.category")} value={filters.categoria} onChange={setCategoria} disabled={!filters.federacaoId}
                options={[{ value: "", label: t("torneios.allCategories") }, ...categoriaOptions.map((c) => ({ value: c, label: c }))]} />
            </Field>
            <div className="md:col-span-2 xl:col-span-4">
              <Button variant="secondary" onClick={clearAdvanced} className="min-h-9 px-3 text-xs">{t("torneios.clearFilters")}</Button>
            </div>
          </div>
        )}
      </section>

      <section className="matchday-surface overflow-hidden">
        {results.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">{t("torneios.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">{t("torneios.col.name")}</th>
                    <th className="px-4 py-3">{t("torneios.col.federation")}</th>
                    <th className="px-4 py-3">{t("torneios.col.category")}</th>
                    <th className="px-4 py-3">{t("torneios.col.year")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((tr) => (
                    <tr key={tr.id} className="border-b border-border/60 transition-colors hover:bg-surface-hover">
                      <td className="px-5 py-4"><Link href={`/torneios/${tr.id}`} className="font-bold hover:text-brand">{tr.name}</Link></td>
                      <td className="px-4 py-4 text-muted">{tr.federacaoSigla ?? tr.federationText}</td>
                      <td className="px-4 py-4"><Badge tone="neutral">{tr.category ?? "—"}</Badge></td>
                      <td className="metric-value px-4 py-4">{tr.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

export function TorneioLoadError() {
  const { t } = useT();
  return <div className="matchday-surface p-10 text-center"><h1 className="matchday-heading text-2xl">{t("torneios.loadError")}</h1></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>{children}</div>;
}

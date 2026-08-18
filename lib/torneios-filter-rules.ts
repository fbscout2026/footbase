// Pure filtering/navigation rules for the Torneios explorer (UC — Session 30/31
// design). Mirrors the cascading picker from the approved flow diagram:
// Continente/Confederação → País → Federação (nacional | estadual) → Categoria.
//
// Kept pure (no Supabase) so the cascade logic is unit-testable independent of IO.

import { CATEGORY_ORDER } from "./atletas-filters.ts";

export interface Confederacao { id: string; continente: string; codigo: string; nome: string }
export interface Pais { id: string; confederacaoId: string; nome: string; codigo: string | null }
export interface Federacao { id: string; paisId: string; nome: string; sigla: string; tipo: "nacional" | "estadual" }
export interface TorneioSummary {
  id: string;
  name: string;
  federationText: string;
  federacaoId: string | null;
  federacaoSigla: string | null;
  category: string | null;
  year: number;
}

export interface TorneioFilterState {
  query: string;
  confederacaoId: string;
  paisId: string;
  federacaoId: string;
  categoria: string;
}

export const initialTorneioFilters: TorneioFilterState = {
  query: "", confederacaoId: "", paisId: "", federacaoId: "", categoria: "",
};

export function paisesForConfederacao(paises: Pais[], confederacaoId: string): Pais[] {
  if (!confederacaoId) return [];
  return paises.filter((p) => p.confederacaoId === confederacaoId);
}

export function federacoesForPais(federacoes: Federacao[], paisId: string): Federacao[] {
  if (!paisId) return [];
  return federacoes.filter((f) => f.paisId === paisId);
}

/**
 * Category options for the chosen federação. National federations (e.g. CBF)
 * always show the full SUB-11..SUB-20 range (per the diagram); state federations
 * only show categories that actually have a torneio ("se disponível").
 */
export function categoriasForFederacao(torneios: TorneioSummary[], federacao: Federacao | undefined): string[] {
  if (!federacao) return [];
  if (federacao.tipo === "nacional") return [...CATEGORY_ORDER];
  const present = new Set(
    torneios.filter((t) => t.federacaoId === federacao.id && t.category).map((t) => t.category as string),
  );
  return CATEGORY_ORDER.filter((c) => present.has(c));
}

/** Quick search (by name) combined with whatever cascade level is selected. */
export function filterTorneios(torneios: TorneioSummary[], filters: TorneioFilterState): TorneioSummary[] {
  const q = filters.query.trim().toLowerCase();
  return torneios.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (filters.federacaoId && t.federacaoId !== filters.federacaoId) return false;
    if (filters.categoria && t.category !== filters.categoria) return false;
    return true;
  });
}

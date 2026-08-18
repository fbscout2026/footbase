import type { SupabaseClient } from "@supabase/supabase-js";
import type { Confederacao, Federacao, Pais, TorneioSummary } from "@/lib/torneios-filter-rules";

export interface TorneioExplorerData {
  confederacoes: Confederacao[];
  paises: Pais[];
  federacoes: Federacao[];
  torneios: TorneioSummary[];
}

export interface TorneioDetail extends TorneioSummary {
  federacaoNome: string | null;
  paisNome: string | null;
  continente: string | null;
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

// The dataset is small (a handful of confederações/países/federações, and torneios
// grows slowly with real ingestion) — fetched once and filtered client-side, same
// pattern as ClubDirectory.
export async function loadTorneioExplorer(client: SupabaseClient): Promise<TorneioExplorerData> {
  const [confRes, paisRes, fedRes, trnRes] = await Promise.all([
    client.from("confederacoes").select("id,continente,codigo,nome").order("continente"),
    client.from("paises").select("id,confederacao_id,nome,codigo").order("nome"),
    client.from("federacoes").select("id,pais_id,nome,sigla,tipo").order("sigla"),
    client.from("torneios").select("id,name,federation,federacao_id,category,year,federacoes(sigla)").order("name"),
  ]);
  if (confRes.error) throw confRes.error;
  if (paisRes.error) throw paisRes.error;
  if (fedRes.error) throw fedRes.error;
  if (trnRes.error) throw trnRes.error;

  return {
    confederacoes: (confRes.data ?? []).map((c) => ({ id: String(c.id), continente: c.continente, codigo: c.codigo, nome: c.nome })),
    paises: (paisRes.data ?? []).map((p) => ({ id: String(p.id), confederacaoId: String(p.confederacao_id), nome: p.nome, codigo: p.codigo })),
    federacoes: (fedRes.data ?? []).map((f) => ({ id: String(f.id), paisId: String(f.pais_id), nome: f.nome, sigla: f.sigla, tipo: f.tipo as Federacao["tipo"] })),
    torneios: (trnRes.data ?? []).map((t) => ({
      id: String(t.id),
      name: t.name,
      federationText: t.federation,
      federacaoId: t.federacao_id ? String(t.federacao_id) : null,
      federacaoSigla: one<{ sigla?: string }>(t.federacoes as never)?.sigla ?? null,
      category: t.category,
      year: Number(t.year),
    })),
  };
}

export async function loadTorneioDetail(client: SupabaseClient, id: string): Promise<TorneioDetail> {
  const { data, error } = await client
    .from("torneios")
    .select("id,name,federation,federacao_id,category,year,federacoes(nome,sigla,paises(nome,confederacoes(continente)))")
    .eq("id", id)
    .single();
  if (error) throw error;
  const fed = one<{ nome?: string; sigla?: string; paises?: unknown }>(data.federacoes as never);
  const pais = one<{ nome?: string; confederacoes?: unknown }>(fed?.paises as never);
  const conf = one<{ continente?: string }>(pais?.confederacoes as never);
  return {
    id: String(data.id),
    name: data.name,
    federationText: data.federation,
    federacaoId: data.federacao_id ? String(data.federacao_id) : null,
    federacaoSigla: fed?.sigla ?? null,
    category: data.category,
    year: Number(data.year),
    federacaoNome: fed?.nome ?? null,
    paisNome: pais?.nome ?? null,
    continente: conf?.continente ?? null,
  };
}

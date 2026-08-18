import type { SupabaseClient } from "@supabase/supabase-js";
import type { Confederacao, Pais, Federacao } from "@/lib/torneios-filter-rules";

export interface FederationHierarchy {
  confederacoes: Confederacao[];
  paises: Pais[];
  federacoes: Federacao[];
}

// Curation-only data (RLS: *_write_admin). Adding a state/national federation, or a
// whole new country, is pure data — never needs a migration; the hierarchy tables
// already support any confederation/country/federation. The 6 confederations are
// the fixed, universal set and are not editable here.
export async function loadFederationHierarchy(client: SupabaseClient): Promise<FederationHierarchy> {
  const [confRes, paisRes, fedRes] = await Promise.all([
    client.from("confederacoes").select("id,continente,codigo,nome").order("continente"),
    client.from("paises").select("id,confederacao_id,nome,codigo").order("nome"),
    client.from("federacoes").select("id,pais_id,nome,sigla,tipo").order("sigla"),
  ]);
  if (confRes.error) throw confRes.error;
  if (paisRes.error) throw paisRes.error;
  if (fedRes.error) throw fedRes.error;

  return {
    confederacoes: (confRes.data ?? []).map((c) => ({ id: String(c.id), continente: c.continente, codigo: c.codigo, nome: c.nome })),
    paises: (paisRes.data ?? []).map((p) => ({ id: String(p.id), confederacaoId: String(p.confederacao_id), nome: p.nome, codigo: p.codigo })),
    federacoes: (fedRes.data ?? []).map((f) => ({ id: String(f.id), paisId: String(f.pais_id), nome: f.nome, sigla: f.sigla, tipo: f.tipo as Federacao["tipo"] })),
  };
}

export async function addPais(client: SupabaseClient, input: { confederacaoId: string; nome: string; codigo?: string }): Promise<void> {
  const { error } = await client.from("paises").insert({
    confederacao_id: input.confederacaoId,
    nome: input.nome.trim(),
    codigo: input.codigo?.trim() || null,
  });
  if (error) throw error;
}

export async function addFederacao(client: SupabaseClient, input: { paisId: string; nome: string; sigla: string; tipo: Federacao["tipo"] }): Promise<void> {
  const { error } = await client.from("federacoes").insert({
    pais_id: input.paisId,
    nome: input.nome.trim(),
    sigla: input.sigla.trim().toUpperCase(),
    tipo: input.tipo,
  });
  if (error) throw error;
}

// `paises.confederacao_id`/`federacoes.pais_id` are `on delete restrict` — removing a
// country that still has federations (or, transitively, a confederation with
// countries) fails with Postgres 23503 (foreign_key_violation) instead of silently
// cascading. Callers should remove the children first, or surface that error as-is.
export async function removePais(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("paises").delete().eq("id", id);
  if (error) throw error;
}

// `torneios.federacao_id` is `on delete set null` — removing a federation never
// deletes a torneio, it just detaches it (the original `federation` text survives).
export async function removeFederacao(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("federacoes").delete().eq("id", id);
  if (error) throw error;
}

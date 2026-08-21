import type { SupabaseClient } from "@supabase/supabase-js";
import type { Confederacao, Federacao, Pais, TorneioSummary } from "@/lib/torneios-filter-rules";
import { computeStandings, computeTopScorers, type ScorerRow, type StandingRow } from "@/lib/torneio-standings";

export interface TorneioExplorerData {
  confederacoes: Confederacao[];
  paises: Pais[];
  federacoes: Federacao[];
  torneios: TorneioSummary[];
}

export interface TorneioDetail extends TorneioSummary {
  paisNome: string | null;
  continente: string | null;
  standings: StandingRow[];
  topScorers: ScorerRow[];
  matchCount: number;
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
    client.from("torneios").select("id,name,federation,federacao_id,category,year,federacoes(nome,sigla)").order("name"),
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
      federacaoSigla: one<{ sigla?: string; nome?: string }>(t.federacoes as never)?.sigla ?? null,
      federacaoNome: one<{ sigla?: string; nome?: string }>(t.federacoes as never)?.nome ?? null,
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
    ...(await loadTorneioStandingsAndScorers(client, id)),
  };
}

/** Classificação + artilharia computed from real ingested matches
 * (`partidas_sumula`/`atuacoes_sumula`) — pure calculation lives in
 * `lib/torneio-standings.ts`; this is only the fetch + shape-into-input side. */
async function loadTorneioStandingsAndScorers(
  client: SupabaseClient,
  torneioId: string,
): Promise<{ standings: StandingRow[]; topScorers: ScorerRow[]; matchCount: number }> {
  const { data: matches, error: matchesErr } = await client
    .from("partidas_sumula")
    .select("id,home_club_id,away_club_id,home_score,away_score")
    .eq("torneio_id", torneioId);
  if (matchesErr) throw matchesErr;
  const rows = matches ?? [];

  const clubIds = [...new Set(rows.flatMap((m) => [m.home_club_id, m.away_club_id]).filter((v): v is string => !!v))];
  const partidaIds = rows.map((m) => m.id);

  const [clubsRes, appearancesRes] = await Promise.all([
    clubIds.length
      ? client.from("clubes").select("id,name,webp_crest_url").in("id", clubIds)
      : Promise.resolve({ data: [], error: null }),
    partidaIds.length
      ? client.from("atuacoes_sumula").select("bid_atleta,goals,atletas(name)").in("partida_id", partidaIds).gt("goals", 0)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clubsRes.error) throw clubsRes.error;
  if (appearancesRes.error) throw appearancesRes.error;

  const clubMap = new Map((clubsRes.data ?? []).map((c) => [String(c.id), { id: String(c.id), name: c.name, crestUrl: c.webp_crest_url }]));

  const standings = computeStandings(
    rows.map((m) => ({
      homeClubId: String(m.home_club_id ?? ""),
      awayClubId: String(m.away_club_id ?? ""),
      homeScore: m.home_score,
      awayScore: m.away_score,
    })),
    clubMap,
  );

  const topScorers = computeTopScorers(
    (appearancesRes.data ?? []).map((a) => ({
      bid: Number(a.bid_atleta),
      name: one<{ name?: string }>(a.atletas as never)?.name ?? String(a.bid_atleta),
      goals: a.goals,
    })),
  ).slice(0, 10);

  return { standings, topScorers, matchCount: rows.filter((m) => m.home_score != null && m.away_score != null).length };
}

import type { SupabaseClient } from "@supabase/supabase-js";

// FOOTBASE — dashboard widget data, all real (Session 52 — replaces
// `lib/mock-data.ts` fixtures). Every query here is bounded (LIMIT 6-8) and
// reads `view_atleta_resumo` directly — real per-athlete stats are only
// available once RLS's `is_approved()`/`is_admin()` checks are wrapped in a
// scalar subquery (`(select ...)`), the fix applied in this same session; an
// unbounded/unwrapped query on this view times out past a few thousand rows.

export interface DashboardAthleteRow {
  bid: number;
  name: string;
  currentClubName: string | null;
  currentCategory: string | null;
}

export interface ScorerRow extends DashboardAthleteRow {
  goals: number;
}

export interface GemRow extends DashboardAthleteRow {
  gamesAboveCategory: number;
}

export interface InactiveRow extends DashboardAthleteRow {
  lastMatchDate: string | null;
}

export interface ContractRow extends DashboardAthleteRow {
  contractEndDate: string | null;
}

const ROW_COLUMNS = "bid,name,current_club_name,current_category";

function toAthleteRow(r: { bid: number; name: string; current_club_name: string | null; current_category: string | null }): DashboardAthleteRow {
  return { bid: Number(r.bid), name: r.name, currentClubName: r.current_club_name, currentCategory: r.current_category };
}

export async function loadTopScorers(client: SupabaseClient, limit = 6): Promise<ScorerRow[]> {
  const { data, error } = await client.from("view_atleta_resumo").select(`${ROW_COLUMNS},total_goals`).gt("total_goals", 0).order("total_goals", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toAthleteRow(r), goals: r.total_goals }));
}

// Deliberately not querying `times_played_above_category` from the view: it's
// computed via `categoria_rank()`, a real per-row function call (a scalar
// subquery against `categoria_ordem`) inside the LATERAL stats join — confirmed
// live (Session 52) to alone push a query into `statement timeout` even where
// every other view-backed widget on this same dashboard succeeds in ~2s. A
// direct query bypassing the view (comparing `SUB-N` suffixes numerically in
// JS across all ~15k `atuacoes_sumula` rows) works but still takes ~6s AND
// found zero real occurrences in the data ingested so far — base categories
// essentially never field a player above their own category. Not worth
// spending that latency on every dashboard load for a real signal that's
// currently always empty; revisit if/when this actually starts happening, or
// once it's cheap to compute (e.g. precomputed during ingestion).
export async function loadGemasCategoriaAcima(_client: SupabaseClient, _limit = 6): Promise<GemRow[]> {
  return [];
}

export async function loadInativos(client: SupabaseClient, limit = 6): Promise<InactiveRow[]> {
  const { data, error } = await client.from("view_atleta_resumo").select(`${ROW_COLUMNS},last_match_date`).eq("is_inactive_30d", true).not("last_match_date", "is", null).order("last_match_date", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toAthleteRow(r), lastMatchDate: r.last_match_date }));
}

export async function loadContratosVencendo(client: SupabaseClient, limit = 6): Promise<ContractRow[]> {
  // Always empty today: `contract_end_date` has no scraping source (súmulas
  // don't carry it) — only a claiming agent can set it. Real, honest zero, not
  // a broken query — kept as its own function so it starts working the moment
  // that data exists, with no other code to change.
  const { data, error } = await client.from("view_atleta_resumo").select(`${ROW_COLUMNS},contract_end_date`).eq("contract_status", "expiring_soon").order("contract_end_date", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toAthleteRow(r), contractEndDate: r.contract_end_date }));
}

/** "Free agents to watch" — unrepresented athletes with real goal-scoring
 * output. Every real athlete is technically `contract_status='free_agent'`
 * right now (no contract data exists at all yet), so filtering on that alone
 * would list thousands — `agent_id is null` + a goals floor turns this into
 * something actually worth showing instead of the entire database. */
export async function loadAgentesLivres(client: SupabaseClient, limit = 6): Promise<ScorerRow[]> {
  const { data, error } = await client.from("view_atleta_resumo").select(`${ROW_COLUMNS},total_goals`).is("agent_id", null).gt("total_goals", 0).order("total_goals", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toAthleteRow(r), goals: r.total_goals }));
}

export interface TorneioRow {
  id: string;
  name: string;
  federationText: string;
  category: string | null;
  year: number;
}

export async function loadTorneiosDestaque(client: SupabaseClient, limit = 8): Promise<TorneioRow[]> {
  const { data, error } = await client.from("torneios").select("id,name,federation,category,year").order("name").limit(limit);
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: String(t.id), name: t.name, federationText: t.federation, category: t.category, year: Number(t.year) }));
}

export interface DashboardBoardSummary {
  exists: boolean;
  formation: string;
  starters: number;
  bench: number;
}

/** Read-only — unlike `getOrCreateBoard` (used by the prancheta page itself),
 * this never creates a board just because the dashboard was viewed. */
export async function loadBoardSummary(client: SupabaseClient, userId: string): Promise<DashboardBoardSummary> {
  const board = await client.from("prancheta_tatica").select("id,formation").eq("user_id", userId).maybeSingle();
  if (board.error) throw board.error;
  if (!board.data) return { exists: false, formation: "4-3-3", starters: 0, bench: 0 };

  const [slots, favoritesCount] = await Promise.all([
    client.from("prancheta_slots").select("id", { count: "exact", head: true }).eq("prancheta_id", board.data.id).eq("slot_type", "starter"),
    client.from("favoritos").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (slots.error) throw slots.error;
  if (favoritesCount.error) throw favoritesCount.error;
  const starters = slots.count ?? 0;
  return { exists: true, formation: board.data.formation, starters, bench: Math.max(0, (favoritesCount.count ?? 0) - starters) };
}

export interface DashboardHeroStats {
  sumulasCount: number;
  athletesCount: number;
  topScorer: { name: string; goals: number } | null;
}

export async function loadHeroStats(client: SupabaseClient): Promise<DashboardHeroStats> {
  const [sumulas, athletes, top] = await Promise.all([
    client.from("partidas_sumula").select("id", { count: "exact", head: true }),
    client.from("atletas").select("bid", { count: "exact", head: true }),
    client.from("view_atleta_resumo").select("name,total_goals").gt("total_goals", 0).order("total_goals", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sumulas.error) throw sumulas.error;
  if (athletes.error) throw athletes.error;
  if (top.error) throw top.error;
  return {
    sumulasCount: sumulas.count ?? 0,
    athletesCount: athletes.count ?? 0,
    topScorer: top.data ? { name: top.data.name, goals: top.data.total_goals } : null,
  };
}

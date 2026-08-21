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

// `games_above_current_category` (Session 55) is precomputed at ingestion
// time — matches whose category outranks the athlete's CURRENT category,
// proving they've already competed successfully above where they're
// registered now. Cheap to read directly, same pattern as every other
// dashboard stat below (no more live LATERAL/categoria_rank() join — that
// version alone pushed this query into a Postgres statement timeout, Session
// 52). Note this is a DIFFERENT signal from `times_played_above_category`
// (compares a match's category against the player_category recorded on that
// SAME appearance — always 0 in practice, every source's parsers record the
// player as playing in whatever category the match itself is).
export async function loadGemasCategoriaAcima(client: SupabaseClient, limit = 6): Promise<GemRow[]> {
  const { data, error } = await client.from("view_atleta_resumo").select(`${ROW_COLUMNS},games_above_current_category`).gt("games_above_current_category", 0).order("games_above_current_category", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...toAthleteRow(r), gamesAboveCategory: r.games_above_current_category }));
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
  topScorer: { bid: number; name: string; goals: number } | null;
}

// "Destaque da rodada" ranks by `goals_last5` (Session 55) — goals over each
// athlete's own last 5 matches, not the all-time season total it used to be
// (that had no time window at all, despite the "da rodada" label). Same
// "current form" window already used for the tactical board's ranking.
export async function loadHeroStats(client: SupabaseClient): Promise<DashboardHeroStats> {
  const [sumulas, athletes, top] = await Promise.all([
    client.from("partidas_sumula").select("id", { count: "exact", head: true }),
    client.from("atletas").select("bid", { count: "exact", head: true }),
    client.from("atletas").select("bid,name,goals_last5").gt("goals_last5", 0).order("goals_last5", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sumulas.error) throw sumulas.error;
  if (athletes.error) throw athletes.error;
  if (top.error) throw top.error;
  return {
    sumulasCount: sumulas.count ?? 0,
    athletesCount: athletes.count ?? 0,
    topScorer: top.data ? { bid: Number(top.data.bid), name: top.data.name, goals: top.data.goals_last5 } : null,
  };
}

export interface NotificationsSummary {
  count: number;
  contractsExpiring: number;
  inactive: number;
  newGems: number;
}

// Real signals only (Session 55 — the hero card used to show a hardcoded "2
// novas atualizações" with no system behind it): among the user's OWN
// favorited athletes, how many have a contract expiring/expired, have gone
// 30+ days without a súmula, or currently qualify as "categoria acima".
// "newGems" is really "current gems among favorites", not a true delta —
// there's no per-user "last seen" state to detect a genuine change yet.
export async function loadNotificationsSummary(client: SupabaseClient, userId: string): Promise<NotificationsSummary> {
  const favs = await client.from("favoritos").select("bid_atleta").eq("user_id", userId);
  if (favs.error) throw favs.error;
  const bids = (favs.data ?? []).map((f) => f.bid_atleta);
  if (bids.length === 0) return { count: 0, contractsExpiring: 0, inactive: 0, newGems: 0 };

  const { data, error } = await client
    .from("view_atleta_resumo")
    .select("bid,contract_status,is_inactive_30d,games_above_current_category")
    .in("bid", bids);
  if (error) throw error;

  const contractsExpiring = (data ?? []).filter((r) => r.contract_status === "expiring_soon" || r.contract_status === "expired").length;
  const inactive = (data ?? []).filter((r) => r.is_inactive_30d).length;
  const newGems = (data ?? []).filter((r) => r.games_above_current_category > 0).length;
  return { count: contractsExpiring + inactive + newGems, contractsExpiring, inactive, newGems };
}

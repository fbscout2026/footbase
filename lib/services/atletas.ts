import type { SupabaseClient } from "@supabase/supabase-js";
import { num, type AtletaFilterState } from "@/lib/atletas-filters";

// FOOTBASE — real Atletas explorer + dossiê, backed by `view_atleta_resumo`
// (see supabase/schema.sql). Replaces the `lib/mock-data.ts` fixtures the
// `/atletas` pages used before real CBF ingestion existed (Session 52).
//
// Real scraped athletes have many NULL biographic/physical fields (birth_date,
// height_cm, weight_kg, dominant_foot, posicao_secundaria — none of these come
// from a súmula; they're only ever set by the athlete's claiming agent). Every
// field below is honestly nullable instead of defaulting to a fake value, and
// every consumer (filters, table, dossiê) must treat null as "unknown", never
// guess a display value.

export type ContractStatus = "active" | "expiring_soon" | "expired" | "free_agent";
export type ClaimStatus = "unclaimed" | "pending" | "claimed";

export interface AtletaStats {
  totalMatches: number;
  totalMinutes: number;
  totalGoals: number;
  totalAssists: number;
  totalYellowCards: number;
  totalRedCards: number;
  totalCleanSheets: number;
  timesPlayedAboveCategory: number;
  gamesAboveCurrentCategory: number;
  lastMatchDate: string | null;
}

export interface AtletaRecord {
  fbId: number;
  fifaId: string | null;
  name: string;
  apelido: string | null;
  birthDate: string | null;
  age: number | null;
  anoNascimento: number | null;
  nacionalidade: string;
  temPassaporte: boolean;
  mainPosition: string | null;
  posicaoSecundaria: string | null;
  dominantFoot: string | null;
  heightCm: number | null;
  weightKg: number | null;
  inicioCarreira: number | null;
  contractEndDate: string | null;
  contractStatus: ContractStatus;
  currentClubId: string | null;
  currentClubName: string | null;
  currentClubCrestUrl: string | null;
  currentCategory: string | null;
  experienciaInternacional: boolean;
  jogosSuspenso: number;
  agentId: string | null;
  claimStatus: ClaimStatus;
  youtubeVideoUrl: string | null;
  stats: AtletaStats;
  isInactive30d: boolean;
}

const VIEW_COLUMNS =
  "fb_id,fifa_id,name,apelido,birth_date,ano_nascimento,age,nacionalidade,tem_passaporte,main_position,posicao_secundaria," +
  "dominant_foot,height_cm,weight_kg,inicio_carreira,contract_end_date,contract_status,current_club_id,current_club_name," +
  "current_club_crest_url,current_category,experiencia_internacional,jogos_suspenso,agent_id,claim_status,youtube_video_url," +
  "total_matches,total_minutes,total_goals,total_assists,total_yellow_cards,total_red_cards,total_clean_sheets," +
  "times_played_above_category,games_above_current_category,last_match_date,is_inactive_30d";

type ViewRow = {
  fb_id: number; fifa_id: string | null; name: string; apelido: string | null; birth_date: string | null;
  ano_nascimento: number | null; age: number | null; nacionalidade: string; tem_passaporte: boolean;
  main_position: string | null; posicao_secundaria: string | null; dominant_foot: string | null;
  height_cm: number | null; weight_kg: number | null; inicio_carreira: number | null; contract_end_date: string | null;
  contract_status: ContractStatus; current_club_id: string | null; current_club_name: string | null;
  current_club_crest_url: string | null; current_category: string | null; experiencia_internacional: boolean;
  jogos_suspenso: number; agent_id: string | null; claim_status: ClaimStatus; youtube_video_url: string | null;
  total_matches: number; total_minutes: number; total_goals: number; total_assists: number;
  total_yellow_cards: number; total_red_cards: number; total_clean_sheets: number;
  times_played_above_category: number; games_above_current_category: number;
  last_match_date: string | null; is_inactive_30d: boolean;
};

function mapRow(r: ViewRow): AtletaRecord {
  return {
    fbId: Number(r.fb_id),
    fifaId: r.fifa_id,
    name: r.name,
    apelido: r.apelido,
    birthDate: r.birth_date,
    age: r.age,
    anoNascimento: r.ano_nascimento,
    nacionalidade: r.nacionalidade,
    temPassaporte: r.tem_passaporte,
    mainPosition: r.main_position,
    posicaoSecundaria: r.posicao_secundaria,
    dominantFoot: r.dominant_foot,
    heightCm: r.height_cm,
    weightKg: r.weight_kg,
    inicioCarreira: r.inicio_carreira,
    contractEndDate: r.contract_end_date,
    contractStatus: r.contract_status,
    currentClubId: r.current_club_id,
    currentClubName: r.current_club_name?.toUpperCase() ?? null,
    currentClubCrestUrl: r.current_club_crest_url,
    currentCategory: r.current_category,
    experienciaInternacional: r.experiencia_internacional,
    jogosSuspenso: r.jogos_suspenso,
    agentId: r.agent_id,
    claimStatus: r.claim_status,
    youtubeVideoUrl: r.youtube_video_url,
    stats: {
      totalMatches: r.total_matches,
      totalMinutes: r.total_minutes,
      totalGoals: r.total_goals,
      totalAssists: r.total_assists,
      totalYellowCards: r.total_yellow_cards,
      totalRedCards: r.total_red_cards,
      totalCleanSheets: r.total_clean_sheets,
      // `times_played_above_category` compares a match's category against the
      // `player_category` recorded on that SAME appearance — always 0 in practice
      // (every parser records the player as playing in whatever category the
      // match itself is, see supabase/schema.sql's column comment). Every real
      // consumer (Gema filter, comparison tool, prancheta scoring, the dossie's
      // own stat) needs `games_above_current_category` instead — the one that
      // actually compares against the athlete's CURRENT category. Session 55: the
      // "Gema" filter on /atletas silently matched zero athletes because of this.
      timesPlayedAboveCategory: r.games_above_current_category,
      gamesAboveCurrentCategory: r.games_above_current_category,
      lastMatchDate: r.last_match_date,
    },
    isInactive30d: r.is_inactive_30d,
  };
}

export interface AtletasExplorerPage {
  atletas: AtletaRecord[];
  totalCount: number;
}

// `view_atleta_resumo` computes each athlete's stats via a per-row correlated
// subquery (atuacoes_sumula join) — cheap per row, but fetching the WHOLE table
// unbounded stopped scaling once real ingestion pushed this past ~3,000 athletes
// (confirmed live, Session 52: an unpaginated `select` under RLS hit Postgres'
// `statement timeout`, not just "slow" — a hard failure). PostgREST's own
// implicit cap is 1000 rows anyway, so `loadAtletasExplorer` was silently
// truncating even before the timeout showed up. Capped + paginated here instead
// of the old "fetch everything, filter client-side" pattern the mock-data-era
// ClubDirectory/TorneioDirectory pattern assumed (safe at their much smaller
// scale, not at this one). `page` is 0-indexed.
//
// Session 55: dropped from 500 to 20 — the UI shows exactly one page (20 rows)
// at a time now, with real numbered pagination (`AtletasExplorer`) replacing
// the old "carregar mais" accumulation. Each page navigation fetches only the
// 20 rows it needs instead of ever-growing client-side state.
const PAGE_SIZE = 20;

/** "SUB-11".."SUB-20" all share the same "SUB-NN" shape (two digits), so plain
 * string comparison already sorts them correctly — no need for a numeric rank
 * column just to push a category range down into the query. */
function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoDateDaysFromNow(days: number): string {
  return isoDateDaysAgo(-days);
}

/**
 * Pushes `AtletaFilterState` down onto the CHEAP base `atletas` table query
 * (Session 55) — every field the filter UI exposes maps onto a real column
 * there (confirmed against `view_atleta_resumo`'s own definition: every column
 * it adds beyond `atletas` is either a join to `clubes` for display, or a
 * `CASE`/`age()` expression computable from a raw `atletas` column instead).
 * Filtering the base table keeps this on the same "cheap table first, THEN
 * scope the expensive view join to just the resulting page" path the
 * pagination fix already established — filtering the view directly would
 * reintroduce the exact statement-timeout risk that fix exists to avoid.
 *
 * `age` and `expiringContract`/contract status translate into `birth_date`/
 * `contract_end_date` ranges (the view computes them with `age()`/`CASE`
 * expressions PostgREST can't filter on directly, so the equivalent date
 * arithmetic is done here instead — same real boundary, just expressed against
 * the column the CASE expression itself reads from).
 */
function applyAtletaFilters(query: any, f: AtletaFilterState): any {
  let q: any = query;

  if (f.name.trim()) {
    // PostgREST's `.or()` DSL uses "," as a clause separator — strip it from
    // the search term so a name that happens to contain one can't break the
    // filter string (real Portuguese names never legitimately need a comma).
    const term = f.name.trim().replace(/,/g, "");
    q = q.or(`name.ilike.%${term}%,apelido.ilike.%${term}%`);
  }
  if (f.fbId.trim()) {
    const digits = f.fbId.trim().replace(/\D/g, "");
    if (digits) {
      // Approximates the old client-side "contains anywhere" as "starts with"
      // instead — PostgREST can't pattern-match a bigint column directly (no
      // text cast available through the filter API), but a numeric range does
      // the same job for the real, overwhelmingly common case of searching an
      // fb_id you already know from its first digits.
      //
      // fb_ids come in two known widths today (6-digit CBF-style bids; 9-digit
      // internally-allocated ones — see provisional-athlete.ts's
      // PROVISIONAL_BID_FLOOR) — this used to hardcode a minimum width of 6,
      // so a short query like "9" only ever matched a 6-digit range and could
      // never find a provisional athlete. Build one prefix range per known
      // width that's still >= what was typed, and OR them — same `.or()`
      // pattern already used by the name filter above.
      const KNOWN_WIDTHS = [6, 9];
      const widths = KNOWN_WIDTHS.filter((w) => w >= digits.length);
      const ranges = (widths.length > 0 ? widths : [digits.length]).map((width) => {
        const lo = Number(digits.padEnd(width, "0"));
        const hi = lo + 10 ** (width - digits.length);
        return `and(fb_id.gte.${lo},fb_id.lt.${hi})`;
      });
      q = q.or(ranges.join(","));
    }
  }

  if (f.categoryMode === "exact") {
    if (f.categoryExact) q = q.eq("current_category", f.categoryExact);
  } else {
    if (f.categoryFrom) q = q.gte("current_category", f.categoryFrom);
    if (f.categoryTo) q = q.lte("current_category", f.categoryTo);
  }

  const ageToDates = (age: number): { min: string; max: string } => ({
    min: isoDateDaysAgo((age + 1) * 365.25),
    max: isoDateDaysAgo(age * 365.25),
  });
  if (f.ageMode === "exact") {
    const e = num(f.ageExact);
    if (e !== null) {
      const { min, max } = ageToDates(e);
      q = q.gt("birth_date", min).lte("birth_date", max);
    }
  } else {
    const from = num(f.ageFrom);
    const to = num(f.ageTo);
    if (to !== null) q = q.gt("birth_date", ageToDates(to).min);
    if (from !== null) q = q.lte("birth_date", ageToDates(from).max);
  }

  if (f.heightMode === "exact") {
    const e = num(f.heightExact);
    if (e !== null) q = q.eq("height_cm", e);
  } else {
    const from = num(f.heightFrom);
    const to = num(f.heightTo);
    if (from !== null) q = q.gte("height_cm", from);
    if (to !== null) q = q.lte("height_cm", to);
  }

  if (f.nationality) q = q.eq("nacionalidade", f.nationality);
  if (f.foot) q = q.eq("dominant_foot", f.foot);
  if (f.position) q = q.eq("main_position", f.position);
  if (f.secondaryPosition) q = q.eq("posicao_secundaria", f.secondaryPosition);
  const wFrom = num(f.weightFrom);
  const wTo = num(f.weightTo);
  if (wFrom !== null) q = q.gte("weight_kg", wFrom);
  if (wTo !== null) q = q.lte("weight_kg", wTo);

  const mMatches = num(f.minMatches);
  const mMinutes = num(f.minMinutes);
  const mGoals = num(f.minGoals);
  const mAssists = num(f.minAssists);
  if (mMatches !== null) q = q.gte("total_matches", mMatches);
  if (mMinutes !== null) q = q.gte("total_minutes", mMinutes);
  if (mGoals !== null) q = q.gte("total_goals", mGoals);
  if (mAssists !== null) q = q.gte("total_assists", mAssists);
  if (f.gema) q = q.gt("games_above_current_category", 0);
  if (f.hasVideo) q = q.not("youtube_video_url", "is", null);

  if (f.passport === "yes") q = q.eq("tem_passaporte", true);
  if (f.passport === "no") q = q.eq("tem_passaporte", false);
  if (f.hasAgent === "yes") q = q.not("agent_id", "is", null);
  if (f.hasAgent === "no") q = q.is("agent_id", null);
  if (f.international) q = q.eq("experiencia_internacional", true);
  if (f.expiringContract) q = q.gte("contract_end_date", isoDateDaysAgo(0)).lte("contract_end_date", isoDateDaysFromNow(180));

  return q;
}

export async function loadAtletasExplorer(client: SupabaseClient, page = 0, filters?: AtletaFilterState): Promise<AtletasExplorerPage> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Paginating `view_atleta_resumo` directly (`.order("name").range(...)`) timed
  // out even at 50 rows (confirmed live, Session 52) — the ORDER BY can't be
  // pushed down through the view's per-athlete LATERAL stats join under RLS, so
  // Postgres was computing (and RLS-checking, across atuacoes_sumula/
  // partidas_sumula/clubes) EVERY one of the 3,000+ athletes' stats before it
  // could sort and slice out a page, regardless of how small the page was. Fixed
  // by paginating the cheap base table first (plain `atletas`, no join) to get
  // just this page's bids, THEN asking the view for full stats scoped to only
  // those bids via `.in(...)` — bounds the expensive join to page-size rows.
  //
  // Session 55: `filters` is applied to THIS cheap base-table query (via
  // `applyAtletaFilters`) — the filter/search UI used to only ever narrow the
  // current 20-row page client-side, so a rare condition like "Gema" almost
  // always came back empty even though real matches existed elsewhere in the
  // other 465 pages. Filtering here instead searches the real ~9,300-athlete
  // table and paginates the FILTERED result set.
  let idQuery = client.from("atletas").select("fb_id").order("name").range(from, to);
  let countQuery = client.from("atletas").select("fb_id", { count: "exact", head: true });
  if (filters) {
    idQuery = applyAtletaFilters(idQuery, filters);
    countQuery = applyAtletaFilters(countQuery, filters);
  }

  const [idPage, countRes] = await Promise.all([idQuery, countQuery]);
  if (idPage.error) throw idPage.error;
  if (countRes.error) throw countRes.error;
  const bids = (idPage.data ?? []).map((r) => Number(r.fb_id));

  const pageRes =
    bids.length > 0
      ? await client.from("view_atleta_resumo").select(VIEW_COLUMNS).in("fb_id", bids)
      : { data: [] as ViewRow[], error: null };
  if (pageRes.error) throw pageRes.error;

  // `.in(...)` doesn't preserve the `order("name")` from the id page — re-sort
  // the stats rows back into the same order the bids were fetched in.
  const order = new Map(bids.map((b, i) => [b, i]));
  const atletas = (pageRes.data as unknown as ViewRow[]).map(mapRow).sort((a, b) => (order.get(a.fbId) ?? 0) - (order.get(b.fbId) ?? 0));
  return { atletas, totalCount: countRes.count ?? 0 };
}

/** Small, explicit fbId list (comparison feature: max 3) — cheap enough to hit
 * the full stats view directly, unlike the unbounded explorer list. */
export async function loadAtletasByBids(client: SupabaseClient, bids: number[]): Promise<AtletaRecord[]> {
  if (bids.length === 0) return [];
  const { data, error } = await client.from("view_atleta_resumo").select(VIEW_COLUMNS).in("fb_id", bids);
  if (error) throw error;
  const order = new Map(bids.map((b, i) => [b, i]));
  return (data as unknown as ViewRow[]).map(mapRow).sort((a, b) => (order.get(a.fbId) ?? 0) - (order.get(b.fbId) ?? 0));
}

export async function loadAtletaDossie(client: SupabaseClient, fbId: number): Promise<AtletaRecord | null> {
  const { data, error } = await client.from("view_atleta_resumo").select(VIEW_COLUMNS).eq("fb_id", fbId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as unknown as ViewRow) : null;
}

export interface AgenteContactRecord {
  fullName: string;
  agencyName: string | null;
  licenseLevel: string | null;
  markets: string[];
  instagram: string | null;
  phone: string | null;
  contactEmail: string | null;
}

export async function loadAgenteContact(client: SupabaseClient, agentId: string): Promise<AgenteContactRecord | null> {
  const { data, error } = await client
    .from("agentes")
    .select("full_name,agency_name,license_level,markets,instagram,phone,contact_email")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    fullName: data.full_name,
    agencyName: data.agency_name,
    licenseLevel: data.license_level,
    markets: data.markets ?? [],
    instagram: data.instagram,
    phone: data.phone,
    contactEmail: data.contact_email,
  };
}

export interface EvolucaoPoint {
  label: string; // "DD/MM"
  value: number; // 0-100 per-match performance index — real, never fabricated
}

/**
 * Real per-match evolution: one point per actual súmula the athlete appeared
 * in, ordered by date, weighted the same way as `computePerformanceIndex` but
 * per-match instead of averaged — never a fabricated multi-point series like
 * the old mock-era chart (reported live by the user, Session 52: an athlete
 * with exactly 1 real match was shown a 6-point trending "evolution" line).
 * Empty/single-match athletes just get fewer points; nothing is invented to
 * fill a fixed chart width.
 */
export async function loadEvolucaoReal(client: SupabaseClient, fbId: number, limit = 10): Promise<EvolucaoPoint[]> {
  // `.order("match_date", { referencedTable: ... })` on an embedded/joined table
  // is silently ignored by the installed supabase-js/PostgREST combo (confirmed
  // live, Session 52 — rows came back in an unrelated order despite the option).
  // A single athlete's own appearance count is always small (never the
  // thousands-of-rows scale that forced pagination workarounds elsewhere), so
  // fetching all of them and sorting client-side is simple and safe.
  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("minutes_played,goals,assists,yellow_cards,red_cards,clean_sheet,partidas_sumula!inner(match_date)")
    .eq("fb_id_atleta", fbId);
  if (error) throw error;

  const sorted = [...(data ?? [])].sort((a: any, b: any) =>
    String(a.partidas_sumula?.match_date ?? "").localeCompare(String(b.partidas_sumula?.match_date ?? "")),
  );
  const recent = sorted.slice(-limit);

  return recent.map((r: any) => {
    const minutesRatio = Math.min(1, (r.minutes_played ?? 0) / 90);
    const raw =
      42 +
      (r.goals ?? 0) * 30 +
      (r.assists ?? 0) * 20 +
      minutesRatio * 15 +
      (r.clean_sheet ? 25 : 0) -
      (r.red_cards ?? 0) * 20 -
      (r.yellow_cards ?? 0) * 4;
    const value = Math.round(Math.max(20, Math.min(99, raw)));
    const date: string | undefined = r.partidas_sumula?.match_date;
    const label = date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : "—";
    return { label, value };
  });
}

// Same ranks as the `categoria_ordem` table (supabase/schema.sql) — kept in
// sync manually since this runs client-side, not as a DB round-trip per
// candidate.
const CATEGORIA_RANK: Record<string, number> = {
  "SUB-11": 1, "SUB-12": 2, "SUB-13": 3, "SUB-14": 4, "SUB-15": 5,
  "SUB-16": 6, "SUB-17": 7, "SUB-18": 8, "SUB-19": 9, "SUB-20": 10,
};

export interface RecentStats {
  totalMatches: number;
  totalMinutes: number;
  totalGoals: number;
  totalAssists: number;
  totalYellowCards: number;
  totalRedCards: number;
  totalCleanSheets: number;
  timesPlayedAboveCategory: number;
}

const EMPTY_RECENT_STATS: RecentStats = {
  totalMatches: 0, totalMinutes: 0, totalGoals: 0, totalAssists: 0,
  totalYellowCards: 0, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0,
};

/**
 * Each athlete's stats over just their most recent `limit` appearances (not
 * the season aggregate on `atletas`/`view_atleta_resumo`) — used by the
 * tactical board's ranking (Session 55: switched from season-to-date to
 * "últimos 5 jogos" per explicit user request, so a player's current form
 * outweighs a strong start to the season they've since fallen off from).
 * One batched query for every requested fbId (never N+1) — a single
 * favorited athlete's own appearance count is always small, so fetching all
 * of them and taking the most recent `limit` client-side is simple and safe,
 * same approach as `loadEvolucaoReal`.
 *
 * `currentCategoryByBid` is required to compute `timesPlayedAboveCategory`
 * correctly (Session 55 fix): comparing a match's category against the
 * `player_category` recorded on that SAME appearance is always false (every
 * parser records the player as playing in whatever category the match itself
 * is — same dead-column bug documented on `atletas.times_played_above_category`
 * in supabase/schema.sql). The real comparison is against the athlete's
 * CURRENT category, same semantics as `games_above_current_category`.
 */
export async function loadRecentStatsByBids(
  client: SupabaseClient,
  bids: number[],
  currentCategoryByBid: Map<number, string | null>,
  limit = 5,
): Promise<Map<number, RecentStats>> {
  const result = new Map<number, RecentStats>();
  if (bids.length === 0) return result;

  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("fb_id_atleta,minutes_played,goals,assists,yellow_cards,red_cards,clean_sheet,partidas_sumula!inner(match_date,match_category)")
    .in("fb_id_atleta", bids);
  if (error) throw error;

  const byBid = new Map<number, any[]>();
  for (const row of data ?? []) {
    const list = byBid.get(row.fb_id_atleta) ?? [];
    list.push(row);
    byBid.set(row.fb_id_atleta, list);
  }

  for (const fbId of bids) {
    const rows = (byBid.get(fbId) ?? [])
      .slice()
      .sort((a, b) => String(b.partidas_sumula?.match_date ?? "").localeCompare(String(a.partidas_sumula?.match_date ?? "")))
      .slice(0, limit);

    const currentRank = CATEGORIA_RANK[currentCategoryByBid.get(fbId) ?? ""];
    const stats: RecentStats = { ...EMPTY_RECENT_STATS, totalMatches: rows.length };
    for (const r of rows) {
      stats.totalMinutes += r.minutes_played ?? 0;
      stats.totalGoals += r.goals ?? 0;
      stats.totalAssists += r.assists ?? 0;
      stats.totalYellowCards += r.yellow_cards ?? 0;
      stats.totalRedCards += r.red_cards ?? 0;
      if (r.clean_sheet) stats.totalCleanSheets += 1;
      const matchRank = CATEGORIA_RANK[r.partidas_sumula?.match_category ?? ""];
      if (matchRank != null && currentRank != null && matchRank > currentRank) stats.timesPlayedAboveCategory += 1;
    }
    result.set(fbId, stats);
  }
  return result;
}

export interface CategoriaAcimaMatch {
  matchDate: string;
  matchCategory: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
}

/**
 * Every real match this one athlete played whose category outranks their
 * CURRENT category (`atletas.current_category`) — the per-match detail
 * behind the precomputed `games_above_current_category` count (Session 55).
 * Single-athlete scale, same "fetch all, filter client-side" approach as
 * `loadEvolucaoReal`.
 */
export async function loadCategoriaAcimaMatches(client: SupabaseClient, fbId: number, currentCategory: string | null): Promise<CategoriaAcimaMatch[]> {
  if (!currentCategory) return [];
  const currentRank = CATEGORIA_RANK[currentCategory];
  if (currentRank == null) return [];

  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("minutes_played,goals,assists,partidas_sumula!inner(match_date,match_category)")
    .eq("fb_id_atleta", fbId);
  if (error) throw error;

  return (data as any[] ?? [])
    .filter((r) => (CATEGORIA_RANK[r.partidas_sumula?.match_category ?? ""] ?? 0) > currentRank)
    .map((r) => ({
      matchDate: r.partidas_sumula.match_date,
      matchCategory: r.partidas_sumula.match_category,
      minutesPlayed: r.minutes_played ?? 0,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
    }))
    .sort((a, b) => b.matchDate.localeCompare(a.matchDate));
}

export interface CardDetail {
  type: "yellow" | "red";
  reason: string | null;
}

export interface CardEvent {
  matchDate: string;
  matchCategory: string;
  yellowCards: number;
  redCards: number;
  cards: CardDetail[];
}

/** Every real match where this athlete picked up at least one card —
 * powers the dossiê's scrollable disciplinary-history card (Session 55).
 * `cards` carries the real "Motivo:" text straight from the súmula
 * (`atuacao_cartoes`, Session 55) when the parser captured one — a card can
 * still show up with `reason: null` for matches ingested before that parser
 * change (historically backfilled where the PDF was still fetchable, but not
 * every source/match could be recovered). */
export async function loadCardEvents(client: SupabaseClient, fbId: number): Promise<CardEvent[]> {
  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("yellow_cards,red_cards,partidas_sumula!inner(match_date,match_category),atuacao_cartoes(card_type,reason)")
    .eq("fb_id_atleta", fbId)
    .or("yellow_cards.gt.0,red_cards.gt.0");
  if (error) throw error;

  return (data as any[] ?? [])
    .map((r) => {
      const reasonsByType = new Map<string, (string | null)[]>();
      for (const c of (r.atuacao_cartoes ?? []) as { card_type: "yellow" | "red"; reason: string | null }[]) {
        (reasonsByType.get(c.card_type) ?? reasonsByType.set(c.card_type, []).get(c.card_type)!).push(c.reason);
      }
      const yellowCards = r.yellow_cards ?? 0;
      const redCards = r.red_cards ?? 0;
      const cards: CardDetail[] = [
        ...Array.from({ length: yellowCards }, (_, i) => ({ type: "yellow" as const, reason: reasonsByType.get("yellow")?.[i] ?? null })),
        ...Array.from({ length: redCards }, (_, i) => ({ type: "red" as const, reason: reasonsByType.get("red")?.[i] ?? null })),
      ];
      return {
        matchDate: r.partidas_sumula.match_date,
        matchCategory: r.partidas_sumula.match_category,
        yellowCards,
        redCards,
        cards,
      };
    })
    .sort((a, b) => b.matchDate.localeCompare(a.matchDate));
}

export interface MatchHistoryEntry {
  matchDate: string;
  matchCategory: string;
  opponentName: string | null;
}

/**
 * Every real match this athlete appeared in — category, opponent club, and date
 * (Session 55). Broader than `loadCategoriaAcimaMatches` (which only covers
 * matches above the CURRENT category): this covers every category the athlete
 * has ever played.
 *
 * The opponent is derived from `atuacoes_sumula.club_id` (which club THIS
 * appearance was for, Session 55) against `partidas_sumula.home_club_id`/
 * `away_club_id` — whichever of the two isn't the athlete's own club. Matches
 * ingested before that column existed (and any not yet backfilled/resolved)
 * have `club_id: null`, so `opponentName` is `null` for those rather than a
 * guessed value.
 */
export async function loadMatchHistory(client: SupabaseClient, fbId: number): Promise<MatchHistoryEntry[]> {
  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("club_id,partidas_sumula!inner(match_date,match_category,home_club_id,away_club_id)")
    .eq("fb_id_atleta", fbId);
  if (error) throw error;

  const rows = (data as any[]) ?? [];
  const opponentIdFor = (r: any): string | null => {
    const p = r.partidas_sumula;
    if (!r.club_id) return null;
    if (r.club_id === p.home_club_id) return p.away_club_id;
    if (r.club_id === p.away_club_id) return p.home_club_id;
    return null;
  };

  const opponentIds = new Set<string>();
  for (const r of rows) {
    const id = opponentIdFor(r);
    if (id) opponentIds.add(id);
  }

  let nameById = new Map<string, string>();
  if (opponentIds.size > 0) {
    const { data: clubs } = await client.from("clubes").select("id,name").in("id", [...opponentIds]);
    nameById = new Map((clubs ?? []).map((c) => [c.id as string, c.name as string]));
  }

  return rows
    .map((r) => {
      const opponentId = opponentIdFor(r);
      return {
        matchDate: r.partidas_sumula.match_date,
        matchCategory: r.partidas_sumula.match_category,
        opponentName: opponentId ? (nameById.get(opponentId) ?? null) : null,
      };
    })
    .sort((a, b) => b.matchDate.localeCompare(a.matchDate));
}

export interface ClubHistoryEntry {
  clubId: string;
  clubName: string;
  crestUrl: string | null;
  from: number | null; // year of the earliest real appearance found for this club
  to: number | null; // year of the latest real appearance, or null when it's the athlete's current club
}

/**
 * Real club history derived from `atuacoes_sumula.club_id` (which of the
 * match's two clubs each appearance was for) grouped per club, with the
 * earliest/latest match year found for each — replaces the old
 * `lib/atleta-extra.ts` mock (a hardcoded table for a handful of pre-scraping
 * fbIds, falling back to a single fabricated "current club since birth-year+14"
 * entry for every real athlete). Confirmed live (Session 57): a real athlete
 * transferred between clubs (Cuiabá → Palmeiras) showed only "Palmeiras -
 * atual" in the UI because the mock never looked at real appearance data at
 * all. The athlete's OWN current club (`current_club_id`) always gets `to:
 * null` (still active), even if their most recent appearance on record
 * predates today — every other club gets the real year of its last known
 * appearance, never a guess.
 */
export async function loadClubHistory(client: SupabaseClient, fbId: number, currentClubId: string | null): Promise<ClubHistoryEntry[]> {
  const { data, error } = await client.from("atuacoes_sumula").select("club_id,partidas_sumula!inner(match_date)").eq("fb_id_atleta", fbId);
  if (error) throw error;

  const rows = ((data as any[]) ?? []).filter((r) => r.club_id);
  const range = new Map<string, { from: string; to: string }>();
  for (const r of rows) {
    const date = r.partidas_sumula.match_date as string;
    const existing = range.get(r.club_id);
    if (!existing) range.set(r.club_id, { from: date, to: date });
    else {
      if (date < existing.from) existing.from = date;
      if (date > existing.to) existing.to = date;
    }
  }
  if (range.size === 0) return [];

  const { data: clubs, error: clubsError } = await client.from("clubes").select("id,name,webp_crest_url").in("id", [...range.keys()]);
  if (clubsError) throw clubsError;
  const clubById = new Map((clubs ?? []).map((c) => [c.id as string, c]));

  return [...range.entries()]
    .map(([clubId, { from, to }]) => {
      const club = clubById.get(clubId);
      return {
        clubId,
        clubName: (club?.name as string) ?? clubId,
        crestUrl: (club?.webp_crest_url as string | null) ?? null,
        from: Number(from.slice(0, 4)),
        to: clubId === currentClubId ? null : Number(to.slice(0, 4)),
      };
    })
    .sort((a, b) => {
      // Current club (to === null) always first; the rest most-recent-first.
      if (a.to === null && b.to !== null) return -1;
      if (b.to === null && a.to !== null) return 1;
      return (b.to ?? b.from ?? 0) - (a.to ?? a.from ?? 0);
    });
}

export interface ConquistaRecord {
  id: string;
  tipo: "titulo" | "premio";
  descricao: string;
  ano: number | null;
}

/** Empty for every real athlete today — `conquistas` is admin-curated, not
 * scraped from any súmula, and no admin tooling writes to it yet. Querying the
 * real (empty) table instead of the old mock fixtures so the dossiê never shows
 * a trophy that doesn't exist. */
export async function loadConquistas(client: SupabaseClient, fbId: number): Promise<ConquistaRecord[]> {
  const { data, error } = await client.from("conquistas").select("id,tipo,descricao,ano").eq("fb_id_atleta", fbId).order("ano", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConquistaRecord[];
}

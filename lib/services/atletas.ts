import type { SupabaseClient } from "@supabase/supabase-js";

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
  lastMatchDate: string | null;
}

export interface AtletaRecord {
  bid: number;
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
  "bid,fifa_id,name,apelido,birth_date,ano_nascimento,age,nacionalidade,tem_passaporte,main_position,posicao_secundaria," +
  "dominant_foot,height_cm,weight_kg,inicio_carreira,contract_end_date,contract_status,current_club_id,current_club_name," +
  "current_club_crest_url,current_category,experiencia_internacional,jogos_suspenso,agent_id,claim_status,youtube_video_url," +
  "total_matches,total_minutes,total_goals,total_assists,total_yellow_cards,total_red_cards,total_clean_sheets," +
  "times_played_above_category,last_match_date,is_inactive_30d";

type ViewRow = {
  bid: number; fifa_id: string | null; name: string; apelido: string | null; birth_date: string | null;
  ano_nascimento: number | null; age: number | null; nacionalidade: string; tem_passaporte: boolean;
  main_position: string | null; posicao_secundaria: string | null; dominant_foot: string | null;
  height_cm: number | null; weight_kg: number | null; inicio_carreira: number | null; contract_end_date: string | null;
  contract_status: ContractStatus; current_club_id: string | null; current_club_name: string | null;
  current_club_crest_url: string | null; current_category: string | null; experiencia_internacional: boolean;
  jogos_suspenso: number; agent_id: string | null; claim_status: ClaimStatus; youtube_video_url: string | null;
  total_matches: number; total_minutes: number; total_goals: number; total_assists: number;
  total_yellow_cards: number; total_red_cards: number; total_clean_sheets: number;
  times_played_above_category: number; last_match_date: string | null; is_inactive_30d: boolean;
};

function mapRow(r: ViewRow): AtletaRecord {
  return {
    bid: Number(r.bid),
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
      timesPlayedAboveCategory: r.times_played_above_category,
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

export async function loadAtletasExplorer(client: SupabaseClient, page = 0): Promise<AtletasExplorerPage> {
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
  const idPage = await client.from("atletas").select("bid").order("name").range(from, to);
  if (idPage.error) throw idPage.error;
  const bids = (idPage.data ?? []).map((r) => Number(r.bid));

  const [pageRes, countRes] = await Promise.all([
    bids.length > 0
      ? client.from("view_atleta_resumo").select(VIEW_COLUMNS).in("bid", bids)
      : Promise.resolve({ data: [] as ViewRow[], error: null }),
    client.from("atletas").select("bid", { count: "exact", head: true }),
  ]);
  if (pageRes.error) throw pageRes.error;
  if (countRes.error) throw countRes.error;

  // `.in(...)` doesn't preserve the `order("name")` from the id page — re-sort
  // the stats rows back into the same order the bids were fetched in.
  const order = new Map(bids.map((b, i) => [b, i]));
  const atletas = (pageRes.data as unknown as ViewRow[]).map(mapRow).sort((a, b) => (order.get(a.bid) ?? 0) - (order.get(b.bid) ?? 0));
  return { atletas, totalCount: countRes.count ?? 0 };
}

/** Small, explicit bid list (comparison feature: max 3) — cheap enough to hit
 * the full stats view directly, unlike the unbounded explorer list. */
export async function loadAtletasByBids(client: SupabaseClient, bids: number[]): Promise<AtletaRecord[]> {
  if (bids.length === 0) return [];
  const { data, error } = await client.from("view_atleta_resumo").select(VIEW_COLUMNS).in("bid", bids);
  if (error) throw error;
  const order = new Map(bids.map((b, i) => [b, i]));
  return (data as unknown as ViewRow[]).map(mapRow).sort((a, b) => (order.get(a.bid) ?? 0) - (order.get(b.bid) ?? 0));
}

export async function loadAtletaDossie(client: SupabaseClient, bid: number): Promise<AtletaRecord | null> {
  const { data, error } = await client.from("view_atleta_resumo").select(VIEW_COLUMNS).eq("bid", bid).maybeSingle();
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
export async function loadEvolucaoReal(client: SupabaseClient, bid: number, limit = 10): Promise<EvolucaoPoint[]> {
  // `.order("match_date", { referencedTable: ... })` on an embedded/joined table
  // is silently ignored by the installed supabase-js/PostgREST combo (confirmed
  // live, Session 52 — rows came back in an unrelated order despite the option).
  // A single athlete's own appearance count is always small (never the
  // thousands-of-rows scale that forced pagination workarounds elsewhere), so
  // fetching all of them and sorting client-side is simple and safe.
  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("minutes_played,goals,assists,yellow_cards,red_cards,clean_sheet,partidas_sumula!inner(match_date)")
    .eq("bid_atleta", bid);
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
 * One batched query for every requested bid (never N+1) — a single
 * favorited athlete's own appearance count is always small, so fetching all
 * of them and taking the most recent `limit` client-side is simple and safe,
 * same approach as `loadEvolucaoReal`.
 */
export async function loadRecentStatsByBids(client: SupabaseClient, bids: number[], limit = 5): Promise<Map<number, RecentStats>> {
  const result = new Map<number, RecentStats>();
  if (bids.length === 0) return result;

  const { data, error } = await client
    .from("atuacoes_sumula")
    .select("bid_atleta,minutes_played,goals,assists,yellow_cards,red_cards,clean_sheet,player_category,partidas_sumula!inner(match_date,match_category)")
    .in("bid_atleta", bids);
  if (error) throw error;

  const byBid = new Map<number, any[]>();
  for (const row of data ?? []) {
    const list = byBid.get(row.bid_atleta) ?? [];
    list.push(row);
    byBid.set(row.bid_atleta, list);
  }

  for (const bid of bids) {
    const rows = (byBid.get(bid) ?? [])
      .slice()
      .sort((a, b) => String(b.partidas_sumula?.match_date ?? "").localeCompare(String(a.partidas_sumula?.match_date ?? "")))
      .slice(0, limit);

    const stats: RecentStats = { ...EMPTY_RECENT_STATS, totalMatches: rows.length };
    for (const r of rows) {
      stats.totalMinutes += r.minutes_played ?? 0;
      stats.totalGoals += r.goals ?? 0;
      stats.totalAssists += r.assists ?? 0;
      stats.totalYellowCards += r.yellow_cards ?? 0;
      stats.totalRedCards += r.red_cards ?? 0;
      if (r.clean_sheet) stats.totalCleanSheets += 1;
      const matchRank = CATEGORIA_RANK[r.partidas_sumula?.match_category ?? ""];
      const playerRank = CATEGORIA_RANK[r.player_category ?? ""];
      if (matchRank != null && playerRank != null && matchRank > playerRank) stats.timesPlayedAboveCategory += 1;
    }
    result.set(bid, stats);
  }
  return result;
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
export async function loadConquistas(client: SupabaseClient, bid: number): Promise<ConquistaRecord[]> {
  const { data, error } = await client.from("conquistas").select("id,tipo,descricao,ano").eq("bid_atleta", bid).order("ano", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConquistaRecord[];
}

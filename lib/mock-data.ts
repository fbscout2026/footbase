// ============================================================================
// FOOTBASE — Centralized mock data (v3.0 Caso de Uso)
// ----------------------------------------------------------------------------
// Prototypes the internal UI (dashboard, search, player dossier, comparison,
// tactical board, agent panel, club pages) before the live Supabase tables are
// seeded. Shapes mirror `supabase/schema.sql` (camelCase here for TS
// ergonomics). Derived fields (age, anoNascimento, contractStatus,
// isInactive30d, temPassaporte, experienciaInternacional) are computed against
// REFERENCE_DATE so the fixtures stay deterministic regardless of run time.
// ============================================================================

// Full youth range: CBF national tends to use the odd categories + SUB-20, but state
// federations (FPF, FERJ, …) also run the even ones (SUB-12/14/16/18) and SUB-19.
export type Categoria =
  | "SUB-11" | "SUB-12" | "SUB-13" | "SUB-14" | "SUB-15"
  | "SUB-16" | "SUB-17" | "SUB-18" | "SUB-19" | "SUB-20";
export type Position =
  | "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";
export type DominantFoot = "left" | "right" | "both";
export type ContractStatus = "active" | "expiring_soon" | "expired" | "free_agent";
export type ClaimStatus = "unclaimed" | "pending" | "claimed";

/** Fixed "today" so all derived flags below are reproducible. */
export const REFERENCE_DATE = "2026-08-10";

// ----------------------------------------------------------------------------
// Clubs (compressed .webp crests, max 120x120 — see CLAUDE.md media rules)
// ----------------------------------------------------------------------------
export interface MockClube {
  id: string;
  name: string;
  state: string;
  federacao: string; // state federation the club plays under
  webpCrestUrl: string;
  reivindicadoPor: string | null; // user id of the claiming representative
  claimStatus: ClaimStatus;
}

export const mockClubes: MockClube[] = [
  // Flamengo already claimed by a club representative; the rest are unclaimed
  // seed profiles (born from ingestion), one pending review.
  { id: "club-fla", name: "Flamengo", state: "RJ", federacao: "FERJ", webpCrestUrl: "/crests/flamengo.webp", reivindicadoPor: "user-club-fla", claimStatus: "claimed" },
  { id: "club-pal", name: "Palmeiras", state: "SP", federacao: "FPF", webpCrestUrl: "/crests/palmeiras.webp", reivindicadoPor: null, claimStatus: "pending" },
  { id: "club-vas", name: "Vasco da Gama", state: "RJ", federacao: "FERJ", webpCrestUrl: "/crests/vasco.webp", reivindicadoPor: null, claimStatus: "unclaimed" },
  { id: "club-flu", name: "Fluminense", state: "RJ", federacao: "FERJ", webpCrestUrl: "/crests/fluminense.webp", reivindicadoPor: null, claimStatus: "unclaimed" },
  { id: "club-san", name: "Santos", state: "SP", federacao: "FPF", webpCrestUrl: "/crests/santos.webp", reivindicadoPor: null, claimStatus: "unclaimed" },
];

// ----------------------------------------------------------------------------
// Tournaments
// ----------------------------------------------------------------------------
export interface MockTorneio {
  id: string;
  name: string;
  federation: string;
  category: Categoria;
  year: number;
}

export const mockTorneios: MockTorneio[] = [
  { id: "trn-bra-sub20", name: "Brasileirão SUB-20", federation: "CBF", category: "SUB-20", year: 2026 },
  { id: "trn-cdb-sub20", name: "Copa do Brasil SUB-20", federation: "CBF", category: "SUB-20", year: 2026 },
  { id: "trn-cdb-sub17", name: "Copa do Brasil SUB-17", federation: "CBF", category: "SUB-17", year: 2026 },
  { id: "trn-copinha", name: "Copa São Paulo de Futebol Júnior (Copinha)", federation: "FPF", category: "SUB-20", year: 2026 },
];

// ----------------------------------------------------------------------------
// Athletes
// ----------------------------------------------------------------------------
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

export interface MockAtleta {
  bid: number;
  fifaId: string | null;
  name: string;
  apelido: string | null;
  birthDate: string;
  age: number;
  anoNascimento: number;
  nacionalidade: string;
  temPassaporte: boolean;
  passaporte: string | null;
  mainPosition: Position;
  posicaoSecundaria: Position | null;
  dominantFoot: DominantFoot;
  heightCm: number;
  weightKg: number;
  inicioCarreira: number | null;
  contractEndDate: string | null;
  contractStatus: ContractStatus;
  currentClubId: string;
  currentCategory: Categoria;
  experienciaInternacional: boolean;
  jogosSuspenso: number;
  agentId: string | null;
  claimStatus: ClaimStatus;
  youtubeVideoUrl: string | null;
  stats: AtletaStats;
  isInactive30d: boolean;
}

// Raw input: the v3.0 biographic fields are optional and defaulted in
// buildAtleta so the fixtures below stay compact; override only where it adds
// signal (nickname, passport, secondary position, suspensions, etc.).
type RawAtleta = Omit<
  MockAtleta,
  | "age"
  | "anoNascimento"
  | "contractStatus"
  | "isInactive30d"
  | "apelido"
  | "nacionalidade"
  | "temPassaporte"
  | "posicaoSecundaria"
  | "inicioCarreira"
  | "experienciaInternacional"
  | "jogosSuspenso"
> & {
  apelido?: string;
  nacionalidade?: string;
  temPassaporte?: boolean;
  posicaoSecundaria?: Position;
  inicioCarreira?: number;
  experienciaInternacional?: boolean;
  jogosSuspenso?: number;
};

// ---- derivation helpers ----------------------------------------------------
function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(ms / 86_400_000);
}

function computeAge(birthDate: string): number {
  const b = new Date(birthDate);
  const r = new Date(REFERENCE_DATE);
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return age;
}

function computeContractStatus(end: string | null): ContractStatus {
  if (!end) return "free_agent";
  const diff = daysBetween(REFERENCE_DATE, end);
  if (diff < 0) return "expired";
  if (diff <= 180) return "expiring_soon"; // "< 6 months"
  return "active";
}

function computeInactive(lastMatchDate: string | null): boolean {
  if (!lastMatchDate) return true;
  return daysBetween(lastMatchDate, REFERENCE_DATE) > 30;
}

function buildAtleta(raw: RawAtleta): MockAtleta {
  const passaporte = raw.passaporte ?? null;
  return {
    ...raw,
    apelido: raw.apelido ?? null,
    nacionalidade: raw.nacionalidade ?? "Brasileiro",
    passaporte,
    temPassaporte: raw.temPassaporte ?? passaporte !== null,
    posicaoSecundaria: raw.posicaoSecundaria ?? null,
    inicioCarreira: raw.inicioCarreira ?? null,
    experienciaInternacional: raw.experienciaInternacional ?? raw.fifaId !== null,
    jogosSuspenso: raw.jogosSuspenso ?? 0,
    age: computeAge(raw.birthDate),
    anoNascimento: new Date(raw.birthDate).getFullYear(),
    contractStatus: computeContractStatus(raw.contractEndDate),
    isInactive30d: computeInactive(raw.stats.lastMatchDate),
  };
}

const rawAtletas: RawAtleta[] = [
  // ---- Starting XI (4-3-3) -------------------------------------------------
  {
    bid: 2210045, fifaId: null, passaporte: null, name: "Lucas Pereira",
    birthDate: "2006-03-14", mainPosition: "GK", dominantFoot: "right",
    heightCm: 190, weightKg: 82, contractEndDate: "2028-06-30",
    currentClubId: "club-fla", currentCategory: "SUB-20", agentId: "agent-01",
    claimStatus: "claimed", youtubeVideoUrl: "https://youtu.be/fb-lucas-pereira",
    stats: { totalMatches: 22, totalMinutes: 1980, totalGoals: 0, totalAssists: 0, totalYellowCards: 2, totalRedCards: 0, totalCleanSheets: 11, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-03" },
  },
  {
    bid: 2210101, fifaId: null, passaporte: null, name: "Rafael Lima",
    birthDate: "2006-07-22", mainPosition: "RB", dominantFoot: "right",
    heightCm: 178, weightKg: 71, contractEndDate: "2026-12-15", // expiring soon
    currentClubId: "club-fla", currentCategory: "SUB-20", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    stats: { totalMatches: 20, totalMinutes: 1750, totalGoals: 1, totalAssists: 5, totalYellowCards: 4, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-03" },
  },
  {
    bid: 2209888, fifaId: "FIFA-BR-209888", passaporte: "Italiano", name: "João Vitor",
    apelido: "JV", nacionalidade: "Brasileiro / Italiano", posicaoSecundaria: "DM", inicioCarreira: 2018,
    birthDate: "2006-01-09", mainPosition: "CB", dominantFoot: "right",
    heightCm: 187, weightKg: 79, contractEndDate: "2028-12-31",
    currentClubId: "club-pal", currentCategory: "SUB-20", agentId: "agent-02",
    claimStatus: "claimed", youtubeVideoUrl: "https://youtu.be/fb-joao-vitor",
    stats: { totalMatches: 21, totalMinutes: 1890, totalGoals: 2, totalAssists: 1, totalYellowCards: 5, totalRedCards: 1, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-02" },
  },
  {
    bid: 2210223, fifaId: null, passaporte: null, name: "Pedro Henrique",
    birthDate: "2006-05-30", mainPosition: "CB", dominantFoot: "left",
    heightCm: 185, weightKg: 77, contractEndDate: "2027-11-30",
    currentClubId: "club-san", currentCategory: "SUB-20", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    stats: { totalMatches: 19, totalMinutes: 1710, totalGoals: 1, totalAssists: 0, totalYellowCards: 3, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-01" },
  },
  {
    bid: 2210330, fifaId: null, passaporte: null, name: "Gabriel Souza",
    birthDate: "2006-09-11", mainPosition: "LB", dominantFoot: "left",
    heightCm: 176, weightKg: 70, contractEndDate: "2027-07-31",
    currentClubId: "club-vas", currentCategory: "SUB-20", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: "https://youtu.be/fb-gabriel-souza",
    stats: { totalMatches: 18, totalMinutes: 1520, totalGoals: 0, totalAssists: 4, totalYellowCards: 2, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-07-27" },
  },
  {
    bid: 2210440, fifaId: null, passaporte: null, name: "Matheus Alves",
    birthDate: "2006-02-18", mainPosition: "DM", dominantFoot: "right",
    heightCm: 181, weightKg: 74, contractEndDate: "2028-06-30",
    currentClubId: "club-fla", currentCategory: "SUB-20", agentId: "agent-01",
    claimStatus: "claimed", youtubeVideoUrl: null,
    stats: { totalMatches: 23, totalMinutes: 2010, totalGoals: 3, totalAssists: 6, totalYellowCards: 6, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-03" },
  },
  {
    bid: 2210551, fifaId: null, passaporte: null, name: "Bruno Costa",
    birthDate: "2006-11-04", mainPosition: "CM", dominantFoot: "right",
    heightCm: 179, weightKg: 72, contractEndDate: "2027-12-31",
    currentClubId: "club-flu", currentCategory: "SUB-20", agentId: null,
    claimStatus: "pending", youtubeVideoUrl: null,
    stats: { totalMatches: 20, totalMinutes: 1680, totalGoals: 4, totalAssists: 7, totalYellowCards: 3, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-07-30" },
  },
  {
    bid: 2210662, fifaId: "FIFA-BR-210662", passaporte: "Português", name: "Enzo Ribeiro",
    apelido: "Enzinho", nacionalidade: "Brasileiro / Português", posicaoSecundaria: "AM", inicioCarreira: 2020,
    birthDate: "2007-04-25", mainPosition: "CM", dominantFoot: "both",
    heightCm: 177, weightKg: 70, contractEndDate: "2027-02-01", // expiring soon
    currentClubId: "club-pal", currentCategory: "SUB-17", agentId: "agent-02",
    claimStatus: "claimed", youtubeVideoUrl: "https://youtu.be/fb-enzo-ribeiro",
    // SUB-17 athlete regularly fielded in SUB-20 matches -> played above category
    stats: { totalMatches: 17, totalMinutes: 1290, totalGoals: 5, totalAssists: 4, totalYellowCards: 1, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 9, lastMatchDate: "2026-08-04" },
  },
  {
    bid: 2210884, fifaId: null, passaporte: null, name: "Wesley Andrade",
    birthDate: "2006-08-19", mainPosition: "LW", dominantFoot: "right",
    heightCm: 174, weightKg: 68, contractEndDate: "2028-01-31",
    currentClubId: "club-fla", currentCategory: "SUB-20", agentId: "agent-01",
    claimStatus: "claimed", youtubeVideoUrl: "https://youtu.be/fb-wesley-andrade",
    stats: { totalMatches: 24, totalMinutes: 1990, totalGoals: 9, totalAssists: 8, totalYellowCards: 2, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-03" },
  },
  {
    bid: 2210995, fifaId: null, passaporte: null, name: "Vinícius Rocha",
    apelido: "Vini", posicaoSecundaria: "LW", inicioCarreira: 2018,
    birthDate: "2006-06-02", mainPosition: "ST", dominantFoot: "right",
    heightCm: 183, weightKg: 76, contractEndDate: "2027-01-20", // expiring soon
    currentClubId: "club-san", currentCategory: "SUB-20", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: "https://youtu.be/fb-vinicius-rocha",
    stats: { totalMatches: 23, totalMinutes: 2015, totalGoals: 18, totalAssists: 5, totalYellowCards: 3, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-05" },
  },
  {
    bid: 2211006, fifaId: "FIFA-BR-211006", passaporte: "Espanhol", name: "Yuri Mendes",
    apelido: "Yuri", nacionalidade: "Brasileiro / Espanhol", posicaoSecundaria: "LW", inicioCarreira: 2017,
    birthDate: "2006-10-27", mainPosition: "RW", dominantFoot: "left",
    heightCm: 175, weightKg: 69, contractEndDate: "2028-06-30",
    currentClubId: "club-vas", currentCategory: "SUB-20", agentId: "agent-03",
    claimStatus: "claimed", youtubeVideoUrl: "https://youtu.be/fb-yuri-mendes",
    stats: { totalMatches: 22, totalMinutes: 1870, totalGoals: 11, totalAssists: 9, totalYellowCards: 1, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-08-04" },
  },

  // ---- Bench (ranked) ------------------------------------------------------
  {
    bid: 2311502, fifaId: null, passaporte: null, name: "Miguel Santos",
    birthDate: "2009-02-08", mainPosition: "GK", dominantFoot: "right",
    heightCm: 186, weightKg: 74, contractEndDate: "2029-06-30",
    currentClubId: "club-pal", currentCategory: "SUB-17", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    stats: { totalMatches: 16, totalMinutes: 1440, totalGoals: 0, totalAssists: 0, totalYellowCards: 1, totalRedCards: 0, totalCleanSheets: 8, timesPlayedAboveCategory: 2, lastMatchDate: "2026-08-02" },
  },
  {
    bid: 2311773, fifaId: null, passaporte: null, name: "Kaique Moraes",
    birthDate: "2009-05-16", mainPosition: "AM", dominantFoot: "left",
    heightCm: 172, weightKg: 65, contractEndDate: "2027-06-30",
    currentClubId: "club-fla", currentCategory: "SUB-17", agentId: "agent-01",
    claimStatus: "claimed", youtubeVideoUrl: "https://youtu.be/fb-kaique-moraes",
    stats: { totalMatches: 15, totalMinutes: 1130, totalGoals: 6, totalAssists: 7, totalYellowCards: 2, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 5, lastMatchDate: "2026-08-01" },
  },
  {
    bid: 2211117, fifaId: null, passaporte: null, name: "Felipe Nunes",
    birthDate: "2006-12-01", mainPosition: "ST", dominantFoot: "right",
    heightCm: 182, weightKg: 78, contractEndDate: null, // free agent
    currentClubId: "club-flu", currentCategory: "SUB-20", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    stats: { totalMatches: 14, totalMinutes: 980, totalGoals: 7, totalAssists: 2, totalYellowCards: 1, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-07-19" },
  },
  {
    bid: 2311228, fifaId: null, passaporte: null, name: "Danilo Cardoso",
    birthDate: "2009-08-23", mainPosition: "CM", dominantFoot: "right",
    heightCm: 176, weightKg: 67, contractEndDate: "2028-06-30",
    currentClubId: "club-pal", currentCategory: "SUB-17", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    // last seen in a match sheet on 2026-06-05 -> inactive > 30 days
    stats: { totalMatches: 9, totalMinutes: 720, totalGoals: 1, totalAssists: 3, totalYellowCards: 2, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-06-05" },
  },
  {
    bid: 2211440, fifaId: null, passaporte: null, name: "Thiago Melo",
    apelido: "Thiaguinho", jogosSuspenso: 2, inicioCarreira: 2017,
    birthDate: "2006-04-12", mainPosition: "CB", dominantFoot: "right",
    heightCm: 188, weightKg: 80, contractEndDate: "2026-06-30", // expired
    currentClubId: "club-vas", currentCategory: "SUB-20", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    // also inactive (last match 2026-06-28)
    stats: { totalMatches: 12, totalMinutes: 1040, totalGoals: 0, totalAssists: 1, totalYellowCards: 4, totalRedCards: 1, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-06-28" },
  },
  {
    bid: 2412339, fifaId: null, passaporte: null, name: "Igor Barbosa",
    birthDate: "2011-03-05", mainPosition: "LW", dominantFoot: "right",
    heightCm: 168, weightKg: 58, contractEndDate: "2029-12-31",
    currentClubId: "club-san", currentCategory: "SUB-15", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: "https://youtu.be/fb-igor-barbosa",
    stats: { totalMatches: 13, totalMinutes: 1010, totalGoals: 8, totalAssists: 6, totalYellowCards: 0, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 4, lastMatchDate: "2026-08-02" },
  },

  // ---- Additional pool (younger categories, search variety) ----------------
  {
    bid: 2513551, fifaId: null, passaporte: null, name: "Arthur Gomes",
    birthDate: "2013-07-18", mainPosition: "ST", dominantFoot: "right",
    heightCm: 158, weightKg: 48, contractEndDate: "2030-06-30",
    currentClubId: "club-fla", currentCategory: "SUB-13", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    stats: { totalMatches: 10, totalMinutes: 760, totalGoals: 12, totalAssists: 3, totalYellowCards: 0, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 3, lastMatchDate: "2026-07-26" },
  },
  {
    bid: 2614662, fifaId: null, passaporte: null, name: "Bernardo Dias",
    birthDate: "2015-05-09", mainPosition: "CM", dominantFoot: "left",
    heightCm: 145, weightKg: 39, contractEndDate: null, // free agent
    currentClubId: "club-pal", currentCategory: "SUB-11", agentId: null,
    claimStatus: "unclaimed", youtubeVideoUrl: null,
    stats: { totalMatches: 8, totalMinutes: 560, totalGoals: 2, totalAssists: 5, totalYellowCards: 0, totalRedCards: 0, totalCleanSheets: 0, timesPlayedAboveCategory: 0, lastMatchDate: "2026-07-20" },
  },
];

export const mockAtletas: MockAtleta[] = rawAtletas.map(buildAtleta);

// ----------------------------------------------------------------------------
// Lookups
// ----------------------------------------------------------------------------
export const getAtletaByBid = (bid: number): MockAtleta | undefined =>
  mockAtletas.find((a) => a.bid === bid);

export const getClubeById = (id: string): MockClube | undefined =>
  mockClubes.find((c) => c.id === id);

export const getTorneioById = (id: string): MockTorneio | undefined =>
  mockTorneios.find((t) => t.id === id);

// Convenience filtered views for dashboard widgets.
export const expiringContractAtletas = mockAtletas.filter(
  (a) => a.contractStatus === "expiring_soon"
);
export const freeAgentAtletas = mockAtletas.filter(
  (a) => a.contractStatus === "free_agent"
);
export const inactiveAtletas = mockAtletas.filter((a) => a.isInactive30d);
export const playedAboveCategoryAtletas = mockAtletas.filter(
  (a) => a.stats.timesPlayedAboveCategory > 0
);

// ----------------------------------------------------------------------------
// Tactical board (prancheta_tatica) — favorited athletes as a 4-3-3 XI + bench
// ----------------------------------------------------------------------------
export interface MockPranchetaSlot {
  bid: number;
  slotType: "starter" | "bench";
  positionCode: Position | null; // pitch position for starters, null for bench
  slotOrder: number; // starter position index, or bench rank
}

export interface MockPrancheta {
  id: string;
  name: string;
  formation: string;
  starters: MockPranchetaSlot[];
  bench: MockPranchetaSlot[];
}

export const mockPrancheta: MockPrancheta = {
  id: "prancheta-01",
  name: "Alvo Base 2027 — 4-3-3",
  formation: "4-3-3",
  starters: [
    { bid: 2210045, slotType: "starter", positionCode: "GK", slotOrder: 0 },
    { bid: 2210101, slotType: "starter", positionCode: "RB", slotOrder: 1 },
    { bid: 2209888, slotType: "starter", positionCode: "CB", slotOrder: 2 },
    { bid: 2210223, slotType: "starter", positionCode: "CB", slotOrder: 3 },
    { bid: 2210330, slotType: "starter", positionCode: "LB", slotOrder: 4 },
    { bid: 2210440, slotType: "starter", positionCode: "DM", slotOrder: 5 },
    { bid: 2210551, slotType: "starter", positionCode: "CM", slotOrder: 6 },
    { bid: 2210662, slotType: "starter", positionCode: "CM", slotOrder: 7 },
    { bid: 2210884, slotType: "starter", positionCode: "LW", slotOrder: 8 },
    { bid: 2210995, slotType: "starter", positionCode: "ST", slotOrder: 9 },
    { bid: 2211006, slotType: "starter", positionCode: "RW", slotOrder: 10 },
  ],
  bench: [
    { bid: 2311502, slotType: "bench", positionCode: null, slotOrder: 0 },
    { bid: 2311773, slotType: "bench", positionCode: null, slotOrder: 1 },
    { bid: 2211117, slotType: "bench", positionCode: null, slotOrder: 2 },
    { bid: 2311228, slotType: "bench", positionCode: null, slotOrder: 3 },
    { bid: 2211440, slotType: "bench", positionCode: null, slotOrder: 4 },
    { bid: 2412339, slotType: "bench", positionCode: null, slotOrder: 5 },
  ],
};

/** Favorited athletes = every athlete referenced by the tactical board. */
export const favoritedBids: number[] = [
  ...mockPrancheta.starters,
  ...mockPrancheta.bench,
].map((s) => s.bid);

// ----------------------------------------------------------------------------
// Favoritos (per-user shortlist + nota) — nota drives the bench ranking (UC06)
// ----------------------------------------------------------------------------
export interface MockFavorito {
  userId: string;
  bid: number;
  nota: number; // 0-100 user rating (best -> worst)
  notas: string | null; // free-text scouting note
}

const DEMO_USER = "user-agent-01";

export const mockFavoritos: MockFavorito[] = [
  { userId: DEMO_USER, bid: 2210995, nota: 90, notas: "Finalizador nato, decide jogos." },
  { userId: DEMO_USER, bid: 2210662, nota: 88, notas: "Já joga acima da categoria com folga." },
  { userId: DEMO_USER, bid: 2211006, nota: 87, notas: "Explosão e drible pela direita." },
  { userId: DEMO_USER, bid: 2210884, nota: 86, notas: "Participações diretas em gol acima da média." },
  { userId: DEMO_USER, bid: 2209888, nota: 85, notas: "Zagueiro de saída de bola, passaporte europeu." },
  { userId: DEMO_USER, bid: 2210440, nota: 84, notas: "Volante box-to-box, liderança." },
  { userId: DEMO_USER, bid: 2210045, nota: 83, notas: "Goleiro com muitos clean sheets." },
  { userId: DEMO_USER, bid: 2311502, nota: 82, notas: "Goleiro reserva promissor." },
  { userId: DEMO_USER, bid: 2311773, nota: 81, notas: "Meia criativo, joga acima da idade." },
  { userId: DEMO_USER, bid: 2210551, nota: 80, notas: null },
  { userId: DEMO_USER, bid: 2210223, nota: 79, notas: null },
  { userId: DEMO_USER, bid: 2210101, nota: 78, notas: null },
  { userId: DEMO_USER, bid: 2210330, nota: 76, notas: null },
  { userId: DEMO_USER, bid: 2211117, nota: 74, notas: "Agente livre — oportunidade de mercado." },
  { userId: DEMO_USER, bid: 2311228, nota: 70, notas: "Atenção: inativo há mais de 30 dias." },
  { userId: DEMO_USER, bid: 2211440, nota: 63, notas: "Contrato expirado, suspenso 2 jogos." },
  { userId: DEMO_USER, bid: 2412339, nota: 60, notas: "Muito jovem, projeto de longo prazo." },
];

export const getFavoritoNota = (bid: number, userId = DEMO_USER): number | null =>
  mockFavoritos.find((f) => f.userId === userId && f.bid === bid)?.nota ?? null;

/** Bench (UC06): favorited athletes NOT in the starting XI, best -> worst. */
const starterBidSet = new Set(mockPrancheta.starters.map((s) => s.bid));
export const rankedBench: MockFavorito[] = mockFavoritos
  .filter((f) => f.userId === DEMO_USER && !starterBidSet.has(f.bid))
  .sort((a, b) => b.nota - a.nota);

// ----------------------------------------------------------------------------
// Conquistas (títulos + prêmios individuais)
// ----------------------------------------------------------------------------
export interface MockConquista {
  id: string;
  bid: number;
  tipo: "titulo" | "premio";
  descricao: string;
  ano: number;
  torneioId: string | null;
}

export const mockConquistas: MockConquista[] = [
  { id: "cq-01", bid: 2210995, tipo: "titulo", descricao: "Campeão Brasileiro SUB-20", ano: 2025, torneioId: "trn-bra-sub20" },
  { id: "cq-02", bid: 2210995, tipo: "premio", descricao: "Artilheiro do Brasileirão SUB-20", ano: 2025, torneioId: "trn-bra-sub20" },
  { id: "cq-03", bid: 2210884, tipo: "titulo", descricao: "Campeão da Copinha", ano: 2025, torneioId: "trn-copinha" },
  { id: "cq-04", bid: 2210662, tipo: "premio", descricao: "Revelação da Copa do Brasil SUB-17", ano: 2025, torneioId: "trn-cdb-sub17" },
  { id: "cq-05", bid: 2210045, tipo: "premio", descricao: "Luva de Ouro SUB-20", ano: 2025, torneioId: "trn-bra-sub20" },
  { id: "cq-06", bid: 2209888, tipo: "titulo", descricao: "Campeão Paulista SUB-20", ano: 2024, torneioId: null },
];

export const getConquistasByBid = (bid: number): MockConquista[] =>
  mockConquistas.filter((c) => c.bid === bid);

// ----------------------------------------------------------------------------
// Agentes (representation profiles referenced by atletas.agentId)
// ----------------------------------------------------------------------------
export interface MockAgente {
  id: string;
  userId: string;
  fullName: string;
  agencyName: string | null;
  verifiedStatus: "pending" | "verified" | "rejected";
  licenseLevel: string | null;
  markets: string[];
  instagram: string | null;
  phone: string | null;
  contactEmail: string | null;
}

export const mockAgentes: MockAgente[] = [
  { id: "agent-01", userId: "user-agent-01", fullName: "Carlos Mendes", agencyName: "Prime Sports", verifiedStatus: "verified", licenseLevel: "Licença FIFA", markets: ["Brasil", "Europa"], instagram: "@primesports", phone: "+55 21 99999-0001", contactEmail: "carlos@primesports.com" },
  { id: "agent-02", userId: "user-agent-02", fullName: "Ana Beatriz Rocha", agencyName: "AB Sports", verifiedStatus: "verified", licenseLevel: "Intermediário CBF", markets: ["Brasil"], instagram: "@absports", phone: "+55 11 99999-0002", contactEmail: "ana@absports.com" },
  { id: "agent-03", userId: "user-agent-03", fullName: "Rodrigo Faria", agencyName: "RF Management", verifiedStatus: "pending", licenseLevel: "Licença FIFA", markets: ["Brasil", "Ásia"], instagram: "@rfmanagement", phone: "+55 31 99999-0003", contactEmail: "rodrigo@rfmanagement.com" },
];

export const getAgenteById = (id: string | null): MockAgente | undefined =>
  id ? mockAgentes.find((a) => a.id === id) : undefined;

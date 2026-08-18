// FOOTBASE Phase 6.x — FPF individual athlete profile PARSER (pure JSON → profile).
//
// Source: GET https://futebolpaulista.com.br/Handlers/Atleta/ReadAtleta.ashx?IdAtleta={id}
// (same Cloudflare-challenged domain as the rest of futebolpaulista.com.br — needs
// Playwright, not a plain fetch; fetching it live is not implemented yet, see
// `fetchFpfAthleteProfile` below, same documented-stub pattern as
// `cbf-athlete-profile.ts`).
//
// CONFIRMED LIVE (two real athletes cross-checked): this endpoint's `Registro` is the
// SAME identity as the súmula's per-player "Registro" column, minus the trailing
// "/{ano}" competition-year suffix (e.g. súmula "656616/26" == profile "656616").
// That is the crosswalk this parser exists for: a súmula-only mention of a player can
// be enriched with birth date / nationality / contract end date once its registro is
// looked up here (via the roster endpoint's IdAtleta, which this profile also carries).
//
// Fields intentionally NOT extracted because the endpoint doesn't have them: height,
// weight, birthplace. Never fabricated.

export interface FpfAthleteProfile {
  idAtleta: string;
  registro: string; // matches the súmula's Registro column once the "/{ano}" suffix is stripped
  name: string;
  birthDate: string | null; // ISO date
  nacionalidade: string | null;
  contractEndDate: string | null; // maps to atletas.contract_end_date — NOT inicio_carreira (different meaning: contract start ≠ career start, never conflated)
  clubSourceKey: string; // 'fpf:<IdClube>'
}

interface RawProfile {
  IdAtleta?: unknown;
  IdClube?: unknown;
  Nome?: unknown;
  DataNascimento?: unknown;
  Nacionalidade?: unknown;
  DataTerminoContrato?: unknown;
  Registro?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** "12/08/2010" (DD/MM/YYYY) -> "2010-08-12". */
function toIsoDate(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(str(v));
  return m ? `${m[3]!}-${m[2]!}-${m[1]!}` : null;
}

/**
 * Parse one `ReadAtleta.ashx` response (already `JSON.parse`d). Returns null for a
 * malformed/unsuccessful payload rather than throwing.
 */
export function parseFpfAthleteProfile(payload: unknown): FpfAthleteProfile | null {
  const retorno = payload && typeof payload === "object" ? (payload as { Retorno?: unknown }).Retorno : null;
  if (!retorno || typeof retorno !== "object") return null;
  const row = retorno as RawProfile;

  const idAtleta = str(row.IdAtleta);
  const idClube = str(row.IdClube);
  const name = str(row.Nome);
  const registro = str(row.Registro);
  if (!idAtleta || !idClube || !name || !registro) return null;

  return {
    idAtleta,
    registro,
    name,
    birthDate: toIsoDate(row.DataNascimento),
    nacionalidade: str(row.Nacionalidade) || null,
    contractEndDate: toIsoDate(row.DataTerminoContrato),
    clubSourceKey: `fpf:${idClube}`,
  };
}

/**
 * Fetch a live FPF athlete profile by IdAtleta. NOT IMPLEMENTED yet — the endpoint is
 * behind the same Cloudflare challenge as the rest of futebolpaulista.com.br (confirmed
 * live: a plain server fetch gets a 403), so this needs the Playwright runtime that
 * isn't wired yet. Kept as an explicit boundary, same pattern as
 * `fetchCbfAthleteProfile` — callers inject already-fetched profiles (e.g. in tests, or
 * once a Playwright runner lands) instead of calling this.
 */
export async function fetchFpfAthleteProfile(idAtleta: string): Promise<FpfAthleteProfile> {
  throw new Error(
    `fetchFpfAthleteProfile(${idAtleta}) not implemented: needs the Playwright runtime ` +
      `(this endpoint is Cloudflare-challenged, confirmed live). Inject profiles instead.`,
  );
}

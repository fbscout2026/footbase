// FOOTBASE — CBF per-athlete detail page parser (pure, no IO). Session 57.
//
// Confirmed live: `cbf.com.br/futebol-brasileiro/atletas/{competitionSlug}/
// {categorySlug}/{year}/{atletaId}` is plain server-rendered HTML (Next.js RSC),
// fetchable via plain `fetch()` — no bot-detection, same as every other CBF
// endpoint this project already uses. It embeds a structured payload
// (`\"atleta_data_nascimento\":\"DD/MM/YYYY\"`) that `parse-cbf-registry.ts`'s own
// module doc flagged as the missing piece: the CBF registry LIST endpoint never
// carries birth date, so every athlete seeded from it alone (today: ALL 8186
// CBF-sourced athletes, confirmed live) stays with `birth_date = null` forever
// unless this per-athlete page is fetched too.
//
// The companion "times" (team roster) page at the same URL shape
// (`.../times/{competitionSlug}/{categorySlug}/{year}/{teamId}`) embeds the same
// kind of payload with every roster athlete's `atleta_id` — but NOT their birth
// date, so a full backfill still needs one fetch per athlete on top of one fetch
// per team.

const NASCIMENTO_RE = /"atleta_data_nascimento\\":\\"(\d{2})\/(\d{2})\/(\d{4})\\"/;
const ATLETA_ID_RE = /"atleta_id\\":\\"(\d+)\\"/;
// Non-greedy up to the next `\"` boundary — these fields never contain a
// literal escaped quote of their own, so no need for escape-aware matching.
const NOME_RE = /"atleta_nome\\":\\"(.*?)\\"/;
const APELIDO_RE = /"atleta_apelido\\":\\"(.*?)\\"/;
const CLUBE_ATUAL_RE = /"atleta_time_atual\\":\{\\"time_id\\":\\"(\d+)\\"/;

export interface CbfAthleteDetail {
  atletaId: number;
  name: string;
  apelido: string | null;
  birthDateIso: string; // ISO YYYY-MM-DD
  cbfClubId: number | null;
}

/** Parses one athlete's detail page. Returns `null` when the page doesn't carry
 * a recognizable athlete payload (never throws — an athlete detail page is an
 * enrichment, not allowed to block ingestion). */
export function parseCbfAthleteDetail(html: string): CbfAthleteDetail | null {
  const idMatch = html.match(ATLETA_ID_RE);
  const nascimentoMatch = html.match(NASCIMENTO_RE);
  if (!idMatch || !nascimentoMatch) return null;

  const nomeMatch = html.match(NOME_RE);
  const apelidoMatch = html.match(APELIDO_RE);
  const clubeMatch = html.match(CLUBE_ATUAL_RE);

  const [, dd, mm, yyyy] = nascimentoMatch;
  return {
    atletaId: Number(idMatch[1]),
    name: nomeMatch ? unescapeJsonLike(nomeMatch[1]!) : "",
    apelido: apelidoMatch ? unescapeJsonLike(apelidoMatch[1]!) : null,
    birthDateIso: `${yyyy}-${mm}-${dd}`,
    cbfClubId: clubeMatch ? Number(clubeMatch[1]) : null,
  };
}

const ROSTER_ATLETA_ID_RE = /"atleta_id\\":\\"(\d+)\\"/g;

/** Parses a team roster page (the "times" URL shape) — just the list of real
 * CBF atleta ids on that team for that competition/category/year, enough to
 * know which per-athlete detail pages to fetch next. */
export function parseCbfTeamRoster(html: string): number[] {
  const ids = new Set<number>();
  for (const m of html.matchAll(ROSTER_ATLETA_ID_RE)) ids.add(Number(m[1]));
  return [...ids];
}

function unescapeJsonLike(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

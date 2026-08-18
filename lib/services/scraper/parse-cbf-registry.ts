// FOOTBASE Phase 6.4 — CBF athlete-registry parser (pure JSON → seed data).
//
// The CBF athletes page is backed by a clean JSON API:
//   GET https://www.cbf.com.br/api/cbf/atletas/campeonato/{edicaoId}/pagina/{n}
// returning, per registered athlete: the 6-digit CBF id (our `atletas.bid`), the
// canonical full name, and the club (id, UF, popular name, crest URL). This is the
// robust "data endpoint" discovery/seed source — no HTML/PDF scraping — used to seed
// CLUBS (with crest) and to give athletes their canonical name. It powers the
// single-profile-per-athlete rule: every registration across categories/tournaments
// resolves to the SAME `bid`, so the athlete never duplicates.
//
// PRIVACY: the payload also carries `atleta_cpf` (a Brazilian tax id — sensitive PII).
// It is DROPPED here and never enters the output, the database, logs or responses.
//
// NOTE: this list endpoint does NOT include the birth date. `atletas.birth_date` is
// NOT NULL, so athletes seeded from the registry alone stay provisional (`birthDate:
// null`) until the per-athlete detail endpoint (which the CBF DB exposes as
// `Data_Nascimento`) is wired — then they become seedable. This parser is PURE and
// unit-tested; it performs no IO.

import type { ParsedAthlete, ParsedClub } from "./types.ts";

/** A club parsed from the registry, plus its official crest URL for auto-download. */
export interface RegistryClub extends ParsedClub {
  crestUrl: string | null;
}

export interface CbfRegistry {
  clubs: RegistryClub[];
  athletes: ParsedAthlete[];
}

interface RawRow {
  atleta_id?: unknown;
  atleta_nome?: unknown;
  atleta_apelido?: unknown;
  atleta_cpf?: unknown; // intentionally ignored (PII)
  Codigo_Clube?: unknown;
  clube_id?: unknown;
  clube_uf?: unknown;
  clube_nome_popular?: unknown;
  clube_nome_completo?: unknown;
  clube_escudo?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/**
 * Parse the registry JSON (already `JSON.parse`d) into dedup'd clubs + athletes.
 * `atleta_cpf` is never read into the result. Clubs are dedup'd by club id and
 * athletes by BID, so a page (or merged pages) yields one row per entity.
 */
export function parseCbfRegistry(payload: unknown): CbfRegistry {
  const rows: RawRow[] =
    payload && typeof payload === "object" && Array.isArray((payload as { atletas?: unknown }).atletas)
      ? ((payload as { atletas: RawRow[] }).atletas)
      : [];

  const clubs = new Map<string, RegistryClub>();
  const athletes = new Map<number, ParsedAthlete>();

  for (const row of rows) {
    const bid = Number(str(row.atleta_id));
    const clubeId = str(row.clube_id) || str(row.Codigo_Clube);
    if (!Number.isInteger(bid) || bid <= 0 || !clubeId) continue; // skip malformed rows

    const sourceKey = `cbf:${clubeId}`;
    if (!clubs.has(sourceKey)) {
      clubs.set(sourceKey, {
        sourceKey,
        name: str(row.clube_nome_popular) || str(row.clube_nome_completo),
        state: str(row.clube_uf) || null,
        federacao: null,
        crestUrl: str(row.clube_escudo) || null,
      });
    }

    if (!athletes.has(bid)) {
      athletes.set(bid, {
        bid,
        name: str(row.atleta_nome),
        birthDate: null, // not in the list endpoint; filled by the detail endpoint
        nacionalidade: null,
        mainPosition: null,
      });
    }
  }

  return { clubs: [...clubs.values()], athletes: [...athletes.values()] };
}

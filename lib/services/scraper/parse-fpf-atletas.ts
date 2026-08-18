// FOOTBASE Phase 6.x — FPF (Federação Paulista de Futebol) athlete-registry parser
// (pure JSON → identity candidates).
//
// Source: GET https://futebolpaulista.com.br/Handlers/Atleta/ListarAtletas.ashx
//   ?IdClube={id}&categoria=Amador|Profissional&pageNum={n}
// returning, per registered athlete: the FPF's OWN internal id (`IdAtleta`), name,
// birth date and club id. `categoria=Amador` on this endpoint is where youth/base
// players actually show up (verified live: birth years spanning the SUB-13..SUB-18
// range), but the endpoint itself never states the SUB-NN category — only birth date.
//
// IMPORTANT — this is NOT a `ParsedAthlete` source: `atletas.bid` is defined
// (CLAUDE.md) as the CBF's own 6-digit id, and this endpoint never exposes it. So
// unlike `parse-cbf-registry.ts` (which seeds new athletes because it always carries
// a real bid), this parser only produces IDENTITY CANDIDATES for
// `resolveAthleteIdentity` — every row must resolve to an EXISTING atletas.bid (via
// name + birth_date) before anything is written. A candidate that resolves to "new"
// has no real bid to seed with and must go to admin review, not auto-creation.
//
// NOTE: the site is behind Cloudflare's bot-challenge (confirmed live: a plain
// server-side fetch gets a 403 "Just a moment..." page) — unlike the CBF súmula PDFs,
// this endpoint can only be called from a real browser context (Playwright), for both
// discovery AND data extraction.
//
// This parser is PURE and unit-tested; it performs no IO.

import type { IdentityCandidate } from "./resolve-athlete-identity.ts";

export const FPF_FONTE = "fpf";

export interface FpfClubRef {
  sourceKey: string; // 'fpf:<IdClube>'
  externalId: string;
}

interface RawRow {
  IdAtleta?: unknown;
  IdClube?: unknown;
  Nome?: unknown;
  Apelido?: unknown;
  Sexo?: unknown;
  Categoria?: unknown;
  DataNascimento?: unknown;
}

interface RawPayload {
  Sucesso?: unknown;
  Retorno?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** "2012-03-01T00:00:00" -> "2012-03-01" (ISO date, matches atletas.birth_date). */
function toIsoDate(v: unknown): string | null {
  const s = str(v);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return match ? match[1]! : null;
}

export interface FpfAthleteCandidate {
  candidate: IdentityCandidate;
  club: FpfClubRef;
}

/**
 * Parse one page of the FPF athlete-registry JSON (already `JSON.parse`d) into
 * identity candidates for `resolveAthleteIdentity`. Malformed rows (missing id/name)
 * are skipped rather than throwing, matching the other registry-style parsers.
 */
export function parseFpfAtletas(payload: unknown): FpfAthleteCandidate[] {
  const rows: RawRow[] =
    payload && typeof payload === "object" && Array.isArray((payload as RawPayload).Retorno)
      ? ((payload as { Retorno: RawRow[] }).Retorno)
      : [];

  const results: FpfAthleteCandidate[] = [];
  for (const row of rows) {
    const externalId = str(row.IdAtleta);
    const idClube = str(row.IdClube);
    const name = str(row.Nome);
    if (!externalId || !idClube || !name) continue; // skip malformed rows

    results.push({
      candidate: {
        fonte: FPF_FONTE,
        externalId,
        cbfBid: null, // this endpoint never exposes the CBF bid
        name,
        birthDate: toIsoDate(row.DataNascimento),
      },
      club: { sourceKey: `fpf:${idClube}`, externalId: idClube },
    });
  }
  return results;
}

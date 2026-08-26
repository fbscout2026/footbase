// FOOTBASE — club identity resolution (pure, no IO). Session 57.
//
// Mirrors `resolve-athlete-identity.ts`'s architecture, applied to clubs: the
// canonical key is `clubes.fb_id` (permanent internal identity, reserved range
// >= 500000000 — never collides with a real 6-digit CBF athlete bid or the
// provisional-athlete range >= 900000000). A source's own club id/name is never
// blind-trusted as identity — it's one more `clube_fontes` candidate, resolved
// through this ladder before any upsert:
//   1. (fonte, externalId) already mapped in
//      `clube_fontes`                              → the mapped clubId (exact)
//   2. crest hash (fetched fresh from the source's
//      own site) is byte-identical to an existing
//      club's stored crest, state doesn't conflict  → 'matched' (auto-confirmed —
//                                                      this is the ONLY tier allowed
//                                                      to auto-merge across sources;
//                                                      matches even when the NAME
//                                                      differs, catching the "Vasco
//                                                      da Gama" vs "Vasco da Gama
//                                                      Saf" pattern from CLAUDE.md)
//   3. normalized name + state match, but crest
//      doesn't confirm (missing or different)       → 'ambiguous' — NEVER
//                                                      auto-merged (the "Democrata
//                                                      Futebol Clube" vs "Esporte
//                                                      Clube Democrata" false-
//                                                      positive is exactly why: two
//                                                      real, different clubs sharing
//                                                      a name fragment). Surfaces for
//                                                      `scan-club-duplicates.ts` +
//                                                      manual `merge-clube.ts` later.
//   4. nothing matches                              → 'new' — caller mints a fresh
//                                                      fb_id and creates the row.
//
// Unlike the athlete resolver, tier 3 here NEVER auto-confirms — name+state alone
// has a proven false-positive history for clubs (CLAUDE.md, Session 55) that
// name+birth_date does not have for athletes. Crest is the only strong enough
// cross-source signal. This function only DECIDES; writing `clube_fontes` /
// creating the club happens in the (service_role-only) wiring layer.

export interface ExistingClubForIdentity {
  id: string; // clubes.id (uuid)
  name: string;
  state: string | null;
  crestHash: string | null; // sha256 of the club's own stored crest file; null if it has none yet
}

export interface ClubIdentityMapping {
  fonte: string; // 'cbf', 'fes', 'fgf', ...
  externalId: string; // club id/slug within that source (the part after "fonte:" in source_key)
  clubId: string;
}

export interface ClubIdentityCandidate {
  fonte: string;
  externalId: string;
  name: string;
  state: string | null;
  crestHash: string | null; // sha256 of the freshly-fetched crest bytes; null when unavailable
}

export type ClubResolution =
  | { kind: "mapped"; clubId: string; confidence: "exact"; reason: string }
  | { kind: "matched"; clubId: string; confidence: "matched"; reason: string }
  | { kind: "ambiguous"; candidates: string[]; reason: string }
  | { kind: "new"; reason: string };

/** Accent/case/space-insensitive name key for matching. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stateConflicts(a: string | null, b: string | null): boolean {
  return !!a && !!b && a !== b;
}

export function resolveClubIdentity(
  candidate: ClubIdentityCandidate,
  ctx: { existing: ExistingClubForIdentity[]; mappings: ClubIdentityMapping[] },
): ClubResolution {
  // 1. This external id was resolved before → reuse the mapping (idempotent).
  const mapped = ctx.mappings.find((m) => m.fonte === candidate.fonte && m.externalId === candidate.externalId);
  if (mapped) {
    return { kind: "mapped", clubId: mapped.clubId, confidence: "exact", reason: "existing clube_fontes mapping" };
  }

  // 2. Crest hash is the only signal allowed to auto-confirm across sources —
  //    checked BEFORE name, so a same-club/different-name pair (SAF variant) still
  //    resolves, and a same-name/different-club pair (false positive) never does.
  if (candidate.crestHash) {
    const crestHits = ctx.existing.filter((c) => c.crestHash === candidate.crestHash && !stateConflicts(c.state, candidate.state));
    if (crestHits.length === 1) {
      return { kind: "matched", clubId: crestHits[0]!.id, confidence: "matched", reason: "crest hash identical (state doesn't conflict)" };
    }
    if (crestHits.length > 1) {
      return { kind: "ambiguous", candidates: crestHits.map((c) => c.id), reason: "crest hash matches more than one existing club" };
    }
  }

  // 3. Name + state match without crest confirmation: never auto-merge (proven
  //    false-positive risk — CLAUDE.md's Democrata FC / EC Democrata case).
  const wanted = normalizeName(candidate.name);
  const nameHits = wanted ? ctx.existing.filter((c) => normalizeName(c.name) === wanted && !stateConflicts(c.state, candidate.state)) : [];
  if (nameHits.length > 0) {
    const reason = candidate.crestHash ? "name + state match but crest hash differs" : "name + state match but no crest to confirm";
    return { kind: "ambiguous", candidates: nameHits.map((c) => c.id), reason };
  }

  return { kind: "new", reason: "no mapping, no crest match, no name+state match" };
}

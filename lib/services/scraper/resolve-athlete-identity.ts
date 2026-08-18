// FOOTBASE Phase 6.4 — athlete identity resolution (pure, no IO).
//
// Guarantees the product rule: ONE canonical profile per athlete, accumulating
// appearances across every category / tournament / state or national competition /
// source — WITHOUT duplicating, and WITHOUT ever merging two different people.
//
// The canonical key is `atletas.bid` (CBF 6-digit id). Given a candidate seen in
// some source, resolution follows a confidence ladder:
//   1. the source carries the CBF bid            → identity is that bid (exact)
//   2. (fonte, externalId) already mapped in
//      `atleta_fontes`                            → the mapped bid (exact)
//   3. a single existing athlete matches
//      name + birth_date                          → 'matched' (admin confirms; never auto-merged)
//   4. several match, or a name-only hit with no
//      birth_date                                 → 'ambiguous' (admin decides)
//   5. nothing matches                            → 'new' (seed a fresh bid; needs a birthDate)
//
// Steps 3–4 are NEVER auto-applied: a weak/fuzzy match is surfaced for admin review
// (Fase 5 curadoria) so two distinct people are never fused. This function only
// DECIDES; writing `atleta_fontes` / seeding happens in the (6.5-gated) live path.

export interface ExistingAthlete {
  bid: number;
  name: string;
  birthDate: string; // ISO — atletas.birth_date is NOT NULL
}

export interface IdentityMapping {
  fonte: string; // 'cbf', 'fpf', 'ferj', ...
  externalId: string; // athlete id within that source
  bid: number; // canonical CBF bid it resolves to
}

export interface IdentityCandidate {
  fonte: string;
  externalId: string;
  cbfBid?: number | null; // 6-digit CBF bid when the source exposes it
  name: string;
  birthDate?: string | null; // ISO when known
}

export type Resolution =
  | { kind: "bid"; bid: number; confidence: "exact"; reason: string }
  | { kind: "mapped"; bid: number; confidence: "exact"; reason: string }
  | { kind: "matched"; bid: number; confidence: "matched"; reason: string }
  | { kind: "ambiguous"; candidates: number[]; reason: string }
  | { kind: "new"; reason: string };

function isValidBid(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 100000 && v <= 999999;
}

/** Accent/case/space-insensitive name key for matching. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveAthleteIdentity(
  candidate: IdentityCandidate,
  ctx: { existing: ExistingAthlete[]; mappings: IdentityMapping[] },
): Resolution {
  // 1. The source already carries the canonical CBF bid → identity is settled.
  if (isValidBid(candidate.cbfBid)) {
    return { kind: "bid", bid: candidate.cbfBid, confidence: "exact", reason: "source provided a CBF bid" };
  }

  // 2. This external id was resolved before → reuse the mapping (idempotent).
  const mapped = ctx.mappings.find((m) => m.fonte === candidate.fonte && m.externalId === candidate.externalId);
  if (mapped) {
    return { kind: "mapped", bid: mapped.bid, confidence: "exact", reason: "existing atleta_fontes mapping" };
  }

  // 3/4. Try to match by name (+ birth date). Never merge on weak evidence.
  const wanted = normalizeName(candidate.name);
  const nameHits = wanted ? ctx.existing.filter((a) => normalizeName(a.name) === wanted) : [];

  if (candidate.birthDate) {
    const strong = nameHits.filter((a) => a.birthDate === candidate.birthDate);
    if (strong.length === 1) {
      return { kind: "matched", bid: strong[0]!.bid, confidence: "matched", reason: "name + birth_date match (admin confirms)" };
    }
    if (strong.length > 1) {
      return { kind: "ambiguous", candidates: strong.map((a) => a.bid), reason: "multiple athletes share name + birth_date" };
    }
    // birthDate present but no strong hit: a name-only hit is not enough to merge.
    if (nameHits.length > 0) {
      return { kind: "ambiguous", candidates: nameHits.map((a) => a.bid), reason: "name matches but birth_date differs" };
    }
    return { kind: "new", reason: "no bid, no mapping, no name+birth_date match" };
  }

  // No birth date: cannot safely confirm identity. A name hit must go to review.
  if (nameHits.length > 0) {
    return { kind: "ambiguous", candidates: nameHits.map((a) => a.bid), reason: "name matches but no birth_date to confirm" };
  }
  return { kind: "new", reason: "no bid, no mapping, no name match" };
}

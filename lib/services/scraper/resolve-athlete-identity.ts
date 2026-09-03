// FOOTBASE Phase 6.4 — athlete identity resolution (pure, no IO).
//
// Guarantees the product rule: ONE canonical profile per athlete, accumulating
// appearances across every category / tournament / state or national competition /
// source — WITHOUT duplicating, and WITHOUT ever merging two different people.
//
// The canonical key is `atletas.fb_id` (a permanent internal identity — see the
// "FB-ID: chave suprema" plan; a source's own number, CBF bid included, is never
// blind-trusted as identity anymore, only as one more `atleta_fontes` candidate).
// Given a candidate seen in some source, resolution follows a confidence ladder:
//   1. (fonte, externalId) already mapped in
//      `atleta_fontes`                            → the mapped fb_id (exact)
//   2. the source carries a bid that already
//      exists as some `atletas` row               → that fb_id (exact — a real
//                                                     CBF bid is globally unique,
//                                                     safe to trust without more)
//   3. a single existing athlete matches
//      name + birth_date, OR (no birth_date
//      available) name + current club             → 'matched' (admin confirms; never auto-merged)
//   4. several match, or a name-only hit with
//      neither birth_date nor club confirming      → 'ambiguous' (admin decides)
//   5. nothing matches                            → 'new' — caller mints the fb_id:
//                                                     the source's own bid directly
//                                                     when it has one (CBF/FMF/FGF),
//                                                     otherwise via the internal
//                                                     allocator (FERJ and future
//                                                     bid-less sources)
//
// Session 56 fix: tier 2 used to short-circuit on ANY source-provided bid, even a
// brand-new one never seen before — meaning a real CBF bid was never compared
// against an athlete who might already exist under a different (e.g. provisional,
// FERJ-only) fb_id. That's exactly how a cross-federation transfer created a
// duplicate identity. Now tier 2 only fires when the bid already exists as a row;
// a genuinely new bid falls through to the same name-matching tiers 3/4 every other
// source already goes through, so a provisional twin gets found and reused instead
// of silently duplicated.
//
// Steps 3–4 are NEVER auto-applied: a weak/fuzzy match is surfaced for admin review
// (Fase 5 curadoria) so two distinct people are never fused. This function only
// DECIDES; writing `atleta_fontes` / seeding happens in the (6.5-gated) live path.

export interface ExistingAthlete {
  bid: number;
  name: string;
  birthDate: string; // ISO, or "" when unknown (provisional athletes may have none)
  currentClubId?: string | null; // atletas.current_club_id, when loaded by the caller
}

export interface IdentityMapping {
  fonte: string; // 'cbf', 'fpf', 'ferj', ...
  externalId: string; // athlete id within that source
  bid: number; // canonical fb_id it resolves to
}

export interface IdentityCandidate {
  fonte: string;
  externalId: string;
  cbfBid?: number | null; // 6-digit CBF bid when the source exposes it
  name: string;
  birthDate?: string | null; // ISO when known
  clubId?: string | null; // the club this appearance was for, when resolvable
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

// A source's own name field is sometimes truncated mid-name (real incident:
// a CBF súmula/registry row cut off at "andrey fernandes de", missing
// "oliveira nunes" — confirmed live, Session 57's backfill-cbf-truncated-names.ts
// fixed the row after the fact, but the resolver itself had no way to catch this
// WHILE it was happening: a truncated name never equals the real one, so the
// exact-match tiers below fell straight through to "new" and minted a second
// identity for the same person). A bare trailing preposition is never how a
// real, complete Brazilian name ends — unlike generic prefix containment (e.g.
// "Gabriel da Silva" vs "Gabriel da Silva Campos", already tried and explicitly
// rejected as unreliable, Session 55: both are complete, plausible names on
// their own) — so this is a narrow, structurally-justified signal, not a
// reintroduction of that rejected heuristic. Still never enough alone: only
// used to WIDEN the name-hit pool that birth_date/current-club then confirms,
// same trust bar as the exact-name tiers.
const TRAILING_PREPOSITIONS = new Set(["de", "da", "do", "dos", "das", "e"]);

function looksTruncated(normalized: string): boolean {
  const words = normalized.split(" ");
  return words.length > 0 && TRAILING_PREPOSITIONS.has(words[words.length - 1]!);
}

/** True when `shortName` is exactly `longName` cut off mid-name: a strict
 * word-boundary prefix ending in a bare preposition, never a coincidence. */
function isTruncationOf(shortName: string, longName: string): boolean {
  return shortName !== longName && looksTruncated(shortName) && longName.startsWith(shortName + " ");
}

function namesMatch(a: string, b: string): boolean {
  return a === b || isTruncationOf(a, b) || isTruncationOf(b, a);
}

export function resolveAthleteIdentity(
  candidate: IdentityCandidate,
  ctx: { existing: ExistingAthlete[]; mappings: IdentityMapping[] },
): Resolution {
  // 1. This external id was resolved before → reuse the mapping (idempotent).
  //    Always checked first, even when a bid is present — a stale/reused external
  //    id must never be second-guessed by a raw number.
  const mapped = ctx.mappings.find((m) => m.fonte === candidate.fonte && m.externalId === candidate.externalId);
  if (mapped) {
    return { kind: "mapped", bid: mapped.bid, confidence: "exact", reason: "existing atleta_fontes mapping" };
  }

  // 2. The source's bid already exists as a real atletas row → safe to trust
  //    directly (a CBF-style bid is globally unique in the real world).
  if (isValidBid(candidate.cbfBid)) {
    const existsAsRow = ctx.existing.some((a) => a.bid === candidate.cbfBid);
    if (existsAsRow) {
      return { kind: "bid", bid: candidate.cbfBid, confidence: "exact", reason: "source-provided bid matches an existing athlete row" };
    }
  }

  // 3/4. Try to match by name (+ birth date, or + current club when no birth date
  // is available). Runs even when a brand-new cbfBid is present — that's what
  // catches a cross-source duplicate (e.g. a FERJ-provisional athlete who later
  // shows up in a CBF súmula under their real, never-seen-before bid) instead of
  // trusting the new number blindly. Never merge on weak evidence.
  const wanted = normalizeName(candidate.name);
  const nameHits = wanted ? ctx.existing.filter((a) => namesMatch(normalizeName(a.name), wanted)) : [];

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

  // No birth date: try name + current club as the fallback confirming signal
  // (same trust level as name+birth_date — both are the only two tiers
  // `scan-athlete-duplicates.ts` ever treats as "confirmed").
  if (candidate.clubId) {
    const clubHits = nameHits.filter((a) => a.currentClubId === candidate.clubId);
    if (clubHits.length === 1) {
      return { kind: "matched", bid: clubHits[0]!.bid, confidence: "matched", reason: "name + current club match (admin confirms)" };
    }
    if (clubHits.length > 1) {
      return { kind: "ambiguous", candidates: clubHits.map((a) => a.bid), reason: "multiple athletes share name + current club" };
    }
  }

  // Neither birth_date nor club confirms: cannot safely confirm identity. A name
  // hit must go to review.
  if (nameHits.length > 0) {
    const reason = candidate.clubId
      ? "name matches but neither birth_date nor club confirm"
      : "name matches but no birth_date to confirm";
    return { kind: "ambiguous", candidates: nameHits.map((a) => a.bid), reason };
  }
  return { kind: "new", reason: "no bid, no mapping, no name match" };
}

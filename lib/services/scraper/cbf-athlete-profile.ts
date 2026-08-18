import "server-only";

// FOOTBASE Phase 6.3 — CBF athlete profile (bio source for seeding).
//
// The súmula lists athletes by their 6-digit CBF id but does NOT carry a birth date,
// and `atletas.birth_date` is NOT NULL. So a missing atleta can only be seeded from
// the CBF athlete profile page (`.../atletas/.../{6-digit}`), which supplies the
// canonical name + `birth_date` (and bridges the 6↔11-digit ids when needed).
//
// The profile page is JS-rendered (CBF site is Next.js/RSC), so fetching it needs the
// self-hosted Playwright DISCOVERY step (VPS, free) — the same layer that discovers
// súmula URLs. That runtime is not wired yet and no profile sample has been captured,
// so `fetchCbfAthleteProfile` is intentionally a guarded stub: the pure súmula parser
// and the dry-run pipeline work without it, and live seeding stays blocked until the
// discovery layer + a real profile sample land (and Fase 6.5 gating passes).

export interface CbfAthleteProfile {
  bid: number; // 6-digit CBF id (matches atletas.bid)
  name: string; // canonical full name
  birthDate: string; // ISO date (YYYY-MM-DD)
  nacionalidade?: string | null;
  mainPosition?: string | null;
}

/**
 * Fetch a CBF athlete profile by 6-digit BID. NOT IMPLEMENTED yet — requires the
 * Playwright discovery runtime and a captured profile sample to design the parser.
 * Kept as an explicit boundary so callers can inject already-resolved profiles
 * (e.g. in tests or once discovery is live) without this throwing.
 */
export async function fetchCbfAthleteProfile(bid: number): Promise<CbfAthleteProfile> {
  throw new Error(
    `fetchCbfAthleteProfile(${bid}) not implemented: needs the Playwright discovery ` +
      `runtime + a captured CBF profile sample (6.3 remaining). Inject profiles instead.`,
  );
}

/** Index profiles by BID for O(1) enrichment lookups. */
export function indexProfiles(profiles: CbfAthleteProfile[]): Map<number, CbfAthleteProfile> {
  return new Map(profiles.map((p) => [p.bid, p]));
}

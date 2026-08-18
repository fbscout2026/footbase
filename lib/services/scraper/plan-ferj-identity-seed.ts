// FOOTBASE Phase 6.x — FERJ identity/backfill PLANNER (pure, no IO).
//
// Same shape and intent as `plan-fpf-identity-seed.ts` — turns parsed FERJ athlete
// candidates + current DB state into a PLAN of what would be written, without
// touching the database. FERJ never carries a real CBF bid (its "BIRA" is the
// federation's OWN state registration, confirmed live with the user — see
// `parse-ferj-sumula.ts`'s module doc), so this planner can ONLY:
//   • reuse an existing (ferj, bira) -> bid mapping already recorded, and
//   • record a NEW mapping once an admin (or a future birth-date source) confirms one.
//
// It NEVER seeds a brand-new `atletas` row and NEVER auto-confirms a name-only match
// — same guarantee as the FPF planner, via the same `resolveAthleteIdentity`.
//
// NARROWER than the FPF planner on purpose: FPF has a separate registry endpoint
// (`parse-fpf-atletas.ts`, `ListarAtletas.ashx`) that carries `birth_date`, so its
// planner can also backfill `atletas.birth_date` and refresh nationality/contract
// fields. FERJ has no equivalent source yet — confirmed live, Session 48: the FERJ
// match page's "Escala" tab (which visibly renders birth dates for SOME athletes) is
// a Next.js Server Action, not a plain fetchable endpoint (it needs a build-specific
// `Next-Action` header that isn't stable across FERJ's own redeploys) — reproducing it
// was judged not worth the fragility for now. So EVERY first-time FERJ candidate here
// with no birth date to confirm against goes to `review`, same as it would for FPF
// without its profile endpoint. This is expected, not a bug: admin curation (or a
// future stable birth-date source) is what grows the `atleta_fontes` mapping table
// over time; once mapped, the SAME athlete resolves for free on every later súmula.

import { resolveAthleteIdentity, type ExistingAthlete, type IdentityMapping } from "./resolve-athlete-identity.ts";
import type { IdentityCandidate } from "./resolve-athlete-identity.ts";
import type { FerjParsedAthlete } from "./parse-ferj-events.ts";

export const FERJ_FONTE = "ferj";

export interface FerjClubRef {
  sourceKey: string; // 'ferj:<clubId>'
  externalId: string;
}

export interface FerjAthleteCandidate {
  candidate: IdentityCandidate;
  club: FerjClubRef;
}

/** Turns one match's roster (súmula-derived, `FerjParsedMatch.athletes`) into identity
 * candidates for `resolveAthleteIdentity`. A pure mapping — no IO, no resolution. */
export function ferjAthletesToCandidates(
  athletes: FerjParsedAthlete[],
  clubSourceKey: string,
): FerjAthleteCandidate[] {
  const externalId = clubSourceKey.replace(/^ferj:/, "");
  return athletes.map((a) => ({
    candidate: { fonte: FERJ_FONTE, externalId: a.bira, cbfBid: null, name: a.name, birthDate: null },
    club: { sourceKey: clubSourceKey, externalId },
  }));
}

export interface FerjIdentitySeedPlan {
  mappingsToAdd: IdentityMapping[];
  review: { externalId: string; reason: string; candidates?: number[] }[];
}

export function planFerjIdentitySeed(
  candidates: FerjAthleteCandidate[],
  ctx: { existingAthletes: ExistingAthlete[]; mappings: IdentityMapping[] },
): FerjIdentitySeedPlan {
  const plan: FerjIdentitySeedPlan = { mappingsToAdd: [], review: [] };
  const mappedKeys = new Set(ctx.mappings.map((m) => `${m.fonte}:${m.externalId}`));

  for (const { candidate } of candidates) {
    const res = resolveAthleteIdentity(candidate, { existing: ctx.existingAthletes, mappings: ctx.mappings });

    if (res.kind === "ambiguous") {
      plan.review.push({ externalId: candidate.externalId, reason: res.reason, candidates: res.candidates });
      continue;
    }
    if (res.kind === "new") {
      // No CBF bid available from this source — never fabricate one.
      plan.review.push({ externalId: candidate.externalId, reason: "found only via FERJ, no CBF bid available yet" });
      continue;
    }

    // 'bid' (shouldn't occur — FERJ never carries one) / 'mapped' / 'matched': a real,
    // existing bid. Record the mapping so the same bira resolves for free next time.
    const key = `${candidate.fonte}:${candidate.externalId}`;
    if (!mappedKeys.has(key)) {
      plan.mappingsToAdd.push({ fonte: candidate.fonte, externalId: candidate.externalId, bid: res.bid });
      mappedKeys.add(key);
    }
  }

  return plan;
}

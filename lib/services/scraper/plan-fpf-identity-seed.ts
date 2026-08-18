// FOOTBASE Phase 6.x — FPF identity/backfill PLANNER (pure, no IO).
//
// Turns parsed FPF athlete candidates + current DB state into a PLAN of what would be
// written, without touching the database — same shape/intent as
// `plan-registry-seed.ts`, but deliberately narrower: this source never carries a real
// CBF bid (see `parse-fpf-atletas.ts`), so it can ONLY:
//   • backfill `birth_date` on an EXISTING athlete the candidate resolves to
//     (exact bid / mapped / name+birth_date match), and
//   • record the (fpf, IdAtleta) -> bid mapping for next time (idempotent).
//
// It NEVER seeds a brand-new `atletas` row: a candidate that resolves to "new" means
// this athlete was found only via FPF, with no confirmed CBF bid to use as the primary
// key — CLAUDE.md defines `atletas.bid` as literally the CBF's own id, so inventing one
// here would risk colliding with (or diverging from) the athlete's real bid once a CBF
// source does see them. Those candidates go to `review` instead, same as ambiguous
// matches — an admin decides (e.g. once the athlete's real CBF bid becomes known).

import {
  resolveAthleteIdentity,
  type ExistingAthlete,
  type IdentityMapping,
} from "./resolve-athlete-identity.ts";
import type { FpfAthleteCandidate } from "./parse-fpf-atletas.ts";
import type { FpfAthleteProfile } from "./parse-fpf-athlete-profile.ts";

export interface FpfBirthDateBackfill {
  bid: number;
  birthDate: string;
}

/** Fields the FPF profile (ReadAtleta.ashx) can legitimately update on an EXISTING
 * athlete — "fonte vence" (CLAUDE.md precedence rule), unlike birth_date which this
 * planner deliberately only ever fills once (see FpfBirthDateBackfill). */
export interface FpfProfileRefresh {
  bid: number;
  fields: { nacionalidade?: string; contractEndDate?: string };
}

export interface FpfIdentitySeedPlan {
  birthDateBackfill: FpfBirthDateBackfill[];
  profileRefresh: FpfProfileRefresh[];
  mappingsToAdd: IdentityMapping[];
  review: { externalId: string; reason: string; candidates?: number[] }[];
}

export function planFpfIdentitySeed(
  candidates: FpfAthleteCandidate[],
  ctx: { existingAthletes: ExistingAthlete[]; mappings: IdentityMapping[]; profiles?: FpfAthleteProfile[] },
): FpfIdentitySeedPlan {
  const plan: FpfIdentitySeedPlan = { birthDateBackfill: [], profileRefresh: [], mappingsToAdd: [], review: [] };
  const existingByBid = new Map(ctx.existingAthletes.map((a) => [a.bid, a]));
  const mappedKeys = new Set(ctx.mappings.map((m) => `${m.fonte}:${m.externalId}`));
  // Profiles are fetched by IdAtleta, which is exactly `candidate.externalId` for
  // roster-sourced candidates (`parse-fpf-atletas.ts`).
  const profileByExternalId = new Map((ctx.profiles ?? []).map((p) => [p.idAtleta, p]));

  for (const { candidate } of candidates) {
    const res = resolveAthleteIdentity(candidate, { existing: ctx.existingAthletes, mappings: ctx.mappings });

    if (res.kind === "ambiguous") {
      plan.review.push({ externalId: candidate.externalId, reason: res.reason, candidates: res.candidates });
      continue;
    }
    if (res.kind === "new") {
      // No CBF bid available from this source — never fabricate one.
      plan.review.push({ externalId: candidate.externalId, reason: "found only via FPF, no CBF bid available yet" });
      continue;
    }

    // 'bid' (shouldn't occur — FPF never carries one) / 'mapped' / 'matched': a real,
    // existing bid.
    const bid = res.bid;
    const existing = existingByBid.get(bid);
    const profile = profileByExternalId.get(candidate.externalId);

    // Birth_date: fill the gap only, from whichever source has it — never overwrite a
    // confirmed date (see plan-fpf-identity-seed.ts module doc / tests).
    const birthDate = profile?.birthDate ?? candidate.birthDate;
    if (birthDate && existing && !existing.birthDate) {
      plan.birthDateBackfill.push({ bid, birthDate });
    }

    // Nationality / contract end date: only the profile endpoint has these, and the
    // source is allowed to win (CLAUDE.md precedence) since both can legitimately
    // change (a renewal, a corrected nationality) — never a same-fact conflict like
    // birth_date, so silently overwriting here is safe.
    if (existing && profile && (profile.nacionalidade || profile.contractEndDate)) {
      const fields: FpfProfileRefresh["fields"] = {};
      if (profile.nacionalidade) fields.nacionalidade = profile.nacionalidade;
      if (profile.contractEndDate) fields.contractEndDate = profile.contractEndDate;
      plan.profileRefresh.push({ bid, fields });
    }

    const key = `${candidate.fonte}:${candidate.externalId}`;
    if (!mappedKeys.has(key)) {
      plan.mappingsToAdd.push({ fonte: candidate.fonte, externalId: candidate.externalId, bid });
      mappedKeys.add(key);
    }
  }

  return plan;
}

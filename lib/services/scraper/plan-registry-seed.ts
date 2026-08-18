// FOOTBASE Phase 6.4 — registry seed PLANNER (pure, no IO).
//
// Turns a parsed CBF registry (clubs + athletes) plus the current DB state into a
// PLAN of what would be written, without touching the database. The live executor
// (6.5-gated) just applies the plan. Keeping the decision logic pure makes it
// unit-testable and lets dry-run show exactly what a real run would do.
//
// It encodes the two standing rules:
//  • Single profile per athlete (no duplicates, no false merges): identity is
//    resolved via `resolveAthleteIdentity` (CBF bid → mapping → name+dob → review).
//  • Precedence "súmula/fonte vence": a field the source PROVIDES overwrites the DB;
//    a field the source OMITS is preserved (coalesce, never nulled); governance is
//    never touched (this planner only proposes factual + mapping writes).
//
// FK-safety: an `atleta_fontes` mapping is only planned for a bid that already
// exists OR is being seeded in this same plan (never for a bid still missing a row).

import type { ParsedAthlete } from "./types.ts";
import type { RegistryClub } from "./parse-cbf-registry.ts";
import {
  resolveAthleteIdentity,
  type ExistingAthlete,
  type IdentityMapping,
} from "./resolve-athlete-identity.ts";

export interface ExistingClub {
  sourceKey: string;
  name: string;
  state: string | null;
}

export interface AthleteProfile {
  bid: number;
  birthDate: string;
  name?: string | null;
  nacionalidade?: string | null;
  mainPosition?: string | null;
}

export interface AthleteSeed {
  bid: number;
  name: string;
  birthDate: string | null; // nullable — backfilled later when a source provides it
  nacionalidade: string | null;
  mainPosition: string | null;
}

/** A factual refresh of an existing athlete — only fields the source actually provides. */
export interface AthleteRefresh {
  bid: number;
  fields: { name?: string; birthDate?: string; nacionalidade?: string; mainPosition?: string };
}

export interface RegistrySeedPlan {
  clubsToInsert: RegistryClub[];
  clubsToUpdate: RegistryClub[];
  crestsToProcess: { sourceKey: string; crestUrl: string }[];
  athletesToSeed: AthleteSeed[];
  athletesToRefresh: AthleteRefresh[];
  mappingsToAdd: IdentityMapping[];
  birthDateNeeded: number[]; // seeded without a birth date → enqueue a profile fetch to backfill
  review: { externalId: string; reason: string; candidates?: number[] }[];
}

export function planRegistrySeed(
  registry: { clubs: RegistryClub[]; athletes: ParsedAthlete[] },
  ctx: {
    existingClubs: ExistingClub[];
    existingAthletes: ExistingAthlete[];
    mappings: IdentityMapping[];
    profiles?: AthleteProfile[];
    fonte?: string;
  },
): RegistrySeedPlan {
  const fonte = ctx.fonte ?? "cbf";
  const plan: RegistrySeedPlan = {
    clubsToInsert: [],
    clubsToUpdate: [],
    crestsToProcess: [],
    athletesToSeed: [],
    athletesToRefresh: [],
    mappingsToAdd: [],
    birthDateNeeded: [],
    review: [],
  };

  // --- Clubs ---------------------------------------------------------------
  const existingClubKeys = new Set(ctx.existingClubs.map((c) => c.sourceKey));
  for (const club of registry.clubs) {
    if (existingClubKeys.has(club.sourceKey)) plan.clubsToUpdate.push(club);
    else plan.clubsToInsert.push(club);
    if (club.crestUrl) plan.crestsToProcess.push({ sourceKey: club.sourceKey, crestUrl: club.crestUrl });
  }

  // --- Athletes ------------------------------------------------------------
  const existingBids = new Set(ctx.existingAthletes.map((a) => a.bid));
  const profileByBid = new Map((ctx.profiles ?? []).map((p) => [p.bid, p]));
  const mappedKeys = new Set(ctx.mappings.map((m) => `${m.fonte}:${m.externalId}`));
  const seededNow = new Set<number>();

  for (const a of registry.athletes) {
    const profile = profileByBid.get(a.bid);
    const res = resolveAthleteIdentity(
      { fonte, externalId: String(a.bid), cbfBid: a.bid, name: a.name, birthDate: profile?.birthDate ?? a.birthDate },
      { existing: ctx.existingAthletes, mappings: ctx.mappings },
    );

    // Weak/fuzzy identity is never auto-applied — send it to admin review.
    if (res.kind === "matched" || res.kind === "ambiguous") {
      plan.review.push({ externalId: String(a.bid), reason: res.reason, candidates: "candidates" in res ? res.candidates : [res.bid] });
      continue;
    }

    // 'bid' / 'mapped' → a definite canonical bid; 'new' with a CBF bid seeds under it.
    const bid = res.kind === "new" ? a.bid : res.bid;

    if (existingBids.has(bid)) {
      const fields: AthleteRefresh["fields"] = {};
      if (a.name?.trim()) fields.name = a.name; // source provides → wins
      if (profile?.birthDate) fields.birthDate = profile.birthDate;
      if (profile?.nacionalidade) fields.nacionalidade = profile.nacionalidade;
      if (profile?.mainPosition) fields.mainPosition = profile.mainPosition;
      if (Object.keys(fields).length > 0) plan.athletesToRefresh.push({ bid, fields });
    } else {
      // Seed now (birth_date is nullable); backfill the birth date later via a
      // profile fetch when none is available yet.
      plan.athletesToSeed.push({
        bid,
        name: profile?.name?.trim() || a.name,
        birthDate: profile?.birthDate ?? null,
        nacionalidade: profile?.nacionalidade ?? null,
        mainPosition: profile?.mainPosition ?? null,
      });
      seededNow.add(bid);
      if (!profile?.birthDate) plan.birthDateNeeded.push(bid);
    }

    // Map (fonte, externalId) → bid, but only when the bid row exists/will exist.
    const key = `${fonte}:${a.bid}`;
    if (!mappedKeys.has(key) && (existingBids.has(bid) || seededNow.has(bid))) {
      plan.mappingsToAdd.push({ fonte, externalId: String(a.bid), bid });
      mappedKeys.add(key);
    }
  }

  return plan;
}

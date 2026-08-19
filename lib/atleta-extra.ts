import type { AtletaRecord } from "@/lib/services/atletas";

// ----------------------------------------------------------------------------
// Performance index — ONE honest number (0-100) derived from an athlete's real
// aggregate stats. Used by the comparison matrix and the tactical board's
// ranking, where a single summary number is being shown, not a history.
//
// Session 52: this used to also generate a fake 6-point "evolution" SERIES (a
// deterministic wave seeded by bid, with synthetic noise/trend per point) and
// present it as a per-round chart — reported live by the user as misleading:
// an athlete with exactly 1 real match showed a 6-point trending line. The
// single aggregate number below is still honest (it's real stats, clearly
// presented as "current index", not a fabricated history) — the chart itself
// was moved to `loadEvolucaoReal` (lib/services/atletas.ts), computed from the
// athlete's actual matches, one point per real match, never invented ones.
// ----------------------------------------------------------------------------

// Typed structurally (not `AtletaRecord` directly) so both the real dossiê and
// the still-mock comparison/prancheta features (not yet migrated off
// `lib/mock-data.ts` — Session 52 only converted the /atletas list+detail pages)
// can keep calling this with their own athlete shape.
interface PerformanceInput {
  mainPosition: string | null;
  stats: {
    totalMatches: number; totalGoals: number; totalAssists: number; totalMinutes: number;
    totalCleanSheets: number; timesPlayedAboveCategory: number; totalRedCards: number; totalYellowCards: number;
  };
}

// Weights per appearance-rate: goals/match ×30 · assists/match ×20 · minutes
// ratio ×15 · clean sheets/match ×25 (GK only) · games above category/match
// ×10 · minus red/match ×20 and yellow/match ×4, over a 42 baseline.
export function computePerformanceIndex(a: PerformanceInput): number {
  const m = Math.max(1, a.stats.totalMatches);
  const isGK = a.mainPosition === "GK";
  const base =
    42 +
    (a.stats.totalGoals / m) * 30 +
    (a.stats.totalAssists / m) * 20 +
    Math.min(1, a.stats.totalMinutes / (m * 90)) * 15 +
    (isGK ? (a.stats.totalCleanSheets / m) * 25 : 0) +
    (a.stats.timesPlayedAboveCategory / m) * 10 -
    (a.stats.totalRedCards / m) * 20 -
    (a.stats.totalYellowCards / m) * 4;
  return Math.round(Math.max(30, Math.min(90, base)));
}

// ----------------------------------------------------------------------------
// Club history — explicit entries for a few athletes; the rest fall back to a
// single "current club" entry derived from início de carreira.
// ----------------------------------------------------------------------------
export interface ClubHistoryEntry {
  clubId?: string;
  clubName: string;
  crestUrl?: string | null;
  from: number | null; // null = unknown (real scraped athletes have no início de carreira yet)
  to: number | null; // null = current
}

const HISTORY: Record<number, ClubHistoryEntry[]> = {
  2210662: [
    { clubName: "Base FC", from: 2020, to: 2023 },
    { clubId: "club-pal", clubName: "Palmeiras", from: 2023, to: null },
  ],
  2210995: [
    { clubName: "Litoral EC", from: 2018, to: 2022 },
    { clubId: "club-san", clubName: "Santos", from: 2022, to: null },
  ],
  2210045: [
    { clubName: "Zona Sul FC", from: 2019, to: 2022 },
    { clubId: "club-fla", clubName: "Flamengo", from: 2022, to: null },
  ],
  2211006: [
    { clubName: "Ibéria FC", from: 2017, to: 2021 },
    { clubId: "club-vas", clubName: "Vasco da Gama", from: 2021, to: null },
  ],
  2209888: [
    { clubName: "Interior EC", from: 2018, to: 2022 },
    { clubId: "club-pal", clubName: "Palmeiras", from: 2022, to: null },
  ],
};

export function getHistoricoClubes(a: AtletaRecord): ClubHistoryEntry[] {
  const explicit = HISTORY[a.bid];
  if (explicit) return explicit;
  if (!a.currentClubName) return []; // no known club at all — nothing to show, not a guess
  return [
    {
      clubId: a.currentClubId ?? undefined,
      clubName: a.currentClubName,
      crestUrl: a.currentClubCrestUrl,
      from: a.inicioCarreira ?? (a.anoNascimento ? a.anoNascimento + 14 : null),
      to: null,
    },
  ];
}

import { getClubeById, type MockAtleta } from "@/lib/mock-data";

// ----------------------------------------------------------------------------
// Performance evolution — deterministic series seeded by BID so the chart is
// stable across renders. Values are a 0-100 "desempenho" index per round.
// ----------------------------------------------------------------------------
export interface EvolucaoPoint {
  label: string;
  value: number;
}

function seeded(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

// Composite performance index (0-100). Documented so the dossier caption can
// describe it truthfully. Weights per appearance-rate:
//   goals/match ×30 · assists/match ×20 · minutes ratio ×15 ·
//   clean sheets/match ×25 (GK only) · games above category/match ×10 ·
//   minus red/match ×20 and yellow/match ×4, over a 42 baseline.
// The per-round variation is a deterministic distribution (seeded by BID)
// around this base until real per-match data (atuacoes_sumula) exists.
export function getEvolucao(a: MockAtleta): EvolucaoPoint[] {
  const m = Math.max(1, a.stats.totalMatches);
  const isGK = a.mainPosition === "GK";
  let base =
    42 +
    (a.stats.totalGoals / m) * 30 +
    (a.stats.totalAssists / m) * 20 +
    Math.min(1, a.stats.totalMinutes / (m * 90)) * 15 +
    (isGK ? (a.stats.totalCleanSheets / m) * 25 : 0) +
    (a.stats.timesPlayedAboveCategory / m) * 10 -
    (a.stats.totalRedCards / m) * 20 -
    (a.stats.totalYellowCards / m) * 4;
  base = Math.max(30, Math.min(90, base));

  return Array.from({ length: 6 }, (_, i) => {
    const noise = (seeded(a.bid * 0.001 + i * 13.37) - 0.5) * 16;
    const trend = (i - 2.5) * 1.5;
    return { label: `R${i + 1}`, value: Math.round(Math.max(20, Math.min(99, base + trend + noise))) };
  });
}

// ----------------------------------------------------------------------------
// Club history — explicit entries for a few athletes; the rest fall back to a
// single "current club" entry derived from início de carreira.
// ----------------------------------------------------------------------------
export interface ClubHistoryEntry {
  clubId?: string;
  clubName: string;
  from: number;
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

export function getHistoricoClubes(a: MockAtleta): ClubHistoryEntry[] {
  const explicit = HISTORY[a.bid];
  if (explicit) return explicit;
  const club = getClubeById(a.currentClubId);
  return [
    {
      clubId: a.currentClubId,
      clubName: club?.name ?? "—",
      from: a.inicioCarreira ?? a.anoNascimento + 14,
      to: null,
    },
  ];
}

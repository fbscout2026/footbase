import type { MockAtleta, Position, DominantFoot, Categoria } from "@/lib/mock-data";

type TriState = "" | "yes" | "no";
type Mode = "exact" | "between";

export const CATEGORY_ORDER: Categoria[] = [
  "SUB-11", "SUB-12", "SUB-13", "SUB-14", "SUB-15",
  "SUB-16", "SUB-17", "SUB-18", "SUB-19", "SUB-20",
];
const catRank = (c: Categoria | "") => (c === "" ? -1 : CATEGORY_ORDER.indexOf(c));

export interface AtletaFilterState {
  // identification
  name: string;
  bid: string;
  // categoria (exact | between)
  categoryMode: Mode;
  categoryExact: Categoria | "";
  categoryFrom: Categoria | "";
  categoryTo: Categoria | "";
  // idade (exact | between)
  ageMode: Mode;
  ageExact: string;
  ageFrom: string;
  ageTo: string;
  // altura (exact | between)
  heightMode: Mode;
  heightExact: string;
  heightFrom: string;
  heightTo: string;
  // biographic / physical
  nationality: string;
  foot: DominantFoot | "";
  position: Position | "";
  secondaryPosition: Position | "";
  weightFrom: string;
  weightTo: string;
  // performance
  minMatches: string;
  minMinutes: string;
  minGoals: string;
  minAssists: string;
  gema: boolean; // played above category
  hasVideo: boolean;
  // market
  passport: TriState;
  hasAgent: TriState;
  international: boolean;
  expiringContract: boolean; // ending within 6 months
}

export const emptyFilters: AtletaFilterState = {
  name: "", bid: "",
  categoryMode: "exact", categoryExact: "", categoryFrom: "", categoryTo: "",
  ageMode: "exact", ageExact: "", ageFrom: "", ageTo: "",
  heightMode: "exact", heightExact: "", heightFrom: "", heightTo: "",
  nationality: "", foot: "", position: "", secondaryPosition: "",
  weightFrom: "", weightTo: "",
  minMatches: "", minMinutes: "", minGoals: "", minAssists: "",
  gema: false, hasVideo: false,
  passport: "", hasAgent: "", international: false, expiringContract: false,
};

const num = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function passesRange(value: number, mode: Mode, exact: string, from: string, to: string): boolean {
  if (mode === "exact") {
    const e = num(exact);
    return e === null || value === e;
  }
  const f = num(from);
  const t = num(to);
  if (f !== null && value < f) return false;
  if (t !== null && value > t) return false;
  return true;
}

export function applyFilters(list: MockAtleta[], f: AtletaFilterState): MockAtleta[] {
  const wFrom = num(f.weightFrom);
  const wTo = num(f.weightTo);
  const mMatches = num(f.minMatches);
  const mMinutes = num(f.minMinutes);
  const mGoals = num(f.minGoals);
  const mAssists = num(f.minAssists);
  const name = f.name.trim().toLowerCase();
  const bid = f.bid.trim();

  return list.filter((a) => {
    // identification
    if (name && !a.name.toLowerCase().includes(name) && !(a.apelido ?? "").toLowerCase().includes(name)) return false;
    if (bid && !String(a.bid).includes(bid)) return false;

    // categoria (exact | between) — ordinal
    if (f.categoryMode === "exact") {
      if (f.categoryExact && a.currentCategory !== f.categoryExact) return false;
    } else {
      const r = catRank(a.currentCategory);
      if (f.categoryFrom && r < catRank(f.categoryFrom)) return false;
      if (f.categoryTo && r > catRank(f.categoryTo)) return false;
    }

    // idade / altura
    if (!passesRange(a.age, f.ageMode, f.ageExact, f.ageFrom, f.ageTo)) return false;
    if (!passesRange(a.heightCm, f.heightMode, f.heightExact, f.heightFrom, f.heightTo)) return false;

    // biographic / physical
    if (f.nationality && a.nacionalidade !== f.nationality) return false;
    if (f.foot && a.dominantFoot !== f.foot) return false;
    if (f.position && a.mainPosition !== f.position) return false;
    if (f.secondaryPosition && a.posicaoSecundaria !== f.secondaryPosition) return false;
    if (wFrom !== null && a.weightKg < wFrom) return false;
    if (wTo !== null && a.weightKg > wTo) return false;

    // performance
    if (mMatches !== null && a.stats.totalMatches < mMatches) return false;
    if (mMinutes !== null && a.stats.totalMinutes < mMinutes) return false;
    if (mGoals !== null && a.stats.totalGoals < mGoals) return false;
    if (mAssists !== null && a.stats.totalAssists < mAssists) return false;
    if (f.gema && a.stats.timesPlayedAboveCategory === 0) return false;
    if (f.hasVideo && !a.youtubeVideoUrl) return false;

    // market
    if (f.passport === "yes" && !a.temPassaporte) return false;
    if (f.passport === "no" && a.temPassaporte) return false;
    if (f.hasAgent === "yes" && a.agentId === null) return false;
    if (f.hasAgent === "no" && a.agentId !== null) return false;
    if (f.international && !a.experienciaInternacional) return false;
    if (f.expiringContract && a.contractStatus !== "expiring_soon") return false;

    return true;
  });
}

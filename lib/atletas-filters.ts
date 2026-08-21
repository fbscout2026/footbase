// Positions/categories are open text in the real data (not every position has an
// abbreviation code in the roster source), but the filter UI still needs a fixed
// vocabulary — kept here rather than re-importing the old mock's closed unions.
export type Position = "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";
export type DominantFoot = "left" | "right" | "both";
export type Categoria =
  | "SUB-11" | "SUB-12" | "SUB-13" | "SUB-14" | "SUB-15"
  | "SUB-16" | "SUB-17" | "SUB-18" | "SUB-19" | "SUB-20";

type TriState = "" | "yes" | "no";
type Mode = "exact" | "between";

export const CATEGORY_ORDER: Categoria[] = [
  "SUB-11", "SUB-12", "SUB-13", "SUB-14", "SUB-15",
  "SUB-16", "SUB-17", "SUB-18", "SUB-19", "SUB-20",
];
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

export const num = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};


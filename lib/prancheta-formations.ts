export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "4-2-3-1";
export type TacticalPosition = "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";

export interface FormationSlot {
  id: string;
  position: TacticalPosition;
  acceptedPositions: TacticalPosition[];
  x: number;
  y: number;
}

const slot = (
  id: string,
  position: TacticalPosition,
  x: number,
  y: number,
  acceptedPositions: TacticalPosition[] = [position]
): FormationSlot => ({ id, position, acceptedPositions, x, y });

export const FORMATION_SLOTS: Record<Formation, FormationSlot[]> = {
  "4-3-3": [
    slot("gk", "GK", 50, 91),
    slot("rb", "RB", 82, 73), slot("cb-r", "CB", 61, 78),
    slot("cb-l", "CB", 39, 78), slot("lb", "LB", 18, 73),
    slot("dm", "DM", 50, 59),
    slot("cm-r", "CM", 66, 45),
    slot("cm-l", "CM", 34, 45),
    slot("rw", "RW", 80, 22),
    slot("st", "ST", 50, 14), slot("lw", "LW", 20, 22),
  ],
  "4-4-2": [
    slot("gk", "GK", 50, 91),
    slot("rb", "RB", 82, 73), slot("cb-r", "CB", 61, 78),
    slot("cb-l", "CB", 39, 78), slot("lb", "LB", 18, 73),
    slot("rm", "RW", 80, 47),
    slot("cm-r", "CM", 60, 53),
    slot("cm-l", "CM", 40, 53),
    slot("lm", "LW", 20, 47),
    slot("st-r", "ST", 61, 18), slot("st-l", "ST", 39, 18),
  ],
  "3-5-2": [
    slot("gk", "GK", 50, 91),
    slot("cb-r", "CB", 70, 76), slot("cb", "CB", 50, 80), slot("cb-l", "CB", 30, 76),
    slot("rm", "RW", 84, 49),
    slot("dm", "DM", 50, 61),
    slot("cm-r", "CM", 66, 47),
    slot("am", "AM", 50, 35),
    slot("lm", "LW", 16, 49),
    slot("st-r", "ST", 61, 16), slot("st-l", "ST", 39, 16),
  ],
  "4-2-3-1": [
    slot("gk", "GK", 50, 91),
    slot("rb", "RB", 82, 73), slot("cb-r", "CB", 61, 78),
    slot("cb-l", "CB", 39, 78), slot("lb", "LB", 18, 73),
    slot("dm-r", "DM", 61, 58),
    slot("dm-l", "DM", 39, 58, ["DM", "CM"]),
    slot("rw", "RW", 80, 34),
    slot("am", "AM", 50, 35),
    slot("lw", "LW", 20, 34),
    slot("st", "ST", 50, 14),
  ],
};

export const FORMATIONS = Object.keys(FORMATION_SLOTS) as Formation[];

export function isFormation(value: string): value is Formation {
  return FORMATIONS.includes(value as Formation);
}

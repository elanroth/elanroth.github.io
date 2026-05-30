import type { Seat } from "../../engine/types";

// Where a given seat sits relative to the viewer, who is always rendered "south".
export type RelPos = "bottom" | "top" | "left" | "right";

const SEAT_ORDER: Seat[] = ["N", "E", "S", "W"];
const POS_BY_TARGET: Record<Seat, RelPos> = { N: "top", E: "right", S: "bottom", W: "left" };

export function relPos(seat: Seat, local: Seat): RelPos {
  const localIdx = SEAT_ORDER.indexOf(local);
  const shift = (2 - localIdx + 4) % 4; // align local → "S" (index 2)
  const target = SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + shift) % 4];
  return POS_BY_TARGET[target];
}

// Rotation in degrees to make a card visually "face" the viewer when sitting on the table edge.
// partner (top): 180°, left: 90°, right: -90° (or 270°), self (bottom): 0°
export function rotationFor(seat: Seat, local: Seat): number {
  const pos = relPos(seat, local);
  return { bottom: 0, top: 180, left: 90, right: 270 }[pos];
}

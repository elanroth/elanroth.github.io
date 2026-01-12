import type { Coord, TileId, TilesById } from "./types";
import { add, snapCoord } from "./coords";
import { isOccupied } from "./board";

export type TypingModeState = {
  enabled: boolean;
  cursor: Coord;
  advanceDir: "right" | "down";
};

export function initialTypingModeState(): TypingModeState {
  return { enabled: false, cursor: { x: 0, y: 0 }, advanceDir: "right" };
}

export function moveCursor(cursor: Coord, direction: "up" | "down" | "left" | "right"): Coord {
  const delta: Coord =
    direction === "up"
      ? { x: 0, y: -1 }
      : direction === "down"
        ? { x: 0, y: 1 }
        : direction === "left"
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 };
  return snapCoord(add(cursor, delta));
}

export function advanceCursorUntilOpen(
  tiles: TilesById,
  start: Coord,
  direction: "up" | "down" | "left" | "right",
  maxSteps = 64
): Coord {
  let current = start;
  for (let i = 0; i < maxSteps; i++) {
    if (!isOccupied(tiles, current)) return snapCoord(current);
    current = moveCursor(current, direction);
  }
  return snapCoord(current);
}

export function findRackTileForLetter(tiles: TilesById, rackOrder: readonly TileId[], letter: string): TileId | null {
  const target = letter.toUpperCase();
  for (const id of rackOrder) {
    const t = tiles[id];
    if (!t) continue;
    if (t.location !== "rack") continue;
    if (t.letter.toUpperCase() === target) return id;
  }
  return null;
}

export function canPlaceAt(tiles: TilesById, pos: Coord): boolean {
  return !isOccupied(tiles, pos);
}

export function boardTileAt(tiles: TilesById, pos: Coord): TileId | null {
  const p = snapCoord(pos);
  for (const t of Object.values(tiles)) {
    if (t.location !== "board") continue;
    if (t.pos.x === p.x && t.pos.y === p.y) return t.id;
  }
  return null;
}

export function normalizeLetterKey(key: string): string | null {
  if (key.length !== 1) return null;
  if (!/[a-z]/i.test(key)) return null;
  return key.toUpperCase();
}

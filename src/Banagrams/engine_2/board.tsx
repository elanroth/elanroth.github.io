import type { Coord, TileId, TilesById } from "./types";
import { add, equalsCoord, snapCoord } from "./coords";

export function boardBounds(tiles: TilesById): { min: Coord; max: Coord } | null {
  const boardTiles = Object.values(tiles).filter(t => t.location === "board");
  if (boardTiles.length === 0) return null;
  let minX = boardTiles[0].pos.x, maxX = minX;
  let minY = boardTiles[0].pos.y, maxY = minY;
  for (const t of boardTiles) {
    minX = Math.min(minX, t.pos.x); maxX = Math.max(maxX, t.pos.x);
    minY = Math.min(minY, t.pos.y); maxY = Math.max(maxY, t.pos.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export function translateBoardTiles(tiles: TilesById, delta: Coord): TilesById {
  const next: TilesById = { ...tiles };
  for (const [id, t] of Object.entries(tiles)) {
    if (t.location !== "board") continue;
    next[id] = { ...t, pos: add(t.pos, delta) };
  }
  return next;
}

export function boardTileIds(tiles: TilesById): TileId[] {
  const ids: TileId[] = [];
  for (const t of Object.values(tiles)) if (t.location === "board") ids.push(t.id);
  return ids;
}

export function snapTilesByIds(tiles: TilesById, tileIds: readonly TileId[]): TilesById {
  const next: TilesById = { ...tiles };
  for (const id of tileIds) {
    const t = next[id]; if (!t) continue;
    next[id] = { ...t, pos: snapCoord(t.pos) };
  }
  return next;
}

export function snapAllBoardTiles(tiles: TilesById): TilesById {
  return snapTilesByIds(tiles, boardTileIds(tiles));
}

export function isOccupied(tiles: TilesById, pos: Coord): boolean {
  const p = snapCoord(pos);
  return Object.values(tiles).some(t => t.location === "board" && equalsCoord(t.pos, p));
}

export function tilesInWorldRect(
  tiles: TilesById,
  rect: { min: Coord; max: Coord },
  opts?: { location?: "board" | "rack" }
): TileId[] {
  const ids: TileId[] = [];
  for (const t of Object.values(tiles)) {
    if (opts?.location && t.location !== opts.location) continue;
    if (t.pos.x >= rect.min.x && t.pos.x <= rect.max.x &&
        t.pos.y >= rect.min.y && t.pos.y <= rect.max.y) ids.push(t.id);
  }
  return ids;
}

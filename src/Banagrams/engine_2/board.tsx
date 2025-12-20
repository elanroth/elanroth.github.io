import type { Coord, TileId, TilesById, TileState } from "./types";
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

export function getValidWords(tiles: TilesById, dictionary: Set<string>): {
    valid: Set<string>;
    invalid: Set<string>;
    validBoard: boolean;
} | null {

  if (!dictionary) return null;
  const boardOnly = Object.values(tiles).filter((t) => t.location === "board" && 
                                                       Number.isInteger(t.pos.x) && 
                                                       Number.isInteger(t.pos.y))

  if (boardOnly.length === 0) return { valid: new Set<TileId>(), invalid: new Set<TileId>(), validBoard: true };

  const byRow: Record<number, TileState[]> = {};
  const byCol: Record<number, TileState[]> = {};
  for (const t of boardOnly) {
    (byRow[t.pos.y] ||= []).push(t);
    (byCol[t.pos.x] ||= []).push(t);
  }

  const valid = new Set<TileId>();
  const invalid = new Set<TileId>();
  const singletons: TileState[] = [];

  function isContiguous(nodes: TileState[]): boolean {
    if (nodes.length <= 1) return true;
    const key = (c: Coord) => `${c.x},${c.y}`;
    const all = new Set(nodes.map((t) => key(t.pos)));
    const visited = new Set<string>();
    const queue: TileState[] = [nodes[0]];
    while (queue.length) {
      const current = queue.pop()!;
      const k = key(current.pos);
      if (visited.has(k)) continue;
      visited.add(k);
      const neighbors = [
        { x: current.pos.x + 1, y: current.pos.y },
        { x: current.pos.x - 1, y: current.pos.y },
        { x: current.pos.x, y: current.pos.y + 1 },
        { x: current.pos.x, y: current.pos.y - 1 },
      ];
      for (const n of neighbors) {
        const nk = key(n);
        if (all.has(nk) && !visited.has(nk)) {
          const next = nodes.find((t) => t.pos.x === n.x && t.pos.y === n.y);
          if (next) queue.push(next);
        }
      }
    }
    return visited.size === nodes.length;
  }

  function process(group: TileState[], axis: "row" | "col") {
    if (!dictionary) return
    const sorted = group.slice().sort((a, b) => (axis === "row" ? a.pos.x - b.pos.x : a.pos.y - b.pos.y));
    let run: TileState[] = [];
    for (let i = 0; i <= sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];
      const isBreak =
        i === sorted.length ||
        (prev && curr && (axis === "row" ? curr.pos.x - prev.pos.x > 1 : curr.pos.y - prev.pos.y > 1));
      if (isBreak) {
        if (run.length === 1) {
          singletons.push(run[0]);
        } else if (run.length >= 2) {
          const word = run.map((t) => t.letter).join("").toUpperCase();
          const isValid = dictionary.has(word);
          for (const t of run) (isValid ? valid : invalid).add(t.id);
        }
        run = [];
      }
      if (i < sorted.length) run.push(curr!);
    }
  }

  Object.values(byRow).forEach((row) => process(row, "row"));
  Object.values(byCol).forEach((col) => process(col, "col"));

  var validBoard = true

  for (const t of singletons) {
    if (!valid.has(t.id)) invalid.add(t.id);
  }

  for (const t of boardOnly) {
    if (!valid.has(t.id)) validBoard = false
    if (!valid.has(t.id) && !invalid.has(t.id)) invalid.add(t.id);
  }

  // enforce contiguity (orthogonal adjacency only)
  if (!isContiguous(boardOnly)) validBoard = false;

  return { valid, invalid, validBoard }
}

export function validateBoard(tiles: TilesById, dictionary: Set<string>): boolean {
  const validation = getValidWords(tiles, dictionary)
  if (validation == null) return false
  return validation.validBoard
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

import type { Coord, GameState, TileId, TileState, TilesById } from "./types";
import { snapCoord, add } from "./coords";
import { isOccupied, validateBoard } from "./board";

export function makeTile(letter: string, owner: string): TileState {
  const id = `t_${letter}_${Math.random().toString(36).slice(2)}`;
  return { id, letter, pos: { x: 0, y: 0 }, location: "rack", owner };
}

export function giveLetters(state: GameState, letters: string[]): GameState {
  const nextTiles: TilesById = { ...state.tiles };
  const nextRack = [...state.rack];
  for (const letter of letters) {
    const t = makeTile(letter, state.selfId);
    nextTiles[t.id] = t; nextRack.push(t.id);
  }

  return { ...state, tiles: nextTiles, rack: nextRack };
}

export function drawTiles(state: GameState, count: number): GameState {
  if (count === -1) {
    return giveLetters(state, 'DOTO'.split(""))
  }
  if (count <= 0 || state.bag.length === 0) return state;
  const take = Math.min(count, state.bag.length);
  const drawnLetters = state.bag.slice(0, take);
  const remainingBag = state.bag.slice(take);

  const nextTiles: TilesById = { ...state.tiles };
  const nextRack = [...state.rack];
  for (const letter of drawnLetters) {
    const t = makeTile(letter, state.selfId);
    nextTiles[t.id] = t; nextRack.push(t.id);
  }
  return { ...state, tiles: nextTiles, rack: nextRack, bag: remainingBag };
}

export function peel(state: GameState): GameState {
  const words = state.dictionary.words;
  if (!words) return state;
  if (!validateBoard(state.tiles, words)) return state;
  return drawTiles(state, 1)
}

// export function peel(state: GameState): { endState: GameState, success: boolean } {
//   const words = state.dictionary.words
//   if (!words) return { endState: state, success: false }
//   if (!validateBoard(state.tiles, state.dictionary.words)) return { endState: state, success: false }
//   return { endState: drawTiles(state, 1), success: true }
// }

export function dumpTiles(state: GameState, tileIds: readonly TileId[]): GameState {
  if (tileIds.length === 0) return state;
  const bag = state.bag.slice(); if (bag.length < 3) return state;

  for (const id of tileIds) {
    const t = state.tiles[id];
    if (!t || t.owner !== state.selfId) return state;
    if (t.location == "board") {
      state = returnTileToRack(state, id)
    }
  }

  const nextTiles: TilesById = { ...state.tiles };
  const nextRack: TileId[] = [];
  for (const id of state.rack) {
    if (tileIds.includes(id)) delete nextTiles[id];
    else nextRack.push(id);
  }

  for (const id of tileIds) bag.push(state.tiles[id].letter)

  const drawCount = Math.min(3 * tileIds.length, 3 * bag.length);
  for (let i = 0; i < drawCount; i++) {
    const pick = Math.floor(Math.random() * bag.length);
    const letter = bag[pick];
    bag[pick] = bag[bag.length - 1]; bag.pop();
    const newId = `t_${letter}_${Math.random().toString(36).slice(2)}`;
    nextTiles[newId] = { id: newId, letter, pos: { x: 0, y: 0 }, location: "rack", owner: state.selfId };
    nextRack.push(newId);
  }

  const nextSelection = { ...state.selection };
  for (const id of tileIds) delete nextSelection[id];

  return { ...state, tiles: nextTiles, rack: nextRack, bag, selection: nextSelection };
}

export function placeTile(state: GameState, tileId: string, pos: Coord): GameState {
  const t = state.tiles[tileId]; if (!t) return state;
  const p = snapCoord(pos); if (isOccupied(state.tiles, p)) return state;
  const nextTiles: TilesById = { ...state.tiles, [tileId]: { ...t, location: "board", pos: p } };
  const nextRack = state.rack.filter((id) => id !== tileId);
  return { ...state, tiles: nextTiles, rack: nextRack };
}

export function moveTile(state: GameState, tileId: string, pos: Coord): GameState {
  const t = state.tiles[tileId]; if (!t || t.location !== "board") return state;
  const p = snapCoord(pos); if (isOccupied(state.tiles, p)) return state;
  const nextTiles: TilesById = { ...state.tiles, [tileId]: { ...t, pos: p } };
  return { ...state, tiles: nextTiles };
}

export function moveTiles(state: GameState, tileIds: readonly TileId[], delta: Coord): GameState {
  if (tileIds.length === 0) return state;
  const nextTiles: TilesById = { ...state.tiles };
  const targets: Record<TileId, Coord> = {};

  for (const id of tileIds) {
    const t = state.tiles[id];
    if (!t || t.location !== "board") return state;
    targets[id] = snapCoord(add(t.pos, delta));
  }

  // detect collisions with non-moved tiles
  for (const [id, target] of Object.entries(targets)) {
    const occupied = Object.values(state.tiles).some((t) => {
      if (t.location !== "board") return false;
      if (tileIds.includes(t.id)) return false;
      return t.pos.x === target.x && t.pos.y === target.y;
    });
    if (occupied) return state;
    // prevent collisions among targets
    for (const [otherId, otherTarget] of Object.entries(targets)) {
      if (otherId === id) continue;
      if (otherTarget.x === target.x && otherTarget.y === target.y) return state;
    }
  }

  for (const [id, target] of Object.entries(targets)) {
    const t = nextTiles[id];
    if (t) nextTiles[id] = { ...t, pos: target };
  }

  return { ...state, tiles: nextTiles };
}

export function returnTileToRack(state: GameState, tileId: TileId): GameState {
  const tile = state.tiles[tileId];
  if (!tile || tile.location !== "board") return state;
  if (tile.owner !== state.selfId) return state;

  const nextTiles: TilesById = { ...state.tiles, [tileId]: { ...tile, location: "rack", pos: { x: 0, y: 0 } } };
  const nextRack = [...state.rack.filter((id) => id !== tileId), tileId];
  const nextSelection = { ...state.selection };
  delete nextSelection[tileId];

  return { ...state, tiles: nextTiles, rack: nextRack, selection: nextSelection };
}

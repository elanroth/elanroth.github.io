// src/engine/functions.ts
import type {
  Action,
  Coord,
  GameState,
  TileId,
  TileState,
  TilesById,
} from "./types";

// ---------- Utilities ----------
export function add(a: Coord, b: Coord): Coord {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Coord, b: Coord): Coord {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function clampRect(rect: { a: Coord; b: Coord }): { min: Coord; max: Coord } {
  const min = { x: Math.min(rect.a.x, rect.b.x), y: Math.min(rect.a.y, rect.b.y) };
  const max = { x: Math.max(rect.a.x, rect.b.x), y: Math.max(rect.a.y, rect.b.y) };
  return { min, max };
}

// ---------- Core selection ----------
export function setSelection(state: GameState, tileIds: readonly TileId[]): GameState {
  const next: Record<TileId, true> = {};
  for (const id of tileIds) next[id] = true;
  return { ...state, selection: next };
}

export function clearSelection(state: GameState): GameState {
  return { ...state, selection: {} };
}

// ---------- Board bounds + centering ----------
export function boardBounds(tiles: TilesById): { min: Coord; max: Coord } | null {
  const boardTiles = Object.values(tiles).filter(t => t.location === "board");
  if (boardTiles.length === 0) return null;

  let minX = boardTiles[0].pos.x, maxX = boardTiles[0].pos.x;
  let minY = boardTiles[0].pos.y, maxY = boardTiles[0].pos.y;

  for (const t of boardTiles) {
    minX = Math.min(minX, t.pos.x);
    maxX = Math.max(maxX, t.pos.x);
    minY = Math.min(minY, t.pos.y);
    maxY = Math.max(maxY, t.pos.y);
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

export function centerBoard(state: GameState): GameState {
  const bounds = boardBounds(state.tiles);
  if (!bounds) return state;

  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };

  // translate so center goes to (0,0)
  const delta = { x: -center.x, y: -center.y };
  return { ...state, tiles: translateBoardTiles(state.tiles, delta) };
}

// ---------- Snapping ----------
export function snapCoord(pos: Coord): Coord {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

export function snapTiles(tiles: TilesById, tileIds: readonly TileId[]): TilesById {
  const next: TilesById = { ...tiles };
  for (const id of tileIds) {
    const t = next[id];
    if (!t) continue;
    next[id] = { ...t, pos: snapCoord(t.pos) };
  }
  return next;
}

// ---------- Marquee selection helpers ----------
// You will need screen->world conversion in UI.
// This function assumes you already give it a world-rect.
export function tilesInWorldRect(
  tiles: TilesById,
  rect: { min: Coord; max: Coord },
  opts?: { location?: "board" | "rack" }
): TileId[] {
  const ids: TileId[] = [];
  for (const t of Object.values(tiles)) {
    if (opts?.location && t.location !== opts.location) continue;
    if (
      t.pos.x >= rect.min.x && t.pos.x <= rect.max.x &&
      t.pos.y >= rect.min.y && t.pos.y <= rect.max.y
    ) {
      ids.push(t.id);
    }
  }
  return ids;
}

// ---------- Dragging pipeline (state machine) ----------
export function beginDrag(state: GameState, tileIds: readonly TileId[], startMouse: Coord): GameState {
  const startPositions: Record<TileId, Coord> = {};
  for (const id of tileIds) {
    const t = state.tiles[id];
    if (t) startPositions[id] = t.pos;
  }
  return {
    ...state,
    drag: {
      kind: "dragging",
      tileIds: [...tileIds],
      startMouse,
      startPositions,
    },
  };
}

// NOTE: dragUpdate needs a px->world conversion factor.
// Keep it as a parameter so engine stays pure.
export function dragUpdate(
  state: GameState,
  mouse: Coord,
  pxToWorld: (dxPx: number, dyPx: number) => Coord
): GameState {
  if (state.drag.kind !== "dragging") return state;

  const dxPx = mouse.x - state.drag.startMouse.x;
  const dyPx = mouse.y - state.drag.startMouse.y;
  const delta = pxToWorld(dxPx, dyPx);

  const nextTiles: TilesById = { ...state.tiles };
  for (const id of state.drag.tileIds) {
    const start = state.drag.startPositions[id];
    const t = nextTiles[id];
    if (!start || !t) continue;
    nextTiles[id] = { ...t, pos: add(start, delta) };
  }

  return { ...state, tiles: nextTiles };
}

export function endDrag(state: GameState): GameState {
  if (state.drag.kind !== "dragging") return state;

  // TODO: snap-to-grid + legality checks + possibly revert
  const snapped = snapTiles(state.tiles, state.drag.tileIds);

  return {
    ...state,
    tiles: snapped,
    drag: { kind: "none" },
  };
}

// ---------- Drawing / peel ----------
function makeTile(letter: string, owner: string): TileState {
  const id = `t_${letter}_${Math.random().toString(36).slice(2)}`;
  return {
    id,
    letter,
    pos: { x: 0, y: 0 },
    location: "rack",
    owner,
  };
}

function drawTiles(state: GameState, count: number): GameState {
  if (count <= 0 || state.bag.length === 0) return state;

  const take = Math.min(count, state.bag.length);
  const drawnLetters = state.bag.slice(0, take);
  const remainingBag = state.bag.slice(take);

  const nextTiles: TilesById = { ...state.tiles };
  const nextRack = [...state.rack];

  for (const letter of drawnLetters) {
    const t = makeTile(letter, state.selfId);
    nextTiles[t.id] = t;
    nextRack.push(t.id);
  }

  return { ...state, tiles: nextTiles, rack: nextRack, bag: remainingBag };
}

// ---------- Dumping (skeleton) ----------
export function dumpSelected(state: GameState): GameState {
  const selectedIds = Object.keys(state.selection);
  if (selectedIds.length === 0) return state;

  for (const id of selectedIds) {
    const t = state.tiles[id];
    if (!t || t.location !== "rack" || t.owner !== state.selfId) return state;
  }

  const nextTiles: TilesById = { ...state.tiles };
  const nextRack: TileId[] = [];
  for (const id of state.rack) {
    if (state.selection[id]) {
      delete nextTiles[id];
    } else {
      nextRack.push(id);
    }
  }

  const bag: string[] = state.bag.slice();
  for (const id of selectedIds) {
    bag.push(state.tiles[id].letter);
  }

  const drawCount = Math.min(selectedIds.length, bag.length);
  const drawn: string[] = [];
  for (let i = 0; i < drawCount; i++) {
    const pick = Math.floor(Math.random() * bag.length);
    drawn.push(bag[pick]);
    bag[pick] = bag[bag.length - 1];
    bag.pop();
  }

  for (const letter of drawn) {
    const id = `t_${letter}_${Math.random().toString(36).slice(2)}`;
    nextTiles[id] = {
      id,
      letter,
      pos: { x: 0, y: 0 },
      location: "rack",
      owner: state.selfId,
    };
    nextRack.push(id);
  }

  return { ...state, tiles: nextTiles, rack: nextRack, bag, selection: {} };
}

// ---------- Reducer skeleton using helpers ----------
export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SELECT_SET":
      return setSelection(state, action.tileIds);
    case "SELECT_CLEAR":
      return clearSelection(state);

    case "DRAG_BEGIN":
      return beginDrag(state, action.tileIds, action.mouse);

    case "DRAG_UPDATE":
      // Provide pxToWorld from UI; placeholder is identity until you wire it.
      return dragUpdate(state, action.mouse, (dxPx, dyPx) => ({ x: dxPx, y: dyPx }));

    case "DRAG_END":
      return endDrag(state);

    case "DRAW":
      return drawTiles(state, action.count);

    case "PLACE_TILE": {
      const t = state.tiles[action.tileId];
      if (!t) return state;
      const nextTiles: TilesById = { ...state.tiles, [action.tileId]: { ...t, location: "board", pos: snapCoord(action.pos) } };
      const nextRack = state.rack.filter((id) => id !== action.tileId);
      return { ...state, tiles: nextTiles, rack: nextRack };
    }

    case "MOVE_TILE": {
      const t = state.tiles[action.tileId];
      if (!t || t.location !== "board") return state;
      const nextTiles: TilesById = { ...state.tiles, [action.tileId]: { ...t, pos: snapCoord(action.pos) } };
      return { ...state, tiles: nextTiles };
    }

    case "CENTER_BOARD":
      return centerBoard(state);

    case "DUMP_SELECTED":
      return dumpSelected(state);

    default:
      return state;
  }
}



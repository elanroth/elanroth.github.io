import type { Coord, GameState, TileId, TilesById } from "./types";
import { add } from "./coords";
import { snapTilesByIds } from "./board";

export function beginMarquee(state: GameState, startMouse: Coord): GameState {
  return { ...state, drag: { kind: "marquee", startMouse, currentMouse: startMouse } };
}

export function updateMarquee(state: GameState, mouse: Coord): GameState {
  if (state.drag.kind !== "marquee") return state;
  return { ...state, drag: { ...state.drag, currentMouse: mouse } };
}

export function endMarquee(state: GameState): GameState {
  if (state.drag.kind !== "marquee") return state;
  return { ...state, drag: { kind: "none" } };
}

export function beginDrag(state: GameState, tileIds: readonly TileId[], startMouse: Coord): GameState {
  const startPositions: Record<TileId, Coord> = {};
  for (const id of tileIds) {
    const t = state.tiles[id];
    if (t) startPositions[id] = t.pos;
  }
  return { ...state, drag: { kind: "dragging", tileIds: [...tileIds], startMouse, startPositions } };
}

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
  const snapped = snapTilesByIds(state.tiles, state.drag.tileIds);
  return { ...state, tiles: snapped, drag: { kind: "none" } };
}

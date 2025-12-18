import type { GameState, TileId } from "./types";

export function setSelection(state: GameState, tileIds: readonly TileId[]): GameState {
  const next: Record<TileId, true> = {};
  for (const id of tileIds) next[id] = true;
  return { ...state, selection: next };
}

export function clearSelection(state: GameState): GameState {
  return { ...state, selection: {} };
}

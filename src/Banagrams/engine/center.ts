import type { GameState } from "./types";
import { boardBounds, translateBoardTiles, snapAllBoardTiles } from "./board";

export function centerBoard(state: GameState): GameState {
  const bounds = boardBounds(state.tiles);
  if (!bounds) return state;

  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };

  // Not sure why the -1 constant works to get actual center
  const moved = translateBoardTiles(state.tiles, { x: -center.x - 1, y: -center.y - 1 });
  const snapped = snapAllBoardTiles(moved);
  return { ...state, tiles: snapped };
}

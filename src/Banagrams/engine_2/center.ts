import type { GameState } from "./types";
import { boardBounds, translateBoardTiles, snapAllBoardTiles } from "./board";

export function centerBoard(state: GameState): GameState {
  const bounds = boardBounds(state.tiles);
  if (!bounds) return state;

  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };

  const moved = translateBoardTiles(state.tiles, { x: -center.x, y: -center.y });
  const snapped = snapAllBoardTiles(moved);
  return { ...state, tiles: snapped };
}

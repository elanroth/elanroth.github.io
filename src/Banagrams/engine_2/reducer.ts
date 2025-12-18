import type { Action, GameState } from "./types";
import { setSelection, clearSelection } from "./selection";
import { beginDrag, dragUpdate, endDrag } from "./drag";
import { drawTiles, dumpTiles, moveTile, placeTile } from "./tiles";
import { centerBoard } from "./center";

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "STATE_REPLACE":  return action.next;
    case "REMOTE_BOARDS_MERGE": {
      const merged = { ...action.boards };
      if (state.selfId in merged) delete merged[state.selfId];
      return { ...state, remoteBoards: merged };
    }
    case "SELECT_SET":     return setSelection(state, action.tileIds);
    case "SELECT_CLEAR":   return clearSelection(state);
    case "DRAG_BEGIN":     return beginDrag(state, action.tileIds, action.mouse);
    case "DRAG_UPDATE":    return dragUpdate(state, action.mouse, (dxPx, dyPx) => ({ x: dxPx, y: dyPx }));
    case "DRAG_END":       return endDrag(state);
    case "DRAW":           return drawTiles(state, action.count);
    case "PLACE_TILE":     return placeTile(state, action.tileId, action.pos);
    case "MOVE_TILE":      return moveTile(state, action.tileId, action.pos);
    case "CENTER_BOARD":   return centerBoard(state);
    case "DUMP_TILE":      return dumpTiles(state, [action.tileId]);
    case "DUMP_SELECTED":  return dumpTiles(state, Object.keys(state.selection));
    default:               return state;
  }
}

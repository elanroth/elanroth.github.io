import type { Action, GameState, RemoteBoard } from "./types";
import { setSelection, clearSelection } from "./selection";
import { beginDrag, dragUpdate, endDrag, beginMarquee, updateMarquee, endMarquee } from "./drag";
import { drawTiles, dumpTiles, moveTile, placeTile, moveTiles, peel, returnTileToRack, giveLetters, applyDump, shuffleRack } from "./tiles";
import type { GameOptions } from "./types";
import { centerBoard } from "./center";

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "STATE_REPLACE":  return action.next;
    case "REMOTE_BOARDS_MERGE": {
      const merged: Record<string, RemoteBoard> = { ...action.boards };
      if (state.selfId in merged) delete merged[state.selfId];
      return { ...state, remoteBoards: merged };
    }
    case "PLAYERS_MERGE":  return { ...state, players: { ...state.players, ...action.players } };
    case "BAG_SET":        return { ...state, bag: action.bag };
    case "STATUS_SET":     return { ...state, status: action.status };
    case "ADD_LETTERS":    return giveLetters(state, action.letters);
    case "DICT_LOADING":   return { ...state, dictionary: { status: "loading", words: null } };
    case "DICT_READY":     return { ...state, dictionary: { status: "ready", words: action.words } };
    case "DICT_ERROR":     return { ...state, dictionary: { status: "error", words: null, error: action.error } };
    case "OPTIONS_SET": {
      const merged: GameOptions = { ...state.options, ...action.options };
      return { ...state, options: merged };
    }
    case "NEXT_LOBBY_SET": return { ...state, nextLobbyId: action.nextLobbyId };
    case "SELECT_SET":     return setSelection(state, action.tileIds);
    case "SELECT_CLEAR":   return clearSelection(state);
    case "DRAG_BEGIN":     return beginDrag(state, action.tileIds, action.mouse);
    case "DRAG_UPDATE":    return dragUpdate(state, action.mouse, (dxPx, dyPx) => ({ x: dxPx, y: dyPx }));
    case "DRAG_END":       return endDrag(state);
    case "MARQUEE_BEGIN":  return beginMarquee(state, action.mouse);
    case "MARQUEE_UPDATE": return updateMarquee(state, action.mouse);
    case "MARQUEE_END":    return endMarquee(state);
    case "DRAW":           return drawTiles(state, action.count);
    case "PEEL":           return peel(state)
    case "PLACE_TILE":     return placeTile(state, action.tileId, action.pos);
    case "MOVE_TILE":      return moveTile(state, action.tileId, action.pos);
    case "MOVE_TILES":     return moveTiles(state, action.tileIds, action.delta);
    case "RETURN_TO_RACK": return returnTileToRack(state, action.tileId);
    case "SHUFFLE_RACK":   return shuffleRack(state);
    case "CENTER_BOARD":   return centerBoard(state);
    case "DUMP_TILE": {
      if (state.bag.length < 3) return state;
      return dumpTiles(state, [action.tileId]);
    }
    case "DUMP_SELECTED": {
      if (state.bag.length < 3) return state;
      return dumpTiles(state, Object.keys(state.selection));
    }
    case "APPLY_DUMP": {
      if (state.bag.length < 3) return state;
      return applyDump(state, action.tileIds, action.newLetters);
    }
    default:               return state;
  }
}

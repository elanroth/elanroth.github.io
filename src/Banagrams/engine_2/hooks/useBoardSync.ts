import { useEffect, useRef } from "react";
import type { GameState, TilesById } from "../types";
import { readBoards, saveMyTiles, subscribeBoards } from "../firebase/rtdb";

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: number | undefined;
  return ((...args: any[]) => { if (t) clearTimeout(t); t = window.setTimeout(() => fn(...args), ms); }) as T;
}

/** Push my tiles -> RTDB; pull all boards -> reducer action. */
export function useBoardSync(
  gameId: string,
  userId: string,
  state: GameState,
  dispatch: (a: any) => void
) {
  // push local tiles (debounced)
  const lastTiles = useRef<TilesById>(state.tiles);
  const push = useRef(debounce(async (tiles: TilesById) => { try { await saveMyTiles(gameId, userId, tiles); } catch {} }, 200));
  useEffect(() => {
    if (lastTiles.current !== state.tiles) { lastTiles.current = state.tiles; push.current(state.tiles); }
  }, [state.tiles, gameId, userId]);

  // pull remote boards
  useEffect(() => {
    readBoards(gameId).then(b => dispatch({ type: "REMOTE_BOARDS_MERGE", boards: b }));
    const unsub = subscribeBoards(gameId, b => dispatch({ type: "REMOTE_BOARDS_MERGE", boards: b }));
    return unsub;
  }, [gameId, dispatch]);
}

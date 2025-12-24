import { useEffect, useRef } from "react";
import type { GameState, TilesById } from "../types";
import { consumeGrants, saveMyTiles, subscribeGame } from "../firebase/rtdb";

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
    const unsub = subscribeGame(gameId, (snapshot) => {
      dispatch({ type: "REMOTE_BOARDS_MERGE", boards: snapshot.boards });
      dispatch({ type: "BAG_SET", bag: snapshot.bag || [] });
      dispatch({ type: "PLAYERS_MERGE", players: snapshot.players || {} });
      dispatch({ type: "STATUS_SET", status: snapshot.status || { phase: "active" } });

      const grantsForMe = snapshot.grants?.[userId];
      if (grantsForMe && Object.keys(grantsForMe).length > 0) {
        const letters = Object.values(grantsForMe);
        const ids = Object.keys(grantsForMe);
        dispatch({ type: "ADD_LETTERS", letters });
        consumeGrants(gameId, userId, ids).catch(() => {});
      }
    });
    return unsub;
  }, [gameId, dispatch]);
}

import { useEffect, useRef } from "react";
import type { GameState, TilesById } from "../types";
import { consumeGrants, ensurePlayer, saveMyTiles, subscribeGame, updateLastSeen } from "../firebase/rtdb";

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: number | undefined;
  return ((...args: any[]) => { if (t) clearTimeout(t); t = window.setTimeout(() => fn(...args), ms); }) as T;
}

/** Push my tiles -> RTDB; pull all boards -> reducer action. */
export function useBoardSync(
  gameId: string,
  userId: string,
  nickname: string,
  state: GameState,
  dispatch: (a: any) => void
) {
  // Keep my player record present/updated in RTDB
  useEffect(() => {
    ensurePlayer(gameId, userId, nickname).catch(() => {});
    const tick = () => updateLastSeen(gameId, userId).catch(() => {});
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [gameId, userId, nickname]);

  // push local tiles (debounced)
  const lastTiles = useRef<TilesById>(state.tiles);
  const lastRack = useRef<GameState["rack"]>(state.rack);
  const initializedPush = useRef(false);
  const push = useRef(debounce(async (tiles: TilesById, rack: GameState["rack"]) => { try { await saveMyTiles(gameId, userId, tiles, rack); } catch {} }, 200));
  useEffect(() => {
    // Always push once so the board path exists even before any moves
    if (!initializedPush.current) {
      initializedPush.current = true;
      lastTiles.current = state.tiles;
      lastRack.current = state.rack;
      push.current(state.tiles, state.rack);
      return;
    }

    if (lastTiles.current !== state.tiles || lastRack.current !== state.rack) {
      lastTiles.current = state.tiles;
      lastRack.current = state.rack;
      push.current(state.tiles, state.rack);
    }
  }, [state.tiles, state.rack, gameId, userId]);

  // pull remote boards
  useEffect(() => {
    const unsub = subscribeGame(gameId, (snapshot) => {
      console.log("[sync] snapshot", {
        players: Object.keys(snapshot.players || {}),
        boards: Object.keys(snapshot.boards || {}),
        status: snapshot.status?.phase,
        bag: snapshot.bag?.length,
      });
      dispatch({ type: "REMOTE_BOARDS_MERGE", boards: snapshot.boards });
      dispatch({ type: "BAG_SET", bag: snapshot.bag || [] });
      dispatch({ type: "PLAYERS_MERGE", players: snapshot.players || {} });
      dispatch({ type: "STATUS_SET", status: snapshot.status || { phase: "active" } });
      if (snapshot.options) {
        dispatch({ type: "OPTIONS_SET", options: snapshot.options });
      }

      const grantsForMe = snapshot.grants?.[userId];
      if (grantsForMe && Object.keys(grantsForMe).length > 0) {
        const letters = Object.values(grantsForMe);
        const ids = Object.keys(grantsForMe);
        console.log("[grants] applying", { letters, ids });
        dispatch({ type: "ADD_LETTERS", letters });
        consumeGrants(gameId, userId, ids).catch(() => {});
      }
    });
    return unsub;
  }, [gameId, dispatch]);
}

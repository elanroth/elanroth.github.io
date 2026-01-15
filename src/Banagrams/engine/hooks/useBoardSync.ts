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
  const bootLogged = useRef(false);

  useEffect(() => {
    if (!gameId || !userId) throw new Error("useBoardSync requires gameId and userId");
    if (!bootLogged.current) {
      console.debug(`[boardSync] init game=${gameId} user=${userId}`);
      bootLogged.current = true;
    }
  }, [gameId, userId]);

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
      dispatch({ type: "REMOTE_BOARDS_MERGE", boards: snapshot.boards });
      dispatch({ type: "BAG_SET", bag: snapshot.bag || [] });
      dispatch({ type: "PLAYERS_MERGE", players: snapshot.players || {} });
      dispatch({ type: "STATUS_SET", status: snapshot.status || { phase: "active" } });
      dispatch({ type: "NEXT_LOBBY_SET", nextLobbyId: snapshot.nextLobbyId });
      if (snapshot.options) {
        dispatch({ type: "OPTIONS_SET", options: snapshot.options });
      }

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

import { useEffect, useState } from "react";
import type { Action, GameState, Seat } from "../engine/types";
import { initialState, reducer } from "../engine/reducer";
import {
  GameMeta, PlayerEntry, pushAction, subscribeActions, subscribeMeta, subscribePlayers,
} from "./rtdb";

export type UseGameResult = {
  state: GameState;
  meta: GameMeta | null;
  players: Record<Seat, PlayerEntry | null>;
  dispatch: (a: Action) => Promise<void>;
  localSeat: Seat | null;
};

// Drives a live GameState from the Firebase action log.
// All mutation goes through `dispatch` which writes the action to /actions/;
// the same subscription then echoes it back and applies it locally.
export function useGame(gameId: string | null, localUid: string): UseGameResult {
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [players, setPlayers] = useState<Record<Seat, PlayerEntry | null>>({
    N: null, E: null, S: null, W: null,
  });
  const [state, setState] = useState<GameState>(() => initialState(gameId ?? "_pending", 0));

  // meta
  useEffect(() => {
    if (!gameId) return;
    return subscribeMeta(gameId, setMeta);
  }, [gameId]);

  // players (UI helper; the engine learns about seats via JOIN_SEAT actions)
  useEffect(() => {
    if (!gameId) return;
    return subscribePlayers(gameId, setPlayers);
  }, [gameId]);

  // actions: when meta is known, init state and subscribe to the action log.
  useEffect(() => {
    if (!gameId || !meta) return;
    let live: GameState = initialState(gameId, meta.randomSeed);
    live = reducer(live, { type: "SET_OPTIONS", targetScore: meta.targetScore });
    setState(live);
    return subscribeActions(gameId, (action) => {
      live = reducer(live, action);
      setState(live);
    });
  }, [gameId, meta?.randomSeed, meta?.targetScore]);

  const dispatch = async (a: Action) => {
    if (!gameId) return;
    await pushAction(gameId, a);
  };

  const localSeat: Seat | null =
    (["N", "E", "S", "W"] as Seat[]).find((s) => players[s]?.uid === localUid) ?? null;

  return { state, meta, players, dispatch, localSeat };
}

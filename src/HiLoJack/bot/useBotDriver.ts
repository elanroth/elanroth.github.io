import { useEffect, useRef } from "react";
import type { Action, Seat } from "../engine/types";
import type { UseGameResult } from "../controller/useGame";
import { nextBotAction } from "./heuristics";

// Default delay between bot actions, in milliseconds. Slow enough that a human
// can read what's happening on the table.
const DEFAULT_BOT_DELAY_MS = 700;

// Drives bot actions automatically whenever the game state changes.
//
// Design:
//   - Only ONE tab should mount this for a given gameId (otherwise bots will
//     race). We don't enforce that here; the caller decides (e.g., only the
//     host's tab — where `meta.hostUid === uid` — passes a non-empty set).
//   - For each state transition, looks at `botSeats` and dispatches AT MOST
//     ONE action per state. The next action fires after that action's echo
//     re-renders the state.
//   - Uses a setTimeout to introduce a visible delay; canceled if state
//     changes again before it fires.
export function useBotDriver(
  game: UseGameResult,
  botSeats: ReadonlySet<Seat>,
  delayMs: number = DEFAULT_BOT_DELAY_MS,
) {
  // Track the most recent action we kicked off so we don't double-fire if state
  // happens to re-render with the same phase signature.
  const lastKey = useRef<string>("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (botSeats.size === 0) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const next = nextBotAction(game.state, botSeats);
    if (!next) return;

    // Use a key that changes on every meaningful state change.
    const phase = game.state.phase as { kind: string } & Record<string, unknown>;
    const key = JSON.stringify({
      kind: phase.kind,
      turn: (phase as any).turn ?? null,
      trickLen: (phase as any).trick?.cards?.length ?? null,
      handsPlayed: game.state.handsPlayed,
      applied: (phase as any).applied ?? null,
    });
    if (key === lastKey.current) return;
    lastKey.current = key;

    timeoutRef.current = setTimeout(() => {
      game.dispatch(next.action).catch((e) => {
        console.warn("[bot] dispatch failed", e);
      });
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [game.state, botSeats, delayMs, game.dispatch]);
}

// Helper: derive the bot seats for the current game from the engine's
// state.players + the host's known bot-uid prefix.
export function deriveBotSeats(
  players: Record<Seat, { uid: string } | null>,
  gameId: string,
): Set<Seat> {
  const out = new Set<Seat>();
  const prefix = `bot-`;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    const p = players[seat];
    if (p && p.uid.startsWith(prefix) && p.uid.endsWith(`-${gameId}`)) {
      out.add(seat);
    }
  }
  return out;
}

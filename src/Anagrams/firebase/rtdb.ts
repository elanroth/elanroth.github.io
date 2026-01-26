import { onValue, ref, set, update } from "firebase/database";
import type { GameState } from "../engine";
import { createGame } from "../engine";
import { db } from "./firebase";

const gamePath = (gameId: string) => `anagrams/${gameId}`;

export type AnagramsSnapshot = GameState & { gameId: string };

export async function createAnagramsGame(gameId: string, players: string[]): Promise<void> {
  const state = createGame({ players });
  await set(ref(db, gamePath(gameId)), {
    ...state,
    gameId,
  });
}

export async function updateAnagramsGame(gameId: string, next: Partial<GameState>): Promise<void> {
  await update(ref(db, gamePath(gameId)), next);
}

export function subscribeAnagramsGame(gameId: string, cb: (snapshot: AnagramsSnapshot) => void): () => void {
  return onValue(ref(db, gamePath(gameId)), (snap) => {
    const raw = (snap.val() ?? {}) as Partial<AnagramsSnapshot>;
    if (!raw) return;
    cb({
      bag: raw.bag ?? [],
      revealed: raw.revealed ?? [],
      players: raw.players ?? [],
      minWordLength: raw.minWordLength ?? 3,
      gameId,
    });
  });
}

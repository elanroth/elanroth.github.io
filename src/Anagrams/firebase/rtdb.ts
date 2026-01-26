import { get, onValue, ref, runTransaction, set, update } from "firebase/database";
import type { GameState } from "../engine";
import { createGame } from "../engine";
import { createBag, shuffleArray } from "../../Banagrams/engine/utils";
import { db } from "./firebase";

const gamePath = (gameId: string) => `anagrams/${gameId}`;
const metaRoot = `anagramsMeta`;
const metaPath = (gameId: string) => `${metaRoot}/${gameId}`;

const cleanSegment = (label: string, value: string) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) throw new Error(`[anagrams] Missing ${label}`);
  if (trimmed.includes("/")) throw new Error(`[anagrams] Invalid ${label}: ${trimmed}`);
  return trimmed;
};

export type AnagramsOptions = {
  bagSize: number;
  minWordLength: number;
};

export type AnagramsLobbyMeta = {
  gameId: string;
  lobbyName: string;
  createdAt: number;
  playerCount: number;
  status: "active" | "waiting";
  hostId?: string;
  options: AnagramsOptions;
};

export type AnagramsSnapshot = GameState & {
  gameId: string;
  playersById?: Record<string, number>;
  status?: "active" | "waiting";
  lobbyName?: string;
  hostId?: string;
  options?: AnagramsOptions;
};

export async function createAnagramsGame(gameId: string, players: string[]): Promise<void> {
  const state = createGame({ players });
  await set(ref(db, gamePath(gameId)), {
    ...state,
    gameId,
  });
}

export async function createAnagramsLobby({
  lobbyName,
  hostId,
  options,
}: {
  lobbyName?: string;
  hostId: string;
  options: AnagramsOptions;
}): Promise<{ gameId: string; lobbyName: string }> {
  const createdAt = Date.now();
  const gameId = `anagrams-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const trimmedLobbyName = lobbyName?.trim() || "Anagrams";
  const bag = shuffleArray(createBag({ bagSize: options.bagSize }));
  const state = createGame({ players: [], letterBag: bag.join(""), minWordLength: options.minWordLength, shuffle: false });

  console.debug("[anagrams] createLobby:start", { gameId, trimmedLobbyName, hostId, options });

  try {
    await set(ref(db, gamePath(gameId)), {
      ...state,
      gameId,
      playersById: {},
      status: "active",
      lobbyName: trimmedLobbyName,
      hostId,
      options,
    });
  } catch (err) {
    console.error("[anagrams] createLobby:gameWriteFailed", { gameId, err });
    throw err;
  }

  try {
    await set(ref(db, metaPath(gameId)), {
      gameId,
      lobbyName: trimmedLobbyName,
      createdAt,
      playerCount: 0,
      status: "active",
      hostId,
      options,
    });
  } catch (err) {
    console.error("[anagrams] createLobby:metaWriteFailed", { gameId, err });
    throw err;
  }

  console.debug("[anagrams] createLobby:success", { gameId, lobbyName: trimmedLobbyName });
  return { gameId, lobbyName: trimmedLobbyName };
}

export async function joinAnagramsLobby(gameId: string, playerId: string, nickname: string): Promise<number> {
  console.debug("[anagrams] joinLobby:start", { gameId, playerId, nickname });
  const root = ref(db, gamePath(cleanSegment("gameId", gameId)));
  let result;
  try {
    result = await runTransaction(root, (curr) => {
      const raw = (curr ?? {}) as any;
      const players = Array.isArray(raw.players) ? raw.players : [];
      const playersById = (raw.playersById ?? {}) as Record<string, number>;

      if (typeof playersById[playerId] === "number") {
        return { ...raw, players, playersById };
      }

      const nextIndex = players.length;
      players.push({ name: nickname, words: [], score: 0 });
      playersById[playerId] = nextIndex;

      return { ...raw, players, playersById };
    });
  } catch (err) {
    console.error("[anagrams] joinLobby:txFailed", { gameId, playerId, err });
    throw err;
  }

  try {
    await update(ref(db, metaPath(gameId)), {
      playerCount: ((result.snapshot.val() as any)?.players?.length ?? 0),
    });
  } catch (err) {
    console.error("[anagrams] joinLobby:metaUpdateFailed", { gameId, playerId, err });
  }

  const val = result.snapshot.val() as any;
  console.debug("[anagrams] joinLobby:success", { gameId, playerId, playerIndex: val?.playersById?.[playerId] });
  return val?.playersById?.[playerId] ?? 0;
}

export async function listAnagramsLobbies(): Promise<AnagramsLobbyMeta[]> {
  const snap = await get(ref(db, metaRoot));
  if (!snap.exists()) return [];
  const val = (snap.val() ?? {}) as Record<string, any>;
  const out: AnagramsLobbyMeta[] = [];
  for (const [gid, meta] of Object.entries(val)) {
    out.push({
      gameId: gid,
      lobbyName: meta.lobbyName ?? gid,
      createdAt: meta.createdAt ?? 0,
      playerCount: meta.playerCount ?? 0,
      status: meta.status ?? "active",
      hostId: meta.hostId,
      options: meta.options ?? { bagSize: 60, minWordLength: 3 },
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export function subscribeAnagramsLobbies(cb: (lobbies: AnagramsLobbyMeta[]) => void): () => void {
  return onValue(ref(db, metaRoot), (snap) => {
    const val = (snap.val() ?? {}) as Record<string, any>;
    const out: AnagramsLobbyMeta[] = [];
    for (const [gid, meta] of Object.entries(val)) {
      out.push({
        gameId: gid,
        lobbyName: meta.lobbyName ?? gid,
        createdAt: meta.createdAt ?? 0,
        playerCount: meta.playerCount ?? 0,
        status: meta.status ?? "active",
        hostId: meta.hostId,
        options: meta.options ?? { bagSize: 60, minWordLength: 3 },
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    cb(out);
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
      playersById: raw.playersById ?? {},
      status: raw.status ?? "active",
      lobbyName: raw.lobbyName,
      hostId: raw.hostId,
      options: raw.options,
    });
  });
}

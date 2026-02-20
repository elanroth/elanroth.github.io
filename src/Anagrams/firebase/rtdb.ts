import { get, onDisconnect, onValue, ref, runTransaction, serverTimestamp, set, update } from "firebase/database";
import type { GameState, PlayerState } from "../engine";
import { createGame } from "../engine";
import { createBanagramsBag, shuffleTiles } from "../engine/banagramsBag";
import { db } from "./firebase";

const TEST_BAG_LETTERS = ["A", "E", "R", "S", "T", "N", "I"];

const createTestBag = (size: number): string[] => {
  const bag: string[] = [];
  for (let i = 0; i < size; i += 1) {
    bag.push(TEST_BAG_LETTERS[i % TEST_BAG_LETTERS.length]);
  }
  return bag;
};

const gamePath = (gameId: string) => `anagrams/${gameId}`;
const metaRoot = `anagramsMeta`;
const metaPath = (gameId: string) => `${metaRoot}/${gameId}`;
const playersPath = (gameId: string) => `${gamePath(gameId)}/players`;
const playerPath = (gameId: string, playerId: string) =>
  `${playersPath(gameId)}/${cleanSegment("playerId", playerId)}`;

const cleanSegment = (label: string, value: string) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) throw new Error(`[anagrams] Missing ${label}`);
  if (trimmed.includes("/")) throw new Error(`[anagrams] Invalid ${label}: ${trimmed}`);
  return trimmed;
};

const coercePlayersMap = (players: unknown): Record<string, PlayerState> => {
  if (Array.isArray(players)) {
    return players.reduce((acc, player, idx) => {
      if (!player) return acc;
      acc[`player-${idx}`] = player as PlayerState;
      return acc;
    }, {} as Record<string, PlayerState>);
  }
  return (players ?? {}) as Record<string, PlayerState>;
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
  const bag = shuffleTiles(createTestBag(options.bagSize));
  const initialRevealCount = Math.max(0, Math.round(options.minWordLength) - 1);
  const revealed = bag.slice(0, initialRevealCount);
  const remainingBag = bag.slice(initialRevealCount);
  const state = createGame({ players: [], letterBag: bag.join(""), minWordLength: options.minWordLength, shuffle: false });

  console.debug("[anagrams] createLobby:start", { gameId, trimmedLobbyName, hostId, options });

  try {
    await set(ref(db, gamePath(gameId)), {
      ...state,
      bag: remainingBag,
      revealed,
      gameId,
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

export async function createAnagramsTestLobby({
  hostId,
  nickname,
}: {
  hostId: string;
  nickname: string;
}): Promise<{ gameId: string; lobbyName: string; playerId: string }> {
  const createdAt = Date.now();
  const gameId = `anagrams-test-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const lobbyName = "Test game";

  const minWordLength = 3;
  const bagSeed = shuffleTiles(createTestBag(144));
  const initialRevealCount = Math.max(0, minWordLength - 1);
  const revealed = bagSeed.slice(0, initialRevealCount);
  const bag = bagSeed.slice(initialRevealCount, initialRevealCount + 8);

  const now = Date.now();
  const players: Record<string, PlayerState> = {
    [hostId]: {
      name: nickname,
      words: ["CATS", "DOG", "HOUSE", "TREES", "BOOK", "MOUSE"],
      score: 0,
      joinedAt: now,
      lastSeen: now,
      active: true,
    },
    "bot-2": {
      name: "Player 2",
      words: ["HOUSES", "PLANT", "WATER", "FLOWERS", "GARDEN", "SUN", "STARS"],
      score: 0,
      joinedAt: now + 1,
      lastSeen: now + 1,
      active: true,
    },
    "bot-3": {
      name: "Player 3",
      words: ["MOON", "STONES", "RIVER", "OCEAN", "BRIDGE", "CASTLE"],
      score: 0,
      joinedAt: now + 2,
      lastSeen: now + 2,
      active: true,
    },
    "bot-4": {
      name: "Player 4",
      words: ["TREASURE", "PIRATES", "SHIP", "WHALE", "ANCHOR"],
      score: 0,
      joinedAt: now + 3,
      lastSeen: now + 3,
      active: true,
    },
    "bot-5": {
      name: "Player 5",
      words: ["MOUNTAIN", "VALLEY", "CLOUDS", "THUNDER", "LIGHTNING"],
      score: 0,
      joinedAt: now + 4,
      lastSeen: now + 4,
      active: true,
    },
    "bot-6": {
      name: "Player 6",
      words: ["FOREST", "ANIMALS", "BIRDS", "NEST", "WINGS", "FEATHERS"],
      score: 0,
      joinedAt: now + 5,
      lastSeen: now + 5,
      active: true,
    },
  };

  Object.values(players).forEach((player) => {
    player.score = player.words.reduce((sum, word) => sum + word.length, 0);
  });

  const state = createGame({ players: [], letterBag: "", shuffle: false, minWordLength });

  await set(ref(db, gamePath(gameId)), {
    ...state,
    bag,
    revealed,
    players,
    gameId,
    status: "active",
    lobbyName,
    hostId,
    options: { bagSize: 144, minWordLength },
  });

  await set(ref(db, metaPath(gameId)), {
    gameId,
    lobbyName,
    createdAt,
    playerCount: Object.keys(players).length,
    status: "active",
    hostId,
    options: { bagSize: 144, minWordLength },
  });

  return { gameId, lobbyName, playerId: hostId };
}

export async function joinAnagramsLobby(gameId: string, playerId: string, nickname: string): Promise<void> {
  console.debug("[anagrams] joinLobby:start", { gameId, playerId, nickname });
  const root = ref(db, gamePath(cleanSegment("gameId", gameId)));
  let wasNew = false;
  const now = Date.now();

  try {
    await runTransaction(root, (curr) => {
      const raw = (curr ?? {}) as any;
      const players = coercePlayersMap(raw.players);
      const existing = players[playerId];
      if (!existing) wasNew = true;
      players[playerId] = {
        name: nickname,
        words: Array.isArray(existing?.words) ? existing.words : [],
        score: Array.isArray(existing?.words)
          ? existing.words.reduce((sum, word) => sum + word.length, 0)
          : 0,
        joinedAt: existing?.joinedAt ?? now,
        lastSeen: now,
        active: true,
      };
      return { ...raw, players };
    });
  } catch (err) {
    console.error("[anagrams] joinLobby:txFailed", { gameId, playerId, err });
    throw err;
  }

  if (wasNew) {
    try {
      await runTransaction(ref(db, `${metaPath(gameId)}/playerCount`), (curr) =>
        (typeof curr === "number" ? curr : 0) + 1,
      );
    } catch (err) {
      console.error("[anagrams] joinLobby:metaUpdateFailed", { gameId, playerId, err });
    }
  }

  try {
    await onDisconnect(ref(db, playerPath(gameId, playerId))).update({
      active: false,
      lastSeen: serverTimestamp(),
    });
  } catch (err) {
    console.error("[anagrams] joinLobby:onDisconnectFailed", { gameId, playerId, err });
  }

  console.debug("[anagrams] joinLobby:success", { gameId, playerId });
}

export async function leaveAnagramsLobby(gameId: string, playerId: string): Promise<void> {
  try {
    await update(ref(db, playerPath(gameId, playerId)), {
      active: false,
      lastSeen: Date.now(),
    });
  } catch (err) {
    console.error("[anagrams] leaveLobby:playerUpdateFailed", { gameId, playerId, err });
  }

  try {
    await runTransaction(ref(db, `${metaPath(gameId)}/playerCount`), (curr) => {
      const next = (typeof curr === "number" ? curr : 0) - 1;
      return Math.max(0, next);
    });
  } catch (err) {
    console.error("[anagrams] leaveLobby:metaUpdateFailed", { gameId, playerId, err });
  }
}

export async function touchAnagramsPlayer(gameId: string, playerId: string): Promise<void> {
  try {
    await update(ref(db, playerPath(gameId, playerId)), {
      active: true,
      lastSeen: Date.now(),
    });
  } catch (err) {
    console.error("[anagrams] touchPlayer:failed", { gameId, playerId, err });
  }
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
      players: coercePlayersMap(raw.players),
      minWordLength: raw.minWordLength ?? 3,
      pendingSnatch: raw.pendingSnatch ?? null,
      lastSnatch: raw.lastSnatch ?? null,
      gameId,
      status: raw.status ?? "active",
      lobbyName: raw.lobbyName,
      hostId: raw.hostId,
      options: raw.options,
    });
  });
}

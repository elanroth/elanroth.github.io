import { get, onDisconnect, onValue, ref, runTransaction, serverTimestamp, set, update } from "firebase/database";
import type { GameState, PendingSnatch, PlayerState, WordSource } from "../engine";
import { claimWord, createGame, drawTile, isPendingSnatchLive, normalizeWord } from "../engine";
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
  const bag = shuffleTiles(createBanagramsBag(options.bagSize));
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
      // Count returning players again too: leaving decremented the count.
      wasNew = !existing || existing.active === false;
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

// ---- moves ------------------------------------------------------------------
// Every move runs as a transaction on the whole game, so two players flipping or
// claiming at the same moment can't duplicate a tile or overwrite each other's
// words. The transaction retries against the server's latest state.

export type MoveResult = { ok: true } | { ok: false; reason: string };
export type ClaimSource = WordSource & { word: string };

const BUSY_REASON = "Hold on, someone is choosing a word to steal.";

const readArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined) as T[];
  if (value && typeof value === "object") return Object.values(value as Record<string, T>);
  return [];
};

const rawToState = (raw: Record<string, any>): GameState => {
  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(coercePlayersMap(raw.players))) {
    const words = readArray<string>(player?.words);
    players[id] = {
      ...player,
      name: player?.name ?? "Player",
      words,
      score: words.reduce((sum, word) => sum + word.length, 0),
    };
  }
  return {
    bag: readArray<string>(raw.bag),
    revealed: readArray<string>(raw.revealed),
    players,
    minWordLength: raw.minWordLength ?? 3,
    pendingSnatch: raw.pendingSnatch ?? null,
    lastSnatch: raw.lastSnatch ?? null,
  };
};

// Firebase rejects undefined anywhere in a write.
const stripUndefined = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

async function runMove(
  gameId: string,
  move: (state: GameState, raw: Record<string, any>) => GameState | string,
): Promise<MoveResult> {
  let reason: string | null = null;
  try {
    const result = await runTransaction(ref(db, gamePath(cleanSegment("gameId", gameId))), (curr) => {
      // A null first pass just means the local cache is cold; Firebase retries with the server value.
      if (curr === null) return curr;
      const raw = curr as Record<string, any>;
      const out = move(rawToState(raw), raw);
      if (typeof out === "string") {
        reason = out;
        return undefined; // abort
      }
      reason = null;
      const rawPlayers = coercePlayersMap(raw.players);
      const players: Record<string, unknown> = {};
      for (const [id, player] of Object.entries(out.players)) {
        players[id] = { ...(rawPlayers[id] ?? {}), ...player };
      }
      return stripUndefined({
        ...raw,
        bag: out.bag,
        revealed: out.revealed,
        players,
        minWordLength: out.minWordLength,
        pendingSnatch: out.pendingSnatch ?? null,
        lastSnatch: out.lastSnatch ?? null,
      });
    });
    if (!result.committed) return { ok: false, reason: reason ?? "That move didn't go through. Try again." };
    return { ok: true };
  } catch (err) {
    console.error("[anagrams] move failed", { gameId, err });
    return { ok: false, reason: "Couldn't reach the game server. Try again." };
  }
}

export function drawAnagramsTile(gameId: string): Promise<MoveResult> {
  return runMove(gameId, (state) => {
    if (isPendingSnatchLive(state.pendingSnatch)) return BUSY_REASON;
    if (state.bag.length === 0) return "The bag is empty.";
    // Drawing also clears a steal choice that timed out.
    return { ...drawTile(state).state, pendingSnatch: null };
  });
}

export function claimAnagramsWord(
  gameId: string,
  playerId: string,
  word: string,
  sources: ClaimSource[],
  dictionary: Set<string>,
): Promise<MoveResult> {
  return runMove(gameId, (state) => {
    const pending = isPendingSnatchLive(state.pendingSnatch) ? state.pendingSnatch : null;
    if (pending && pending.claimantId !== playerId) return BUSY_REASON;
    for (const source of sources) {
      if (state.players[source.playerId]?.words[source.wordIndex] !== source.word) {
        return `Too slow: ${source.word} was just taken.`;
      }
    }
    const result = claimWord(state, playerId, word, sources, dictionary);
    if (!result.ok) return result.reason ?? "Word not allowed.";
    const lastSnatch = sources.length > 0
      ? {
        at: Date.now(),
        byPlayerId: playerId,
        word: normalizeWord(word),
        targets: sources.map((source) => ({ playerId: source.playerId, word: source.word })),
      }
      : state.lastSnatch ?? null;
    return { ...result.state, pendingSnatch: null, lastSnatch };
  });
}

/** Freeze the table while the claimant picks which word to steal (expires on its own). */
export function proposeAnagramsSnatch(gameId: string, pending: PendingSnatch): Promise<MoveResult> {
  return runMove(gameId, (state) => {
    if (isPendingSnatchLive(state.pendingSnatch)) return BUSY_REASON;
    return { ...state, pendingSnatch: pending };
  });
}

export function cancelAnagramsSnatch(gameId: string, playerId: string): Promise<MoveResult> {
  return runMove(gameId, (state) => {
    if (state.pendingSnatch?.claimantId !== playerId) return "Nothing to cancel.";
    return { ...state, pendingSnatch: null };
  });
}

/** New round in the same lobby: fresh bag, everyone keeps their seat, words cleared. */
export function resetAnagramsGame(gameId: string): Promise<MoveResult> {
  return runMove(gameId, (state, raw) => {
    if (isPendingSnatchLive(state.pendingSnatch)) return BUSY_REASON;
    const bagSize = Number(raw.options?.bagSize) || 60;
    const bag = shuffleTiles(createBanagramsBag(bagSize));
    const revealCount = Math.max(0, state.minWordLength - 1);
    const players: Record<string, PlayerState> = {};
    for (const [id, player] of Object.entries(state.players)) {
      players[id] = { ...player, words: [], score: 0 };
    }
    return {
      ...state,
      bag: bag.slice(revealCount),
      revealed: bag.slice(0, revealCount),
      players,
      pendingSnatch: null,
      lastSnatch: null,
    };
  });
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

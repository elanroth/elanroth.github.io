import { child, get, onValue, ref, runTransaction, set, update } from "firebase/database";
import type { GameStatus, PlayerId, PlayerInfo, TilesById, GameOptions, RemoteBoard, TileId } from "../types";
import { createBag, shuffleArray, DEFAULT_OPTIONS } from "../utils";
import { db } from "./firebase";

const gamePath = (gameId: string) => `games/${gameId}`;
const boardPath = (gameId: string, userId: string) => `${gamePath(gameId)}/boards/${userId}`;
const playersPath = (gameId: string) => `${gamePath(gameId)}/players`;
const bagPath = (gameId: string) => `${gamePath(gameId)}/bag`;
const statusPath = (gameId: string) => `${gamePath(gameId)}/status`;
const grantsPath = (gameId: string) => `${gamePath(gameId)}/grants`;
const metaRoot = `gamesMeta`;
const metaPath = (gameId: string) => `${metaRoot}/${gameId}`;

export type LobbyMeta = {
  gameId: string;
  lobbyName: string;
  createdAt: number;
  playerCount: number;
  status: GameStatus["phase"];
  hostId?: string;
};

export type GameSnapshot = {
  boards: Record<string, RemoteBoard>;
  bag: string[];
  players: Record<string, PlayerInfo>;
  status: GameStatus;
  grants: Record<string, Record<string, string>>;
  options: GameOptions;
  hostId?: string;
  lobbyName?: string;
};

export async function createLobby(options: Partial<GameOptions> & { lobbyName?: string; hostId: string }): Promise<{ gameId: string; lobbyName: string }> {
  const totalSnap = await runTransaction(ref(db, `${metaRoot}/totalGames`), (curr) => {
    const n = typeof curr === "number" ? curr : 0;
    return n + 1;
  });

  const n = totalSnap.snapshot.val() as number;
  const gameId = `game-${n}`;
  const lobbyName = options?.lobbyName?.trim() || `Lobby ${n}`;
  const chosenOptions: GameOptions = { ...DEFAULT_OPTIONS, ...options };
  const bag = shuffleArray(createBag(chosenOptions));
  const createdAt = Date.now();

  await set(ref(db, gamePath(gameId)), {
    bag,
    status: { phase: "waiting", updatedAt: createdAt },
    options: chosenOptions,
    createdAt,
    lobbyName,
    hostId: options.hostId,
    boards: {},
    players: {},
    grants: {},
  });

  await set(ref(db, metaPath(gameId)), {
    lobbyName,
    createdAt,
    playerCount: 0,
    status: "waiting",
    hostId: options.hostId,
  });

  return { gameId, lobbyName };
}

export async function joinLobby(gameId: string, userId: string, nickname: string): Promise<void> {
  const now = Date.now();
  const player: PlayerInfo = { nickname, joinedAt: now, lastSeen: now };
  await set(ref(db, `${playersPath(gameId)}/${userId}`), player);
  await runTransaction(ref(db, `${metaPath(gameId)}/playerCount`), (curr) => (typeof curr === "number" ? curr : 0) + 1);
}

/**
 * Idempotent presence write for a player (does not bump meta playerCount).
 */
export async function ensurePlayer(gameId: string, userId: string, nickname: string): Promise<void> {
  const now = Date.now();
  await update(ref(db, `${playersPath(gameId)}/${userId}`), {
    nickname,
    joinedAt: now,
    lastSeen: now,
  });
}

export async function updateLastSeen(gameId: string, userId: string): Promise<void> {
  await update(ref(db, `${playersPath(gameId)}/${userId}`), { lastSeen: Date.now() });
}

export async function saveMyTiles(gameId: string, userId: string, tiles: TilesById, rack: TileId[]): Promise<void> {
  await set(ref(db, boardPath(gameId, userId)), { tiles, rack });
}

export function subscribeGame(gameId: string, cb: (snapshot: GameSnapshot) => void): () => void {
  return onValue(ref(db, gamePath(gameId)), (snap) => {
    const raw = (snap.val() ?? {}) as any;
    const boardsRaw = (raw.boards ?? {}) as Record<string, { tiles?: TilesById; rack?: TileId[] }>;
    const boards: Record<string, RemoteBoard> = {};
    for (const [uid, v] of Object.entries(boardsRaw)) {
      boards[uid] = {
        tiles: (v?.tiles ?? {}) as TilesById,
        rack: Array.isArray(v?.rack) ? (v?.rack as TileId[]) : [],
      };
    }

    const bag = Array.isArray(raw.bag) ? raw.bag : [];
    const players = (raw.players ?? {}) as Record<string, PlayerInfo>;
    const status = (raw.status ?? { phase: "waiting" }) as GameStatus;
    const grants = (raw.grants ?? {}) as Record<string, Record<string, string>>;
    const options = (raw.options ?? DEFAULT_OPTIONS) as GameOptions;
    const hostId = raw.hostId as string | undefined;
    const lobbyName = raw.lobbyName as string | undefined;

    cb({ boards, bag, players, status, grants, options, hostId, lobbyName });
  });
}

export async function takeFromBag(gameId: string, count: number): Promise<{ letters: string[]; bag: string[] }> {
  if (count <= 0) return { letters: [], bag: [] };
  let drawn: string[] = [];
  const tx = await runTransaction(ref(db, bagPath(gameId)), (curr) => {
    const bag: string[] = Array.isArray(curr) ? curr : [];
    if (bag.length === 0) {
      drawn = [];
      return bag;
    }
    const take = Math.min(count, bag.length);
    drawn = bag.slice(0, take);
    return bag.slice(take);
  }, { applyLocally: false });

  const bag = Array.isArray(tx.snapshot.val()) ? (tx.snapshot.val() as string[]) : [];
  return { letters: drawn, bag };
}

export async function dumpAndDraw(gameId: string, letters: string[]): Promise<string[]> {
  if (letters.length === 0) return [];
  let drawn: string[] = [];
  await runTransaction(ref(db, bagPath(gameId)), (curr) => {
    const bag: string[] = Array.isArray(curr) ? [...curr] : [];
    bag.push(...letters);
    shuffleArray(bag);
    const take = Math.min(letters.length * 3, bag.length);
    drawn = bag.slice(0, take);
    return bag.slice(take);
  }, { applyLocally: false });
  return drawn;
}

export async function setGameStatus(gameId: string, status: GameStatus): Promise<void> {
  await set(ref(db, statusPath(gameId)), status);
  await update(ref(db, metaPath(gameId)), { status: status.phase });
}

/**
 * Push grant letters to players (e.g., on peel). assignments[playerId] = letters[]
 */
export async function pushGrants(gameId: string, assignments: Record<PlayerId, string[]>): Promise<void> {
  const updates: Record<string, string> = {};
  for (const [pid, letters] of Object.entries(assignments)) {
    for (const letter of letters) {
      const grantId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      updates[`${grantsPath(gameId)}/${pid}/${grantId}`] = letter;
    }
  }
  if (Object.keys(updates).length === 0) return;
  await update(ref(db), updates);
}

/**
 * Consume grant ids for a player (remove after applying locally)
 */
export async function consumeGrants(gameId: string, playerId: PlayerId, grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return;
  const updates: Record<string, null> = {};
  for (const gid of grantIds) updates[`${grantsPath(gameId)}/${playerId}/${gid}`] = null;
  await update(ref(db), updates);
}

export function subscribeLobbies(cb: (lobbies: LobbyMeta[]) => void): () => void {
  return onValue(ref(db, metaRoot), (snap) => {
    const val = (snap.val() ?? {}) as Record<string, any>;
    const out: LobbyMeta[] = [];
    for (const [gid, meta] of Object.entries(val)) {
      if (gid === "totalGames") continue;
      out.push({
        gameId: gid,
        lobbyName: (meta as any).lobbyName ?? gid,
        createdAt: (meta as any).createdAt ?? 0,
        playerCount: (meta as any).playerCount ?? 0,
        status: (meta as any).status ?? "active",
        hostId: (meta as any).hostId,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    cb(out);
  });
}

export async function listLobbies(): Promise<LobbyMeta[]> {
  const snap = await get(ref(db, metaRoot));
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, any>;
  const out: LobbyMeta[] = [];
  for (const [gid, meta] of Object.entries(val)) {
    if (gid === "totalGames") continue;
    out.push({
      gameId: gid,
        lobbyName: (meta as any).lobbyName ?? gid,
        createdAt: (meta as any).createdAt ?? 0,
        playerCount: (meta as any).playerCount ?? 0,
        status: (meta as any).status ?? "active",
        hostId: (meta as any).hostId,
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

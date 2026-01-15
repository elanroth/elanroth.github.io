import { child, get, onValue, ref, runTransaction, set, update } from "firebase/database";
import type { GameStatus, PlayerId, PlayerInfo, TilesById, GameOptions, RemoteBoard, TileId } from "../types";
import { createBag, shuffleArray, DEFAULT_OPTIONS } from "../utils";
import { db } from "./firebase";

const cleanSegment = (label: string, value: string) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) throw new Error(`[rtdb] Missing ${label}`);
  if (trimmed.includes("/")) throw new Error(`[rtdb] Invalid ${label}: ${trimmed}`);
  return trimmed;
};

const logWrite = (op: "set" | "update" | "tx" | "push", path: string) => {
  console.debug(`[rtdb:${op}] ${path}`);
};

const LEADER_NAMES = [
  "Nelson Mandela",
  "Mahatma Gandhi",
  "Winston Churchill",
  "Angela Merkel",
  "Barack Obama",
  "Franklin D Roosevelt",
  "Abraham Lincoln",
  "Golda Meir",
  "Jawaharlal Nehru",
  "Charles de Gaulle",
  "Lee Kuan Yew",
  "Ellen Johnson Sirleaf",
  "Margaret Thatcher",
  "Indira Gandhi",
  "Shinzo Abe",
  "Justin Trudeau",
  "John F Kennedy",
  "George Washington",
  "Cleopatra",
  "Catherine the Great",
];

const randomLeaderName = (): string => {
  if (!LEADER_NAMES.length) return "Lobby";
  const idx = Math.floor(Math.random() * LEADER_NAMES.length);
  return LEADER_NAMES[idx];
};

const gamePath = (gameId: string) => `games/${cleanSegment("gameId", gameId)}`;
const boardPath = (gameId: string, userId: string) => `${gamePath(gameId)}/boards/${cleanSegment("userId", userId)}`;
const playersPath = (gameId: string) => `${gamePath(gameId)}/players`;
const bagPath = (gameId: string) => `${gamePath(gameId)}/bag`;
const statusPath = (gameId: string) => `${gamePath(gameId)}/status`;
const grantsPath = (gameId: string) => `${gamePath(gameId)}/grants`;
const finalPath = (gameId: string, userId: string, ts: number) => `${gamePath(gameId)}/final/${cleanSegment("userId", userId)}/${ts}`;
const metaRoot = `gamesMeta`;
const metaPath = (gameId: string) => `${metaRoot}/${cleanSegment("gameId", gameId)}`;
const analysisPath = (gameId: string) => `gameAnalyses/${cleanSegment("gameId", gameId)}`;
const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

const lobbyDateKey = (meta: any, gameId: string): string | null => {
  const createdAt = typeof meta?.createdAt === "number" ? meta.createdAt : null;
  if (createdAt) {
    try {
      return new Date(createdAt).toISOString().slice(0, 10);
    } catch {
      /* ignore */
    }
  }

  // Fallback to parsing the game id (game-YYYY-MM-DD-N)
  const parts = gameId.split("-");
  if (parts.length >= 4 && parts[1] && parts[2] && parts[3]) {
    return `${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return null;
};

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
  nextLobbyId?: string;
};

export async function createLobby(options: Partial<GameOptions> & { lobbyName?: string; hostId: string; customBag?: string[] }): Promise<{ gameId: string; lobbyName: string }> {
  const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const dailyPath = `${metaRoot}/dailyCounters/${todayKey}`;
  logWrite("tx", dailyPath);
  const daySnap = await runTransaction(ref(db, dailyPath), (curr) => {
    const n = typeof curr === "number" ? curr : 0;
    return n + 1;
  });

  const n = daySnap.snapshot.val() as number;
  const gameId = `game-${todayKey}-${n}`;
  const { customBag, lobbyName: providedLobbyName, hostId, ...gameOptions } = options;
  const lobbyName = providedLobbyName?.trim() || randomLeaderName();
  const chosenOptions: GameOptions = { ...DEFAULT_OPTIONS, ...gameOptions };
  const bag = customBag ? [...customBag] : shuffleArray(createBag(chosenOptions));
  const createdAt = Date.now();

  const gameRoot = gamePath(gameId);
  logWrite("set", gameRoot);
  await set(ref(db, gameRoot), {
    bag,
    status: { phase: "waiting", updatedAt: createdAt },
    options: chosenOptions,
    createdAt,
    lobbyName,
    hostId,
    boards: {},
    players: {},
    grants: {},
  });

  const meta = metaPath(gameId);
  logWrite("set", meta);
  await set(ref(db, meta), {
    lobbyName,
    createdAt,
    playerCount: 0,
    status: "waiting",
    hostId,
  });

  return { gameId, lobbyName };
}

export async function joinLobby(gameId: string, userId: string, nickname: string): Promise<void> {
  const now = Date.now();
  const player: PlayerInfo = { nickname, joinedAt: now, lastSeen: now };
  const playerPath = `${playersPath(gameId)}/${cleanSegment("userId", userId)}`;
  logWrite("set", playerPath);
  await set(ref(db, playerPath), player);
  const counterPath = `${metaPath(gameId)}/playerCount`;
  logWrite("tx", counterPath);
  await runTransaction(ref(db, counterPath), (curr) => (typeof curr === "number" ? curr : 0) + 1);
}

/**
 * Idempotent presence write for a player (does not bump meta playerCount).
 */
export async function ensurePlayer(gameId: string, userId: string, nickname: string): Promise<void> {
  const now = Date.now();
  const playerPath = `${playersPath(gameId)}/${cleanSegment("userId", userId)}`;
  logWrite("update", playerPath);
  await update(ref(db, playerPath), {
    nickname,
    joinedAt: now,
    lastSeen: now,
  });
}

export async function updateLastSeen(gameId: string, userId: string): Promise<void> {
  const playerPath = `${playersPath(gameId)}/${cleanSegment("userId", userId)}`;
  logWrite("update", playerPath);
  await update(ref(db, playerPath), { lastSeen: Date.now() });
}

export async function saveMyTiles(gameId: string, userId: string, tiles: TilesById, rack: TileId[]): Promise<void> {
  const path = boardPath(gameId, userId);
  logWrite("set", path);
  await set(ref(db, path), { tiles, rack });
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
    const nextLobbyId = typeof raw.nextLobbyId === "string" ? raw.nextLobbyId : undefined;

    cb({ boards, bag, players, status, grants, options, hostId, lobbyName, nextLobbyId });
  });
}

export async function takeFromBag(gameId: string, count: number): Promise<{ letters: string[]; bag: string[] }> {
  if (count <= 0) return { letters: [], bag: [] };
  let drawn: string[] = [];
  const path = bagPath(gameId);
  logWrite("tx", path);
  const tx = await runTransaction(ref(db, path), (curr) => {
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
  const path = bagPath(gameId);
  logWrite("tx", path);
  await runTransaction(ref(db, path), (curr) => {
    const bag: string[] = Array.isArray(curr) ? [...curr] : [];
    bag.push(...letters);
    shuffleArray(bag);
    const take = Math.min(letters.length * 3, bag.length);
    drawn = bag.slice(0, take);
    return bag.slice(take);
  }, { applyLocally: false });
  return drawn;
}

/** Create a fresh lobby for the next game; if another player already created one, reuse it. */
export async function ensureNextLobby(currentGameId: string, options: GameOptions, hostId: string): Promise<string> {
  // create a candidate rematch lobby using same options; if we lose the race the lobby may remain unused
  const { gameId: candidateId, lobbyName } = await createLobby({ ...options, hostId, lobbyName: "Rematch" });

  const nextPath = `${gamePath(currentGameId)}/nextLobbyId`;
  let chosenId = candidateId;
  try {
    const tx = await runTransaction(ref(db, nextPath), (curr) => {
      if (typeof curr === "string" && curr.length > 0) return curr; // someone already set it
      return candidateId;
    });
    const val = tx.snapshot.val();
    if (typeof val === "string" && val.length > 0) {
      chosenId = val;
    }
  } catch {
    // fall back to our candidate
  }

  // Record the rematch id so late joiners can follow; don't overwrite if another id already exists
  if (chosenId === candidateId) {
    try {
      await update(ref(db, gamePath(currentGameId)), { nextLobbyId: chosenId });
      await update(ref(db, metaPath(currentGameId)), { nextLobbyId: chosenId });
    } catch {}
  }

  // also tag the new lobby's meta with its name if needed
  try {
    await update(ref(db, metaPath(chosenId)), { lobbyName: lobbyName ?? "Rematch" });
  } catch {}

  return chosenId;
}

export async function setGameStatus(gameId: string, status: GameStatus): Promise<void> {
  const statusLoc = statusPath(gameId);
  logWrite("set", statusLoc);
  await set(ref(db, statusLoc), status);
  const meta = metaPath(gameId);
  logWrite("update", meta);
  await update(ref(db, meta), { status: status.phase });
}

export async function saveGameAnalysis(gameId: string, payload: Record<string, unknown>): Promise<void> {
  const path = analysisPath(gameId);
  logWrite("set", path);
  await set(ref(db, path), payload);
}

export async function saveFinalSnapshot(
  gameId: string,
  userId: string,
  payload: { tiles: TilesById; words?: string[]; stats?: Record<string, unknown> }
): Promise<void> {
  const ts = Date.now();
  const path = finalPath(gameId, userId, ts);
  logWrite("set", path);
  await set(ref(db, path), { ...payload, savedAt: ts });
}

/**
 * Push grant letters to players (e.g., on peel). assignments[playerId] = letters[]
 */
export async function pushGrants(gameId: string, assignments: Record<PlayerId, string[]>): Promise<void> {
  const updates: Record<string, string> = {};
  for (const [pid, letters] of Object.entries(assignments)) {
    for (const letter of letters) {
      const grantId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      updates[`grants/${cleanSegment("userId", pid)}/${grantId}`] = letter;
    }
  }
  if (Object.keys(updates).length === 0) return;
  const root = gamePath(gameId);
  logWrite("update", `${root} (grants)`);
  await update(ref(db, root), updates);
}

/**
 * Consume grant ids for a player (remove after applying locally)
 */
export async function consumeGrants(gameId: string, playerId: PlayerId, grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return;
  const updates: Record<string, null> = {};
  for (const gid of grantIds) updates[`grants/${cleanSegment("userId", playerId)}/${gid}`] = null;
  const root = gamePath(gameId);
  logWrite("update", `${root} (consume-grants)`);
  await update(ref(db, root), updates);
}

export function subscribeLobbies(cb: (lobbies: LobbyMeta[]) => void): () => void {
  return onValue(ref(db, metaRoot), (snap) => {
    const val = (snap.val() ?? {}) as Record<string, any>;
    const out: LobbyMeta[] = [];
    for (const [gid, meta] of Object.entries(val)) {
      if (gid === "totalGames" || gid === "dailyCounters") continue;
      const dateKey = lobbyDateKey(meta, gid);
      if (dateKey !== todayKey) continue;
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
    if (gid === "totalGames" || gid === "dailyCounters") continue;
    const dateKey = lobbyDateKey(meta, gid);
    if (dateKey !== todayKey) continue;
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

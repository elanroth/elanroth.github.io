import {
  get, off, onChildAdded, onValue, push, ref, runTransaction, set,
} from "firebase/database";
import type { Action, Seat } from "../engine/types";
import { db } from "./firebase";

const HJ = "hilojack";
const HJ_META = "hilojackMeta";

export type GameMeta = {
  gameId: string;
  hostUid: string;
  createdAt: number;
  targetScore: 7 | 11 | 21;
  randomSeed: number;
  lobbyName?: string;
};

export type PlayerEntry = { uid: string; nickname: string; lastSeen: number };

function genGameId(): string {
  // 6 chars, A–Z + 2–9 (excluding visually confusable 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function createGame(opts: {
  hostUid: string;
  nickname: string;
  targetScore: 7 | 11 | 21;
  lobbyName?: string;
}): Promise<string> {
  const gameId = genGameId();
  // Build meta without ever assigning `undefined` — Firebase RTDB rejects writes
  // containing undefined fields, which would silently break createGame.
  const meta: GameMeta = {
    gameId,
    hostUid: opts.hostUid,
    createdAt: Date.now(),
    targetScore: opts.targetScore,
    randomSeed: Math.floor(Math.random() * 0x7fffffff) + 1,
    ...(opts.lobbyName ? { lobbyName: opts.lobbyName } : {}),
  };
  await set(ref(db, `${HJ}/${gameId}/meta`), meta);
  await set(ref(db, `${HJ_META}/${gameId}`), {
    gameId,
    createdAt: meta.createdAt,
    lobbyName: opts.lobbyName ?? null,
  });
  return gameId;
}

export async function getMeta(gameId: string): Promise<GameMeta | null> {
  const snap = await get(ref(db, `${HJ}/${gameId}/meta`));
  return snap.exists() ? (snap.val() as GameMeta) : null;
}

export function subscribeMeta(gameId: string, cb: (m: GameMeta | null) => void): () => void {
  const r = ref(db, `${HJ}/${gameId}/meta`);
  return onValue(r, (snap) => cb(snap.val() ?? null));
}

export function subscribePlayers(
  gameId: string,
  cb: (m: Record<Seat, PlayerEntry | null>) => void,
): () => void {
  const r = ref(db, `${HJ}/${gameId}/players`);
  return onValue(r, (snap) => {
    const val = snap.val() ?? {};
    cb({
      N: val.N ?? null,
      E: val.E ?? null,
      S: val.S ?? null,
      W: val.W ?? null,
    });
  });
}

// Atomic seat claim. Returns true if the seat was claimed (or was already this uid),
// false if a different uid already owns the seat.
export async function claimSeat(
  gameId: string,
  seat: Seat,
  uid: string,
  nickname: string,
): Promise<boolean> {
  const seatRef = ref(db, `${HJ}/${gameId}/players/${seat}`);
  const tx = await runTransaction(seatRef, (curr: PlayerEntry | null) => {
    if (curr && curr.uid !== uid) return; // someone else owns it; abort
    return { uid, nickname, lastSeen: Date.now() };
  });
  return tx.committed;
}

export async function releaseSeat(gameId: string, seat: Seat, uid: string): Promise<void> {
  const seatRef = ref(db, `${HJ}/${gameId}/players/${seat}`);
  await runTransaction(seatRef, (curr: PlayerEntry | null) => {
    if (!curr || curr.uid !== uid) return curr; // not ours; leave alone
    return null;
  });
}

export async function pushAction(gameId: string, action: Action): Promise<void> {
  await push(ref(db, `${HJ}/${gameId}/actions`), {
    action,
    ts: Date.now(),
  });
}

// Subscribe to actions in arrival order. Replays existing actions to new subscribers first.
export function subscribeActions(
  gameId: string,
  onAction: (action: Action) => void,
): () => void {
  const r = ref(db, `${HJ}/${gameId}/actions`);
  const handler = (snap: { val: () => { action?: Action } | null }) => {
    const v = snap.val();
    if (v?.action) onAction(v.action);
  };
  onChildAdded(r, handler);
  return () => off(r, "child_added", handler);
}

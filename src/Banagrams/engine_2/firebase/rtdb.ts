import { child, get, onValue, ref, set, update } from "firebase/database";
import type { TilesById } from "../types";
import { db } from "./firebase";

const gamePath = (gameId: string) => `games/${gameId}`;
const boardPath = (gameId: string, userId: string) => `${gamePath(gameId)}/boards/${userId}`;

export async function saveMyTiles(gameId: string, userId: string, tiles: TilesById): Promise<void> {
  await set(ref(db, `${boardPath(gameId, userId)}/tiles`), tiles);
}

export async function patchMyTiles(
  gameId: string,
  userId: string,
  partial: Partial<TilesById>
): Promise<void> {
  await update(ref(db, `${boardPath(gameId, userId)}/tiles`), partial as Record<string, unknown>);
}

export function subscribeBoards(
  gameId: string,
  cb: (boards: Record<string, TilesById>) => void
): () => void {
  return onValue(ref(db, `${gamePath(gameId)}/boards`), snap => {
    const raw = (snap.val() ?? {}) as Record<string, { tiles?: TilesById }>;
    const out: Record<string, TilesById> = {};
    for (const [uid, v] of Object.entries(raw)) out[uid] = (v?.tiles ?? {}) as TilesById;
    cb(out);
  });
}

export async function readBoards(gameId: string): Promise<Record<string, TilesById>> {
  const snap = await get(child(ref(db), `${gamePath(gameId)}/boards`));
  if (!snap.exists()) return {};
  const raw = snap.val() as Record<string, { tiles?: TilesById }>;
  const out: Record<string, TilesById> = {};
  for (const [uid, v] of Object.entries(raw)) out[uid] = (v?.tiles ?? {}) as TilesById;
  return out;
}

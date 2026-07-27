import { SAVED_SONGS } from "../savedSongs";
import { IMPORTED_CHORD_PLACEMENTS } from "../importedChordPlacements";
import { emptySong, injectInlineChords, type StrumLibrary, type StrumSong } from "./model";

const DB_NAME = "strum-private-library";
const DB_VERSION = 1;
const SONGS_STORE = "songs";
const META_STORE = "meta";
const SEEDED_KEY = "seeded-public-metadata-v1";
const LEGACY_NOTES_KEY = "songbook-practice-notes-v1";
const LEGACY_OFFLINE_LYRICS_KEY = "songbook-offline-lyrics-v1";
const LEGACY_MIGRATION_KEY = "migrated-offline-library-v1";

type LegacyLyrics = { plainLyrics?: string | null; syncedLyrics?: string | null };

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains(SONGS_STORE)) database.createObjectStore(SONGS_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("Could not open STRUM storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, storeNames: string[], action: (stores: Record<string, IDBObjectStore>) => Promise<T>): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeNames, mode);
    const done = transactionDone(transaction);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    const result = await action(stores);
    await done;
    return result;
  } finally {
    database.close();
  }
}

function legacyArrangements(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LEGACY_NOTES_KEY) ?? "{}") as Record<string, string>; }
  catch { return {}; }
}

function legacyLyrics(): Record<string, LegacyLyrics> {
  try { return JSON.parse(localStorage.getItem(LEGACY_OFFLINE_LYRICS_KEY) ?? "{}") as Record<string, LegacyLyrics>; }
  catch { return {}; }
}

function readableLyrics(value: LegacyLyrics) {
  return (value.plainLyrics || value.syncedLyrics?.replace(/^\[\d{2}:\d{2}(?:\.\d{2,3})?\]\s*/gm, "") || "").trim();
}

function textHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function lyricFingerprint(value: string) {
  return textHash(value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0590-\u05ff]+/g, " ").trim());
}

function migrateArrangement(savedId: string, lyrics: string) {
  const placements = IMPORTED_CHORD_PLACEMENTS[savedId] ?? [];
  const available = new Map<string, Array<Array<[number, string]>>>();
  for (const [fingerprint, chords] of placements) {
    const queue = available.get(fingerprint) ?? [];
    queue.push(chords);
    available.set(fingerprint, queue);
  }
  return lyrics.replace(/\r/g, "").split("\n").map((line) => {
    const chords = available.get(lyricFingerprint(line))?.shift();
    return chords?.length ? injectInlineChords(line, chords) : line;
  }).join("\n");
}

export async function seedMetadataIfNeeded() {
  await withStore("readwrite", [SONGS_STORE, META_STORE], async ({ songs, meta }) => {
    if (await request(meta.get(SEEDED_KEY))) return;
    const legacy = legacyArrangements();
    for (const saved of SAVED_SONGS) {
      const song = emptySong({
        title: saved.title.replace(/\s*\(ver \d+\)$/i, ""),
        artist: saved.artist,
        sourceUrl: saved.sourceUrl,
        arrangement: legacy[saved.id] ?? "",
      });
      song.id = `saved-${saved.id}`;
      await request(songs.put(song));
    }
    await request(meta.put(new Date().toISOString(), SEEDED_KEY));
  });
}

async function migrateLegacyOfflineLibrary() {
  const cachedLyrics = legacyLyrics();
  if (!Object.keys(cachedLyrics).length) return;
  await withStore("readwrite", [SONGS_STORE, META_STORE], async ({ songs, meta }) => {
    if (await request(meta.get(LEGACY_MIGRATION_KEY))) return;
    for (const saved of SAVED_SONGS) {
      const cached = readableLyrics(cachedLyrics[saved.id] ?? {});
      if (!cached) continue;
      const current = await request(songs.get(`saved-${saved.id}`)) as StrumSong | undefined;
      if (!current || current.arrangement.trim()) continue;
      current.arrangement = migrateArrangement(saved.id, cached);
      current.updatedAt = new Date().toISOString();
      current.revision++;
      await request(songs.put(current));
    }
    await request(meta.put(new Date().toISOString(), LEGACY_MIGRATION_KEY));
  });
}

export async function getSongs() {
  await seedMetadataIfNeeded();
  await migrateLegacyOfflineLibrary();
  return withStore("readonly", [SONGS_STORE], async ({ songs }) => {
    const all = await request(songs.getAll()) as StrumSong[];
    return all.sort((left, right) => left.title.localeCompare(right.title));
  });
}

export async function saveSong(song: StrumSong) {
  const next: StrumSong = { ...song, updatedAt: new Date().toISOString(), revision: song.revision + 1 };
  await withStore("readwrite", [SONGS_STORE], async ({ songs }) => { await request(songs.put(next)); });
  return next;
}

export async function createSong(song: StrumSong) {
  await withStore("readwrite", [SONGS_STORE], async ({ songs }) => { await request(songs.add(song)); });
  return song;
}

export async function removeSong(id: string) {
  await withStore("readwrite", [SONGS_STORE], async ({ songs }) => { await request(songs.delete(id)); });
}

export async function exportLibrary(): Promise<StrumLibrary> {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), songs: await getSongs() };
}

export async function replaceLibrary(library: StrumLibrary) {
  await withStore("readwrite", [SONGS_STORE, META_STORE], async ({ songs, meta }) => {
    await request(songs.clear());
    for (const song of library.songs) await request(songs.put(song));
    await request(meta.put(new Date().toISOString(), SEEDED_KEY));
  });
}

export async function requestPersistentStorage() {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}

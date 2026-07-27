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
type LrcLyrics = {
  id: number;
  trackName: string;
  artistName: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

export type OfflineLibraryProgress = {
  completed: number;
  total: number;
  saved: number;
  chorded: number;
  unavailable: number;
};

export type OfflineLibraryResult = OfflineLibraryProgress & { failed: number };

const LRCLIB_URL = "https://lrclib.net";

// Curated against LRCLIB's duplicate recording results. These IDs contain no
// lyric text; they only choose the recording that matches the saved chord map.
const PREFERRED_LRCLIB_IDS: Record<string, number> = {
  "2888678": 8302830,
  "2741586": 3158,
  "271523": 16883324,
  "373896": 29814514,
  "1017988": 1005035,
  "2613978": 28268500,
  "2325077": 2772439,
  "3112253": 5526094,
};

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

function cleanTitle(title: string) { return title.replace(/\s*\(ver \d+\)$/i, ""); }

function normalizeSongName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function chooseLyricResult(song: typeof SAVED_SONGS[number], results: LrcLyrics[]) {
  const preferred = results.find((result) => result.id === PREFERRED_LRCLIB_IDS[song.id]);
  const title = normalizeSongName(cleanTitle(song.title));
  const artist = normalizeSongName(song.artist);
  const exact = results.find((result) => normalizeSongName(result.trackName) === title && normalizeSongName(result.artistName) === artist);
  return preferred ?? exact ?? (results.length === 1 ? results[0] : undefined);
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

/**
 * Downloads only on the user's device after they explicitly request it.
 * Complete lyric text is never included in the public STRUM bundle.
 */
export async function buildOfflineLibrary(onProgress?: (progress: OfflineLibraryProgress) => void): Promise<OfflineLibraryResult> {
  const currentSongs = await getSongs();
  const missing = SAVED_SONGS.filter((saved) => !currentSongs.find((song) => song.id === `saved-${saved.id}`)?.arrangement.trim());
  const progress: OfflineLibraryProgress = { completed: 0, total: missing.length, saved: 0, chorded: 0, unavailable: 0 };
  const report = () => onProgress?.({ ...progress });
  report();
  let failed = 0;

  for (const saved of missing) {
    try {
      const params = new URLSearchParams({ track_name: cleanTitle(saved.title), artist_name: saved.artist });
      const response = await fetch(`${LRCLIB_URL}/api/search?${params}`, {
        headers: { "Lrclib-Client": "STRUM/1.0 (personal offline library; elanroth.github.io)" },
      });
      if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);
      const result = chooseLyricResult(saved, await response.json() as LrcLyrics[]);
      const lyrics = result ? readableLyrics(result) : "";
      if (!lyrics) {
        progress.unavailable++;
      } else {
        const arrangement = migrateArrangement(saved.id, lyrics);
        const current = currentSongs.find((song) => song.id === `saved-${saved.id}`);
        if (current) {
          await saveSong({ ...current, arrangement });
          current.arrangement = arrangement;
          progress.saved++;
          if (IMPORTED_CHORD_PLACEMENTS[saved.id]?.length) progress.chorded++;
        }
      }
    } catch {
      failed++;
    }
    progress.completed++;
    report();
    // Keep a small gap between requests so an initial library fill is polite to LRCLIB.
    if (progress.completed < progress.total) await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return { ...progress, failed };
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

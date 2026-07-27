export type Familiarity = 1 | 2 | 3 | 4 | 5 | null;

export type StrumSong = {
  schemaVersion: 1;
  id: string;
  title: string;
  artist: string;
  album?: string;
  sourceUrl?: string;
  capo: number | null;
  key?: string;
  familiarity: Familiarity;
  arrangement: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type StrumLibrary = {
  schemaVersion: 1;
  exportedAt: string;
  songs: StrumSong[];
};

export type ArrangementToken =
  | { type: "section"; label: string }
  | { type: "blank" }
  | { type: "line"; runs: Array<{ chord?: string; text: string }> };

const chordToken = /^[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add)?\d*(?:\/[A-G](?:#|b)?)?$/;

export function isChord(value: string) {
  return chordToken.test(value.trim());
}

export function parseArrangement(arrangement: string): ArrangementToken[] {
  return arrangement.replace(/\r/g, "").split("\n").map((rawLine) => {
    const line = rawLine.trimEnd();
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section && !isChord(section[1])) return { type: "section", label: section[1] };
    if (!line) return { type: "blank" };

    const runs: Array<{ chord?: string; text: string }> = [];
    let cursor = 0;
    let chord: string | undefined;
    const tags = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = tags.exec(line))) {
      const before = line.slice(cursor, match.index);
      if (before) runs.push({ chord, text: before });
      chord = isChord(match[1]) ? match[1] : undefined;
      if (!chord) runs.push({ text: match[0] });
      cursor = match.index + match[0].length;
    }
    const tail = line.slice(cursor);
    if (tail || !runs.length) runs.push({ chord, text: tail || line });
    return { type: "line", runs };
  });
}

/** Converts character anchors into the one canonical `[Chord]word` format. */
export function injectInlineChords(line: string, chords: Array<[number, string]>) {
  const insertions = new Map<number, string[]>();
  for (const [rawAt, chord] of chords) {
    let at = Math.max(0, Math.min(rawAt, line.length));
    while (at < line.length && /\s/.test(line[at])) at++;
    while (at > 0 && !/\s/.test(line[at - 1])) at--;
    if (at >= line.length) continue;
    const values = insertions.get(at) ?? [];
    values.push(chord);
    insertions.set(at, values);
  }
  return Array.from(insertions.entries()).sort(([left], [right]) => right - left).reduce(
    (result, [at, names]) => `${result.slice(0, at)}${names.map((name) => `[${name}]`).join("")}${result.slice(at)}`,
    line,
  );
}

export function emptySong(values: Pick<StrumSong, "title" | "artist"> & Partial<Pick<StrumSong, "capo" | "key" | "familiarity" | "arrangement" | "sourceUrl">>): StrumSong {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: values.title.trim(),
    artist: values.artist.trim(),
    capo: values.capo ?? null,
    key: values.key?.trim() || undefined,
    familiarity: values.familiarity ?? null,
    arrangement: values.arrangement ?? "",
    sourceUrl: values.sourceUrl?.trim() || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

export function isStrumSong(value: unknown): value is StrumSong {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<StrumSong>;
  return song.schemaVersion === 1
    && typeof song.id === "string"
    && typeof song.title === "string"
    && typeof song.artist === "string"
    && typeof song.arrangement === "string"
    && (song.capo === null || typeof song.capo === "number")
    && (song.familiarity === null || (typeof song.familiarity === "number" && [1, 2, 3, 4, 5].includes(song.familiarity)));
}

export function parseLibrary(value: unknown): StrumLibrary {
  if (!value || typeof value !== "object") throw new Error("This file is not a STRUM library.");
  const library = value as Partial<StrumLibrary>;
  if (library.schemaVersion !== 1 || !Array.isArray(library.songs) || !library.songs.every(isStrumSong)) {
    throw new Error("This STRUM file has an unsupported schema.");
  }
  return { schemaVersion: 1, exportedAt: typeof library.exportedAt === "string" ? library.exportedAt : new Date().toISOString(), songs: library.songs };
}

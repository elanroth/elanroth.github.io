import { writeFile } from "node:fs/promises";
import { IMPORTED_CHORD_PLACEMENTS, type ChordPlacement } from "../src/Guitar/importedChordPlacements";
import { IMPORTED_PRACTICE_DATA, type ImportedPracticeData } from "../src/Guitar/importedPracticeData";
import { SAVED_SONGS, type SavedSong } from "../src/Guitar/savedSongs";

const LRCLIB_URL = "https://lrclib.net";
const OUTPUT = process.argv[2] ?? "/tmp/strum-coverage-audit.json";
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

type LrcLyrics = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

function cleanTitle(title: string) {
  return title.replace(/\s*\(ver \d+\)$/i, "");
}

function normalizeSongName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function chooseLyricResult(song: SavedSong, results: LrcLyrics[]) {
  const preferred = results.find((result) => result.id === PREFERRED_LRCLIB_IDS[song.id]);
  const titleKey = normalizeSongName(cleanTitle(song.title));
  const artistKey = normalizeSongName(song.artist);
  const exact = results.filter((result) =>
    normalizeSongName(result.trackName) === titleKey &&
    normalizeSongName(result.artistName) === artistKey
  );
  return preferred ?? exact[0] ?? (results.length === 1 ? results[0] : undefined);
}

function readableSyncedLyrics(value: string) {
  return value.replace(/^\[\d{2}:\d{2}(?:\.\d{2,3})?\]\s*/gm, "").trim();
}

function normalizeLyricLine(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0590-\u05ff]+/g, " ").trim();
}

function textHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function lyricFingerprint(value: string) {
  return textHash(normalizeLyricLine(value));
}

function lyricWords(text: string) {
  const words: Array<{ value: string; line: number; at: number }> = [];
  text.replace(/\r/g, "").split("\n").forEach((line, lineIndex) => {
    const normalized = line.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0590-\u05ff]+/g, " ");
    for (const match of normalized.matchAll(/[a-z0-9\u0590-\u05ff]+/g)) {
      words.push({ value: match[0], line: lineIndex, at: match.index ?? 0 });
    }
  });
  return words;
}

function alignWordHashes(source: string[], target: string[]) {
  const rows = Array.from({ length: source.length + 1 }, () => new Uint16Array(target.length + 1));
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
      rows[sourceIndex][targetIndex] = source[sourceIndex - 1] === target[targetIndex - 1]
        ? rows[sourceIndex - 1][targetIndex - 1] + 1
        : Math.max(rows[sourceIndex - 1][targetIndex], rows[sourceIndex][targetIndex - 1]);
    }
  }
  const matches = new Map<number, number>();
  let sourceIndex = source.length;
  let targetIndex = target.length;
  while (sourceIndex && targetIndex) {
    if (source[sourceIndex - 1] === target[targetIndex - 1]) {
      matches.set(sourceIndex - 1, targetIndex - 1);
      sourceIndex--;
      targetIndex--;
    } else if (rows[sourceIndex - 1][targetIndex] >= rows[sourceIndex][targetIndex - 1]) sourceIndex--;
    else targetIndex--;
  }
  return matches;
}

function practiceCoverage(text: string, practice: ImportedPracticeData) {
  const rawLines = text.replace(/\r/g, "").split("\n");
  const words = lyricWords(text);
  const matches = alignWordHashes(practice.wordHashes, words.map((word) => textHash(word.value)));
  const chordLines = new Set<number>();
  let mappedAnchors = 0;
  const nearestTarget = (sourceWord: number) => {
    if (matches.has(sourceWord)) return matches.get(sourceWord);
    for (let distance = 1; distance <= 4; distance++) {
      if (matches.has(sourceWord - distance)) return matches.get(sourceWord - distance);
      if (matches.has(sourceWord + distance)) return matches.get(sourceWord + distance);
    }
    return undefined;
  };
  for (const [sourceWord] of practice.chordAnchors) {
    const targetWord = nearestTarget(sourceWord);
    if (targetWord !== undefined) {
      mappedAnchors++;
      chordLines.add(words[targetWord].line);
    }
  }
  const templates = new Set([...chordLines].map((index) => lyricFingerprint(rawLines[index])));
  rawLines.forEach((line, index) => {
    if (line.trim() && templates.has(lyricFingerprint(line))) chordLines.add(index);
  });
  return { chordLines, mappedAnchors, sourceAnchors: practice.chordAnchors.length };
}

function placementCoverage(text: string, placements: ChordPlacement[]) {
  const rawLines = text.replace(/\r/g, "").split("\n");
  const available = new Map<string, ChordPlacement[]>();
  for (const placement of placements) {
    const queue = available.get(placement[0]) ?? [];
    queue.push(placement);
    available.set(placement[0], queue);
  }
  const chordLines = new Set<number>();
  for (let index = 0; index < rawLines.length;) {
    const line = rawLines[index];
    const queue = line.trim() ? available.get(lyricFingerprint(line)) : undefined;
    if (queue?.shift()) {
      chordLines.add(index++);
      continue;
    }
    let grouped: { count: number; placement: ChordPlacement } | undefined;
    if (line.trim()) {
      for (let count = 2; count <= 4 && index + count <= rawLines.length; count++) {
        const group = rawLines.slice(index, index + count);
        if (group.some((candidate) => !candidate.trim())) break;
        const groupQueue = available.get(lyricFingerprint(group.join(" ")));
        const placement = groupQueue?.shift();
        if (placement) {
          grouped = { count, placement };
          break;
        }
      }
    }
    if (!grouped) {
      index++;
      continue;
    }
    const groupLines = rawLines.slice(index, index + grouped.count);
    const starts: number[] = [];
    groupLines.reduce((offset, candidate) => {
      starts.push(offset);
      return offset + candidate.length + 1;
    }, 0);
    groupLines.forEach((_, groupIndex) => {
      const nextStart = starts[groupIndex + 1] ?? Number.POSITIVE_INFINITY;
      if (grouped!.placement[1].some(([at]) => at >= starts[groupIndex] && at < nextStart)) {
        chordLines.add(index + groupIndex);
      }
    });
    index += grouped.count;
  }
  return chordLines;
}

async function fetchLyrics(song: SavedSong) {
  const params = new URLSearchParams({ track_name: cleanTitle(song.title), artist_name: song.artist });
  const response = await fetch(`${LRCLIB_URL}/api/search?${params}`, {
    headers: { "Lrclib-Client": "STRUM/1.0 (personal offline library; elanroth.github.io)" },
  });
  if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);
  const results = await response.json() as LrcLyrics[];
  return { results, selected: chooseLyricResult(song, results) };
}

async function main() {
  const rows: Array<Record<string, string | number | undefined>> = [];
  for (const [index, song] of SAVED_SONGS.entries()) {
    try {
      const { results, selected } = await fetchLyrics(song);
      if (!selected) {
        rows.push({ id: song.id, title: song.title, artist: song.artist, status: results.length ? "ambiguous" : "missing", candidates: results.length });
      } else {
        const text = (selected.plainLyrics || (selected.syncedLyrics ? readableSyncedLyrics(selected.syncedLyrics) : "")).trim();
        const nonblank = text.split(/\r?\n/).filter((line) => line.trim()).length;
        const practice = IMPORTED_PRACTICE_DATA[song.id];
        const practiceResult = practice?.wordHashes.length && practice.chordAnchors.length
          ? practiceCoverage(text, practice)
          : undefined;
        const chordLines = practiceResult?.chordLines
          ?? placementCoverage(text, IMPORTED_CHORD_PLACEMENTS[song.id] ?? []);
        rows.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          status: text ? "checked" : "no-text",
          lrclibId: selected.id,
          nonblankLines: nonblank,
          chordedLines: chordLines.size,
          missingChordLines: Math.max(0, nonblank - chordLines.size),
          coverage: nonblank ? Number((chordLines.size / nonblank).toFixed(4)) : 0,
          sourceAnchors: practiceResult?.sourceAnchors ?? 0,
          mappedAnchors: practiceResult?.mappedAnchors ?? 0,
          anchorCoverage: practiceResult?.sourceAnchors
            ? Number((practiceResult.mappedAnchors / practiceResult.sourceAnchors).toFixed(4))
            : 0,
        });
      }
    } catch (error) {
      rows.push({ id: song.id, title: song.title, artist: song.artist, status: "error", error: error instanceof Error ? error.message : String(error) });
    }
    process.stderr.write(`\r${index + 1}/${SAVED_SONGS.length}`);
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  process.stderr.write("\n");

  const checked = rows.filter((row) => row.status === "checked");
  const report = {
    generatedAt: new Date().toISOString(),
    scope: { totalSongs: SAVED_SONGS.length, attempted: rows.length, checkedWithLyrics: checked.length },
    summary: {
      complete: checked.filter((row) => row.missingChordLines === 0).length,
      partial: checked.filter((row) => (row.chordedLines ?? 0) > 0 && (row.missingChordLines ?? 0) > 0).length,
      zeroChordCoverage: checked.filter((row) => row.chordedLines === 0).length,
      unavailableOrAmbiguous: rows.filter((row) => row.status !== "checked").length,
      allSourceAnchorsMapped: checked.filter((row) => row.sourceAnchors > 0 && row.sourceAnchors === row.mappedAnchors).length,
      partialSourceAnchorMapping: checked.filter((row) => row.mappedAnchors > 0 && row.sourceAnchors !== row.mappedAnchors).length,
      zeroSourceAnchorMapping: checked.filter((row) => row.sourceAnchors > 0 && row.mappedAnchors === 0).length,
    },
    songs: rows,
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary));
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

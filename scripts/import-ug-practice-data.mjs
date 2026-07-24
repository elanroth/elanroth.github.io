import fs from "node:fs/promises";

const savedSongsPath = new URL("../src/Guitar/savedSongs.ts", import.meta.url);
const source = await fs.readFile(savedSongsPath, "utf8");
const urls = [...source.matchAll(/https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^"]+/g)].map((match) => match[0]);
const cacheDirectory = process.env.STRUM_UG_CACHE ?? "/tmp/strum-ug-cache";
await fs.mkdir(cacheDirectory, { recursive: true });

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function parseStore(html) {
  const match = html.match(/<div class="js-store" data-content="([\s\S]*?)"><\/div>/);
  if (!match) throw new Error("Ultimate Guitar page did not contain js-store data");
  return JSON.parse(decodeHtml(match[1]));
}

function normalizedWords(value) {
  const normalized = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0590-\u05ff]+/g, " ");
  return [...normalized.matchAll(/[a-z0-9\u0590-\u05ff]+/g)].map((match) => ({ value: match[0], at: match.index ?? 0 }));
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function chordLine(line) {
  const chords = [];
  let visible = "";
  let cursor = 0;
  for (const match of line.matchAll(/\[ch\]([\s\S]*?)\[\/ch\]/g)) {
    visible += line.slice(cursor, match.index).replace(/\[[^\]]+\]/g, "");
    chords.push({ at: visible.length, name: match[1] });
    visible += match[1];
    cursor = (match.index ?? 0) + match[0].length;
  }
  visible += line.slice(cursor).replace(/\[[^\]]+\]/g, "");
  return { chords, visible };
}

function practiceFromWiki(content) {
  const lines = content.replace(/\r/g, "").replace(/\[\/?tab\]/g, "").split("\n");
  const rawWords = [];
  const chordAnchors = [];
  const sections = [];
  let pendingChords = null;
  let pendingSection = "";
  let started = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const section = line.trim().match(/^\[([^\]]+)\]$/);
    if (section && !line.includes("[ch]")) {
      pendingSection = section[1];
      pendingChords = null;
      started = true;
      continue;
    }
    if (line.includes("[ch]")) {
      pendingChords = chordLine(line);
      started = true;
      continue;
    }
    if (!line.trim()) {
      pendingChords = null;
      continue;
    }
    if (!started || /^[-_=]{3,}$/.test(line.trim())) continue;

    const words = normalizedWords(line);
    if (!words.length) {
      pendingChords = null;
      continue;
    }
    const start = rawWords.length;
    if (pendingSection) {
      sections.push([start, pendingSection]);
      pendingSection = "";
    }
    rawWords.push(...words.map((word) => word.value));

    if (pendingChords?.chords.length) {
      for (const chord of pendingChords.chords) {
        let nearest = 0;
        for (let index = 1; index < words.length; index++) {
          if (Math.abs(words[index].at - chord.at) < Math.abs(words[nearest].at - chord.at)) nearest = index;
        }
        chordAnchors.push([start + nearest, chord.name]);
      }
    }
    pendingChords = null;
  }

  return { wordHashes: rawWords.map(hash), chordAnchors, sections };
}

const strokeMap = {
  1: ["D", ""],
  2: ["D", "mute"],
  3: ["D", "accent"],
  101: ["U", ""],
  102: ["U", "mute"],
  103: ["U", "accent"],
  201: ["PM", ""],
  202: ["–", "rest"],
  203: ["—", "rest"],
};

function practiceFromPage(html, url) {
  const store = parseStore(html);
  const view = store?.store?.page?.data?.tab_view;
  const id = url.match(/(\d+)$/)?.[1] ?? url;
  const wiki = view?.wiki_tab?.content;
  const aligned = typeof wiki === "string" ? practiceFromWiki(wiki) : { wordHashes: [], chordAnchors: [], sections: [] };
  const strumming = (view?.strummings ?? []).map((pattern) => ({
    part: pattern.part || "All",
    bpm: Number(pattern.bpm) || 0,
    denominator: Number(pattern.denuminator) || 8,
    triplet: Boolean(pattern.is_triplet),
    beats: (pattern.measures ?? []).map((beat) => strokeMap[beat.measure] ?? ["?", ""]),
  }));
  return [id, { ...aligned, strumming }];
}

async function fetchPage(url) {
  const id = url.match(/(\d+)$/)?.[1] ?? encodeURIComponent(url);
  const cachePath = `${cacheDirectory}/${id}.html`;
  try {
    return practiceFromPage(await fs.readFile(cachePath, "utf8"), url);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" } });
    if (response.ok) {
      const html = await response.text();
      await fs.writeFile(cachePath, html);
      return practiceFromPage(html, url);
    }
    if (response.status !== 429 || attempt === 5) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
  }
  throw new Error(`Failed to import ${url}`);
}

const entries = [];
for (let offset = 0; offset < urls.length; offset++) {
  entries.push(await fetchPage(urls[offset]));
  console.error(`Imported ${offset + 1}/${urls.length}`);
  await new Promise((resolve) => setTimeout(resolve, 1250));
}

const data = Object.fromEntries(entries);
const output = `export type StrumBeat = [stroke: "D" | "U" | "PM" | "–" | "—" | "?", effect: "" | "mute" | "accent" | "rest"];
export type StrummingPattern = { part: string; bpm: number; denominator: number; triplet: boolean; beats: StrumBeat[] };
export type ImportedPracticeData = {
  wordHashes: string[];
  chordAnchors: Array<[wordIndex: number, chord: string]>;
  sections: Array<[wordIndex: number, section: string]>;
  strumming: StrummingPattern[];
};

// Generated from the saved public Ultimate Guitar tab payloads.
// Lyric text is not stored: one-way word hashes align chords to LRCLIB at runtime.
export const IMPORTED_PRACTICE_DATA: Record<string, ImportedPracticeData> = ${JSON.stringify(data)};
`;

process.stdout.write(output);

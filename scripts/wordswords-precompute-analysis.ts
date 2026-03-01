/**
 * wordswords-precompute-analysis.ts
 *
 * Precomputes pattern-analysis data for n=1..MAX_N, writing one JSON per n:
 *   public/wordswords/analysis-n{n}.json
 *
 * Crash-resume: public/wordswords/analysis-progress.json tracks completed n.
 * Re-running skips already-done n values.
 *
 * Run:
 *   NODE_OPTIONS='--max-old-space-size=10000' npx tsx scripts/wordswords-precompute-analysis.ts
 *
 * MEMORY STRATEGY
 * ───────────────
 * n <= FULL_MAX_N  →  "full" mode: complete Map, gapCounts for true median, branch counts.
 * n >  FULL_MAX_N  →  "compact" mode: Map with flat primitive entries + bounded heaps per
 *                     category. Never builds a full sorted array of all patterns. Branch
 *                     stats omitted. medianGap = average gap (approximation).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT         = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORDLIST_PATH = path.join(ROOT, "public/wordswords/wordlist.txt");
const ZIPF_PATH     = path.join(ROOT, "public/wordswords/zipf.tsv");
const OUTPUT_DIR    = path.join(ROOT, "public/wordswords");
const PROGRESS_PATH = path.join(OUTPUT_DIR, "analysis-progress.json");

const MIN_N        = 1;
const MAX_N        = 8;   // n=1..8
const FULL_MAX_N   = 4;   // n<=4 full mode; n>=5 compact mode
const TOP          = 20;  // items per category / bucket
const DEFAULT_ZIPF = -12;
const RARE   = new Set(["j", "q", "x", "z"]);
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

// =============================================================================
// Shared output types
// =============================================================================

type PatternTopWord = { word: string; zipf: number };

type PatternStats = {
  pattern: string;
  count: number;
  topWords: PatternTopWord[];
  bestGap: number | null;
  bestGapWord: string;
  medianGap: number;
  branchMask: number;
  branchCount: number;
  topZipf: number;
  dominance: number;
  structure: string;
  vowelCount: number;
  vcPattern: string;
  isAlternating: boolean;
  hasRare: boolean;
};

type AnalysisOutput = {
  meta: { n: number; totalPatterns: number; nonZeroPatterns: number; maxLen: number; computedAt: string; note?: string };
  categories: {
    topByCount: PatternStats[]; fewestNonZero: PatternStats[]; topByZipf: PatternStats[];
    hardest: PatternStats[]; rareLetters: PatternStats[]; branchOne: PatternStats[];
    branchHigh: PatternStats[]; alternating: PatternStats[];
  };
  structureBuckets: Record<string, PatternStats[]>;
  vowelBuckets: Record<string, PatternStats[]>;
};

type Progress = { completedN: number[]; startedAt: string };

// Minimal word record — no nextPos/mask needed for subsequence enumeration
type WordRecord = { word: string; zipf: number; len: number };

// =============================================================================
// Subsequence enumeration
// =============================================================================

/**
 * Iterates all DISTINCT length-n subsequences of `word` via callback.
 *
 * Deduplication is done with a constant-size (≤26 entries) per-depth char set.
 * Optional `firstLetter`: only emit subsequences whose first character matches,
 * pruning entire subtrees at depth 0 for non-matching letters — this lets us
 * process one "first letter" partition at a time with zero extra overhead.
 */
function forEachSubsequence(
  word: string, n: number, cb: (p: string) => void, firstLetter?: string
): void {
  const len = word.length;
  if (n <= 0 || n > len) return;
  const buf = new Array<string>(n);
  const recurse = (start: number, depth: number): void => {
    if (depth === n) { cb(buf.join("")); return; }
    const seenChar = new Set<string>(); // ≤26 entries — negligible
    for (let i = start; i <= len - (n - depth); i++) {
      const ch = word[i];
      if (depth === 0 && firstLetter !== undefined && ch !== firstLetter) continue;
      if (seenChar.has(ch)) continue;
      seenChar.add(ch);
      buf[depth] = ch;
      recurse(i + 1, depth + 1);
    }
  };
  recurse(0, 0);
}

// =============================================================================
// Pattern metadata helpers
// =============================================================================

function canonicalPattern(pattern: string): string {
  const map = new Map<string, string>();
  let code = 65, out = "";
  for (const ch of pattern) {
    let label = map.get(ch);
    if (!label) { label = String.fromCharCode(code++); map.set(ch, label); }
    out += label;
  }
  return out;
}

type Meta = { structure: string; vowelCount: number; vcPattern: string; isAlternating: boolean; hasRare: boolean };

function getPatternMeta(pattern: string): Meta {
  const structure = canonicalPattern(pattern);
  let vowelCount = 0, vcPattern = "", hasRare = false;
  for (const ch of pattern) {
    const v = VOWELS.has(ch); if (v) vowelCount++;
    vcPattern += v ? "V" : "C";
    if (RARE.has(ch)) hasRare = true;
  }
  let isAlternating = vcPattern.length > 1;
  for (let i = 1; i < vcPattern.length; i++) if (vcPattern[i] === vcPattern[i-1]) { isAlternating = false; break; }
  return { structure, vowelCount, vcPattern, isAlternating, hasRare };
}

function popcount(v: number): number { let c = 0; while (v) { v &= v-1; c++; } return c; }
function memMB(): string { return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0) + "MB"; }

// =============================================================================
// FULL MODE (n <= FULL_MAX_N)
// Complete per-pattern stats: gapCounts for true median, branch, top-3 words.
// =============================================================================

type FullEntry = {
  count: number; topWords: PatternTopWord[]; bestGap: number; bestGapWord: string;
  gapCounts: Uint16Array; branchMask: number; branchCount: number; topZipf: number;
  structure: string; vowelCount: number; vcPattern: string; isAlternating: boolean; hasRare: boolean;
};

function computeAnalysisFull(records: WordRecord[], n: number): AnalysisOutput {
  const maxLen = records.reduce((a, r) => Math.max(a, r.len), 0);
  const map = new Map<string, FullEntry>();

  // ── Collect ──────────────────────────────────────────────────────────────
  console.log(`  [n=${n}] collect (full)…`);
  const step = Math.max(5000, Math.floor(records.length / 20));
  for (let ri = 0; ri < records.length; ri++) {
    const rec = records[ri];
    if (rec.len < n) continue;
    const gap = rec.len - n;
    forEachSubsequence(rec.word, n, (pattern) => {
      let e = map.get(pattern);
      if (!e) {
        const meta = getPatternMeta(pattern);
        e = { count: 0, topWords: [], bestGap: Infinity, bestGapWord: "",
          gapCounts: new Uint16Array(maxLen - n + 1), branchMask: 0, branchCount: 0, topZipf: DEFAULT_ZIPF, ...meta };
        map.set(pattern, e);
      }
      e.count++;
      if (gap < e.gapCounts.length) e.gapCounts[gap]++;
      if (gap < e.bestGap) { e.bestGap = gap; e.bestGapWord = rec.word; }
      else if (gap === e.bestGap && rec.zipf > e.topZipf) e.bestGapWord = rec.word;
      if (!e.topWords.find((x) => x.word === rec.word)) {
        e.topWords.push({ word: rec.word, zipf: rec.zipf });
        e.topWords.sort((a, b) => b.zipf - a.zipf);
        if (e.topWords.length > 3) e.topWords.length = 3;
      }
    });
    if (ri % step === 0) process.stdout.write(`\r  [n=${n}] collect ${Math.round(ri/records.length*100)}% (${map.size} patterns, ${memMB()})`);
  }
  console.log(`\r  [n=${n}] collect done – ${map.size} patterns, ${memMB()}`);

  // ── Branch ───────────────────────────────────────────────────────────────
  if (n + 1 <= maxLen) {
    console.log(`  [n=${n}] branch…`);
    for (const rec of records) {
      if (rec.len < n + 1) continue;
      forEachSubsequence(rec.word, n + 1, (p) => {
        const e = map.get(p.slice(0, n));
        if (!e) return;
        const code = p.charCodeAt(n) - 97;
        if (code >= 0 && code < 26) e.branchMask |= 1 << code;
      });
    }
    for (const e of map.values()) e.branchCount = popcount(e.branchMask);
    console.log(`  [n=${n}] branch done`);
  }

  // ── Finalize ─────────────────────────────────────────────────────────────
  console.log(`  [n=${n}] finalize…`);
  const all: PatternStats[] = [];
  for (const [pattern, e] of map) {
    e.topWords.sort((a, b) => b.zipf - a.zipf);
    const topZipf = e.topWords[0]?.zipf ?? DEFAULT_ZIPF;
    const dominance = e.topWords.length >= 3 ? e.topWords[0].zipf - e.topWords[2].zipf : 0;
    let medianGap = 0;
    if (e.count > 0) { const t = Math.floor((e.count-1)/2); let acc = 0; for (let i = 0; i < e.gapCounts.length; i++) { acc += e.gapCounts[i]; if (acc > t) { medianGap = i; break; } } }
    all.push({ pattern, count: e.count, topWords: e.topWords, bestGap: e.bestGap === Infinity ? null : e.bestGap,
      bestGapWord: e.bestGapWord, medianGap, branchMask: e.branchMask, branchCount: e.branchCount,
      topZipf, dominance, structure: e.structure, vowelCount: e.vowelCount,
      vcPattern: e.vcPattern, isAlternating: e.isAlternating, hasRare: e.hasRare });
  }
  map.clear();

  // ── Categories ────────────────────────────────────────────────────────────
  console.log(`  [n=${n}] categories…`);
  const nz = all.filter((s) => s.count > 0);
  const hs = (s: PatternStats) => s.count + s.topZipf * 1000;
  const byCount = [...nz].sort((a, b) => b.count - a.count || b.topZipf - a.topZipf);
  const byCountAsc = [...nz].sort((a, b) => a.count - b.count || a.topZipf - b.topZipf);
  const byZipf = [...nz].sort((a, b) => b.topZipf - a.topZipf || b.count - a.count);
  const byHard = [...nz].sort((a, b) => hs(a) - hs(b));
  const byBranch = [...nz].sort((a, b) => b.branchCount - a.branchCount);

  const structMap = new Map<string, PatternStats[]>();
  const vowMap    = new Map<number, PatternStats[]>();
  for (const s of byCount) {
    const sb = structMap.get(s.structure) ?? []; if (sb.length < TOP) sb.push(s); structMap.set(s.structure, sb);
    const vb = vowMap.get(s.vowelCount)   ?? []; if (vb.length < TOP) vb.push(s); vowMap.set(s.vowelCount, vb);
  }
  const structureBuckets: Record<string, PatternStats[]> = {};
  for (const [k, v] of structMap) structureBuckets[k] = v;
  const vowelBuckets: Record<string, PatternStats[]> = {};
  for (const [k, v] of vowMap) vowelBuckets[String(k)] = v;

  return {
    meta: { n, totalPatterns: Math.pow(26, n), nonZeroPatterns: nz.length, maxLen, computedAt: new Date().toISOString() },
    categories: {
      topByCount: byCount.slice(0, TOP), fewestNonZero: byCountAsc.slice(0, TOP),
      topByZipf: byZipf.slice(0, TOP), hardest: byHard.slice(0, TOP),
      rareLetters: byCount.filter((s) => s.hasRare).slice(0, TOP),
      branchOne: nz.filter((s) => s.branchCount === 1).sort((a, b) => a.count - b.count).slice(0, TOP),
      branchHigh: byBranch.slice(0, TOP),
      alternating: nz.filter((s) => s.isAlternating).sort((a, b) => b.count - a.count).slice(0, TOP),
    },
    structureBuckets, vowelBuckets,
  };
}

// =============================================================================
// COMPACT MODE (n > FULL_MAX_N)
// Flat primitive entries + bounded heaps — never builds a full sorted array.
// Branch omitted. medianGap = average gap (approximation).
// =============================================================================

/** Flat primitive-only entry minimises per-object overhead */
type CompactEntry = {
  count: number; totalGap: number; topZipf: number; topWord: string;
  bestGap: number; bestGapWord: string;
  vowelCount: number; isAlternating: boolean; hasRare: boolean;
};

/** Maintains sorted top-K [score, key] pairs, bounded in memory */
class BoundedTop {
  private items: Array<[number, string]> = [];
  constructor(private readonly k: number, private readonly desc: boolean) {}
  push(score: number, key: string): void {
    const { k, desc, items } = this;
    if (items.length < k) {
      items.push([score, key]);
      items.sort((a, b) => desc ? b[0]-a[0] : a[0]-b[0]);
      return;
    }
    const worst = items[k-1][0];
    if (desc ? score > worst : score < worst) {
      items[k-1] = [score, key];
      items.sort((a, b) => desc ? b[0]-a[0] : a[0]-b[0]);
    }
  }
  keys(): string[] { return this.items.map((x) => x[1]); }
}

function computeAnalysisCompact(records: WordRecord[], n: number): AnalysisOutput {
  const maxLen = records.reduce((a, r) => Math.max(a, r.len), 0);

  // Bounded category collectors — persist across all letter passes
  const catCount    = new BoundedTop(TOP, true);
  const catCountAsc = new BoundedTop(TOP, false);
  const catZipf     = new BoundedTop(TOP, true);
  const catHard     = new BoundedTop(TOP, false);
  const catRare     = new BoundedTop(TOP, true);
  const catAlt      = new BoundedTop(TOP, true);
  const structCats  = new Map<string, BoundedTop>();
  const vowCats     = new Map<number, BoundedTop>();

  // Small map kept alive across passes — only stores entries currently in a heap.
  // Since each pattern has a unique first letter, its entry is final after its letter's pass.
  const winnersMap = new Map<string, CompactEntry>();

  /** Push all heaps, then save any just-pushed winner entries to winnersMap. */
  const drainToHeaps = (map: Map<string, CompactEntry>) => {
    const hs = (e: CompactEntry) => e.count + e.topZipf * 1000;
    for (const [pattern, e] of map) {
      const struct = canonicalPattern(pattern);
      catCount.push(e.count, pattern);
      catCountAsc.push(e.count, pattern);
      catZipf.push(e.topZipf, pattern);
      catHard.push(hs(e), pattern);
      if (e.hasRare)       catRare.push(e.count, pattern);
      if (e.isAlternating) catAlt.push(e.count, pattern);
      if (!structCats.has(struct)) structCats.set(struct, new BoundedTop(TOP, true));
      structCats.get(struct)!.push(e.count, pattern);
      if (!vowCats.has(e.vowelCount)) vowCats.set(e.vowelCount, new BoundedTop(TOP, true));
      vowCats.get(e.vowelCount)!.push(e.count, pattern);
    }
    // Snapshot all current heap keys → save their entries from this sub-map
    const allHeapKeys = [
      ...catCount.keys(), ...catCountAsc.keys(), ...catZipf.keys(),
      ...catHard.keys(), ...catRare.keys(), ...catAlt.keys(),
      ...[...structCats.values()].flatMap((b) => b.keys()),
      ...[...vowCats.values()].flatMap((b) => b.keys()),
    ];
    for (const key of allHeapKeys) {
      const e = map.get(key);
      if (e) winnersMap.set(key, e); // entry is final (its letter is done)
    }
  };

  // ── 26 letter-partitioned passes ─────────────────────────────────────────
  // V8's Map hits its capacity limit (~8M entries) for n>=7 with a single pass.
  // Partitioning by first letter keeps each sub-Map to ~300K entries.
  // Total work is identical to a single pass (each pattern has exactly one first letter).
  let totalPatterns = 0;
  const step = Math.max(5000, Math.floor(records.length / 10));
  for (let lc = 0; lc < 26; lc++) {
    const firstLetter = String.fromCharCode(97 + lc);
    const map = new Map<string, CompactEntry>();

    for (let ri = 0; ri < records.length; ri++) {
      const rec = records[ri];
      if (rec.len < n) continue;
      if (!rec.word.includes(firstLetter)) continue; // quick pre-filter
      const gap = rec.len - n;
      forEachSubsequence(rec.word, n, (pattern) => {
        let e = map.get(pattern);
        if (!e) {
          const meta = getPatternMeta(pattern);
          e = { count: 0, totalGap: 0, topZipf: DEFAULT_ZIPF, topWord: rec.word,
            bestGap: Number.MAX_SAFE_INTEGER, bestGapWord: rec.word,
            vowelCount: meta.vowelCount, isAlternating: meta.isAlternating, hasRare: meta.hasRare };
          map.set(pattern, e);
        }
        e.count++; e.totalGap += gap;
        if (gap < e.bestGap) { e.bestGap = gap; e.bestGapWord = rec.word; }
        if (rec.zipf > e.topZipf) { e.topZipf = rec.zipf; e.topWord = rec.word; }
      }, firstLetter);

      if (ri % step === 0) process.stdout.write(
        `\r  [n=${n}] letter '${firstLetter}' (${Math.round(ri/records.length*100)}%, ${map.size} patterns, ${memMB()})`);
    }

    totalPatterns += map.size;
    drainToHeaps(map);
    console.log(`\r  [n=${n}] letter '${firstLetter}' done – ${map.size} patterns (total ${totalPatterns}, ${memMB()})`);
    // map goes out of scope here → GC'd before next letter's allocation
  }
  console.log(`  [n=${n}] all letters done – ${totalPatterns} total patterns`);

  // ── Resolve to PatternStats using winnersMap ──────────────────────────────
  const resolve = (keys: string[]): PatternStats[] => keys.map((p) => {
    const e = winnersMap.get(p);
    if (!e) return null!;
    const meta = getPatternMeta(p);
    return { pattern: p, count: e.count, topWords: [{ word: e.topWord, zipf: e.topZipf }],
      bestGap: e.bestGap === Number.MAX_SAFE_INTEGER ? null : e.bestGap, bestGapWord: e.bestGapWord,
      medianGap: e.count > 0 ? Math.round(e.totalGap / e.count) : 0,
      branchMask: 0, branchCount: 0, topZipf: e.topZipf, dominance: 0, ...meta };
  }).filter(Boolean);

  const structureBuckets: Record<string, PatternStats[]> = {};
  for (const [k, b] of structCats) structureBuckets[k] = resolve(b.keys());
  const vowelBuckets: Record<string, PatternStats[]> = {};
  for (const [k, b] of vowCats) vowelBuckets[String(k)] = resolve(b.keys());

  return {
    meta: { n, totalPatterns: Math.pow(26, n), nonZeroPatterns: totalPatterns, maxLen,
      computedAt: new Date().toISOString(),
      note: `Branch counts unavailable for n>${FULL_MAX_N}; medianGap is average gap.` },
    categories: {
      topByCount: resolve(catCount.keys()), fewestNonZero: resolve(catCountAsc.keys()),
      topByZipf: resolve(catZipf.keys()), hardest: resolve(catHard.keys()),
      rareLetters: resolve(catRare.keys()), branchOne: [], branchHigh: [],
      alternating: resolve(catAlt.keys()),
    },
    structureBuckets, vowelBuckets,
  };
}



// =============================================================================
// Progress helpers
// =============================================================================

async function loadProgress(): Promise<Progress> {
  if (!existsSync(PROGRESS_PATH)) return { completedN: [], startedAt: new Date().toISOString() };
  return JSON.parse(await readFile(PROGRESS_PATH, "utf8")) as Progress;
}
async function saveProgress(p: Progress) { await writeFile(PROGRESS_PATH, JSON.stringify(p, null, 2), "utf8"); }

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("=== WordsWords Analysis Precompute ===");
  console.log(`  n=${MIN_N}..${MAX_N}   full mode n<=${FULL_MAX_N}, compact mode n>${FULL_MAX_N}`);

  const progress = await loadProgress();
  console.log(`  Already done: [${progress.completedN.join(", ")}]`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log("\nLoading wordlist…");
  const words = (await readFile(WORDLIST_PATH, "utf8"))
    .split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
  console.log(`  ${words.length} words`);

  console.log("Loading Zipf…");
  const zipfMap = new Map<string, number>();
  for (const line of (await readFile(ZIPF_PATH, "utf8")).split(/\r?\n/)) {
    const [w, z] = line.trim().split("\t");
    if (w && z) zipfMap.set(w.toLowerCase(), Number(z));
  }
  console.log(`  ${zipfMap.size} entries`);

  // Minimal records — no nextPos/mask needed
  const records: WordRecord[] = words.map((w) => ({ word: w, zipf: zipfMap.get(w) ?? DEFAULT_ZIPF, len: w.length }));
  // Sort shortest-first so large-n collect phase encounters long words (large gaps) last
  records.sort((a, b) => a.len - b.len || b.zipf - a.zipf);
  console.log(`  ${records.length} records, ${memMB()} heap`);

  for (let n = MIN_N; n <= MAX_N; n++) {
    if (progress.completedN.includes(n)) { console.log(`\n[n=${n}] skipping (done)`); continue; }

    const mode = n <= FULL_MAX_N ? "full" : "compact";
    console.log(`\n[n=${n}] starting (${mode} mode)…`);
    const t0 = Date.now();
    const result = n <= FULL_MAX_N ? computeAnalysisFull(records, n) : computeAnalysisCompact(records, n);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const outPath = path.join(OUTPUT_DIR, `analysis-n${n}.json`);
    const json = JSON.stringify(result);
    await writeFile(outPath, json, "utf8");
    const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
    console.log(`  [n=${n}] done in ${elapsed}s  →  ${outPath}  (${kb} KB)`);

    progress.completedN.push(n);
    await saveProgress(progress);
  }

  console.log("\n=== All done! ===  completed:", progress.completedN);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

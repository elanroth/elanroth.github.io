export type Procedure = "baseline" | "automaton";
export type SortKey = "word" | "zipf" | "gap";
export type SortDirection = "asc" | "desc";

export type PatternTopWord = {
	word: string;
	zipf: number;
};

export type PatternStats = {
	pattern: string;
	count: number;
	topWords: PatternTopWord[];
	bestGap: number;
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
	gapCounts?: Uint16Array;
};

export type AnalysisResult = {
	byN: Record<number, PatternStats[]>;
	maxN: number;
	maxLen: number;
	totalPatterns: Record<number, number>;
	nonZeroPatterns: Record<number, number>;
};

export type AnalysisStage = "init" | "collect" | "branch" | "finalize";

export type AnalysisProgressUpdate = {
	stage: AnalysisStage;
	progress: number;
	processed?: number;
	total?: number;
	patternsFound?: number;
	branchPrefixes?: number;
	currentWord?: string;
};

export type WordRecord = {
	word: string;
	zipf: number;
	len: number;
	mask: number;
	nextPos: Int16Array;
	firstPos: Int16Array;
};

export type RankedWord = {
	word: string;
	zipf: number;
	gap: number;
	len: number;
};

export type QueryRun = {
	results: RankedWord[];
	total: number;
};

export const DEFAULT_ZIPF = -12;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export function normalizeWord(raw: string): string {
	return raw.trim().toLowerCase();
}

export function normalizePattern(raw: string): string {
	return raw.toLowerCase().replace(/[^a-z]/g, "");
}

export function computeLetterMask(word: string): number {
	let mask = 0;
	for (let i = 0; i < word.length; i += 1) {
		const code = word.charCodeAt(i) - 97;
		if (code >= 0 && code < 26) {
			mask |= 1 << code;
		}
	}
	return mask;
}

export function buildNextPos(word: string): Int16Array {
	const len = word.length;
	const next = new Int16Array((len + 1) * 26);
	for (let i = 0; i < next.length; i += 1) next[i] = -1;
	const last = new Int16Array(26);
	for (let i = 0; i < 26; i += 1) last[i] = -1;
	for (let i = len - 1; i >= 0; i -= 1) {
		const idx = word.charCodeAt(i) - 97;
		if (idx >= 0 && idx < 26) last[idx] = i;
		const row = i * 26;
		for (let c = 0; c < 26; c += 1) {
			next[row + c] = last[c];
		}
	}
	const finalRow = len * 26;
	for (let c = 0; c < 26; c += 1) {
		next[finalRow + c] = -1;
	}
	return next;
}

export function isSubsequenceBaseline(pattern: string, word: string): boolean {
	if (pattern.length > word.length) return false;
	let idx = 0;
	for (let i = 0; i < word.length; i += 1) {
		if (word[i] === pattern[idx]) idx += 1;
		if (idx === pattern.length) return true;
	}
	return pattern.length === 0;
}

export function isSubsequenceAutomaton(pattern: string, record: WordRecord): boolean {
	if (pattern.length > record.len) return false;
	let pos = 0;
	for (let i = 0; i < pattern.length; i += 1) {
		const code = pattern.charCodeAt(i) - 97;
		if (code < 0 || code >= 26) return false;
		const next = record.nextPos[pos * 26 + code];
		if (next === -1) return false;
		pos = next + 1;
	}
	return true;
}

export function buildWordRecords(words: string[], zipfMap: Map<string, number>): WordRecord[] {
	return words.map((word) => {
		const zipf = zipfMap.get(word) ?? DEFAULT_ZIPF;
		return {
			word,
			zipf,
			len: word.length,
			mask: 0,
			nextPos: new Int16Array(0),
			firstPos: new Int16Array(0),
		};
	});
}

export function buildIndexes(records: WordRecord[]) {
	for (const record of records) {
		record.mask = computeLetterMask(record.word);
		record.nextPos = buildNextPos(record.word);
		record.firstPos = buildFirstPos(record.word);
	}
}

export function buildFirstPos(word: string): Int16Array {
	const first = new Int16Array(26);
	for (let i = 0; i < 26; i += 1) first[i] = -1;
	for (let i = 0; i < word.length; i += 1) {
		const code = word.charCodeAt(i) - 97;
		if (code >= 0 && code < 26 && first[code] === -1) first[code] = i;
	}
	return first;
}

function compareRank(a: RankedWord, b: RankedWord, key: SortKey, dir: SortDirection): number {
	let primary = 0;
	if (key === "word") {
		primary = a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
	} else if (key === "zipf") {
		primary = a.zipf < b.zipf ? -1 : a.zipf > b.zipf ? 1 : 0;
	} else {
		primary = a.gap < b.gap ? -1 : a.gap > b.gap ? 1 : 0;
	}
	if (dir === "desc") primary *= -1;
	if (primary !== 0) return primary;

	if (a.zipf !== b.zipf) return a.zipf < b.zipf ? -1 : 1;
	if (a.gap !== b.gap) return a.gap > b.gap ? -1 : 1;
	if (a.len !== b.len) return a.len > b.len ? -1 : 1;
	if (a.word === b.word) return 0;
	return a.word > b.word ? -1 : 1;
}

class MinHeap<T> {
	private items: T[] = [];
	constructor(private readonly compare: (a: T, b: T) => number) {}

	size(): number {
		return this.items.length;
	}

	peek(): T | undefined {
		return this.items[0];
	}

	push(value: T) {
		this.items.push(value);
		this.bubbleUp(this.items.length - 1);
	}

	pop(): T | undefined {
		if (this.items.length === 0) return undefined;
		const top = this.items[0];
		const last = this.items.pop();
		if (this.items.length > 0 && last !== undefined) {
			this.items[0] = last;
			this.bubbleDown(0);
		}
		return top;
	}

	replaceTop(value: T) {
		if (this.items.length === 0) {
			this.items.push(value);
			return;
		}
		this.items[0] = value;
		this.bubbleDown(0);
	}

	toArray(): T[] {
		return [...this.items];
	}

	private bubbleUp(idx: number) {
		let i = idx;
		while (i > 0) {
			const parent = Math.floor((i - 1) / 2);
			if (this.compare(this.items[i], this.items[parent]) >= 0) break;
			[this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
			i = parent;
		}
	}

	private bubbleDown(idx: number) {
		let i = idx;
		const len = this.items.length;
		while (true) {
			const left = i * 2 + 1;
			const right = left + 1;
			let smallest = i;
			if (left < len && this.compare(this.items[left], this.items[smallest]) < 0) {
				smallest = left;
			}
			if (right < len && this.compare(this.items[right], this.items[smallest]) < 0) {
				smallest = right;
			}
			if (smallest === i) break;
			[this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
			i = smallest;
		}
	}
}

export function runQuery(
	records: WordRecord[],
	patternRaw: string,
	topN: number,
	procedure: Procedure,
	sortKey: SortKey,
	sortDirection: SortDirection,
	restrictive: boolean
): QueryRun {
	const pattern = normalizePattern(patternRaw);
	if (!pattern) return { results: [], total: 0 };
	const comparator = (a: RankedWord, b: RankedWord) => compareRank(a, b, sortKey, sortDirection);
	const heap = new MinHeap<RankedWord>(comparator);
	const patternMask = computeLetterMask(pattern);
	let total = 0;

	for (let i = 0; i < records.length; i += 1) {
		const record = records[i];
		if (record.len < pattern.length) continue;
		if (procedure === "automaton") {
			if ((patternMask & ~record.mask) !== 0) continue;
			if (restrictive && !passesRestrictive(record, pattern)) continue;
			if (!isSubsequenceAutomaton(pattern, record)) continue;
		} else {
			if (!isSubsequenceBaseline(pattern, record.word)) continue;
		}

		total += 1;
		if (topN <= 0) continue;
		const entry: RankedWord = {
			word: record.word,
			zipf: record.zipf,
			len: record.len,
			gap: record.len - pattern.length,
		};
		if (heap.size() < topN) {
			heap.push(entry);
		} else {
			const worst = heap.peek();
			if (worst && comparator(entry, worst) > 0) {
				heap.replaceTop(entry);
			}
		}
	}

	const results = heap.toArray().sort((a, b) => -comparator(a, b));
	return { results, total };
}

function passesRestrictive(record: WordRecord, pattern: string): boolean {
	let lastFirst = -1;
	for (let i = 0; i < pattern.length; i += 1) {
		const code = pattern.charCodeAt(i) - 97;
		if (code < 0 || code >= 26) return false;
		const pos = record.firstPos[code];
		if (pos === -1) return false;
		if (pos < lastFirst) return false;
		lastFirst = pos;
	}
	return true;
}

export async function analyzePatternsWithProgress(
	records: WordRecord[],
	n: number,
	onProgress?: (update: AnalysisProgressUpdate) => void
): Promise<AnalysisResult> {
	const vowels = new Set(["a", "e", "i", "o", "u"]);
	const rare = new Set(["j", "q", "x", "z"]);
	const maxLen = records.reduce((acc, r) => Math.max(acc, r.len), 0);
	const byNMap = new Map<string, PatternStats>();
	const totalPatterns: Record<number, number> = { [n]: Math.pow(26, n) };
	const nonZeroPatterns: Record<number, number> = { [n]: 0 };
	const yieldToBrowser = () => new Promise((resolve) => window.setTimeout(resolve, 0));
	const emit = (update: AnalysisProgressUpdate) => {
		onProgress?.(update);
	};

	emit({ stage: "init", progress: 0 });
	emit({ stage: "init", progress: 1 });

	emit({ stage: "collect", progress: 0, processed: 0, total: records.length });

	for (let r = 0; r < records.length; r += 1) {
		const record = records[r];
		const word = record.word;
		if (record.len >= n) {
			const set = collectSubsequencePatterns(word, n);
			const gap = record.len - n;
			for (const pattern of set) {
				let stats = byNMap.get(pattern);
				if (!stats) {
					stats = initPatternStats(pattern, maxLen - n, vowels, rare);
					byNMap.set(pattern, stats);
				}
				stats.count += 1;
				if (stats.gapCounts) stats.gapCounts[gap] += 1;
				if (gap < stats.bestGap) {
					stats.bestGap = gap;
					stats.bestGapWord = word;
				} else if (gap === stats.bestGap && record.zipf > stats.topZipf) {
					stats.bestGapWord = word;
				}
				updateTopWords(stats.topWords, word, record.zipf);
			}
		}
		if (r % 120 === 0) {
			const progress = (r + 1) / records.length;
			emit({
				stage: "collect",
				progress,
				processed: r + 1,
				total: records.length,
				patternsFound: byNMap.size,
				currentWord: word,
			});
			await yieldToBrowser();
		}
	}
	emit({ stage: "collect", progress: 1, processed: records.length, total: records.length });

	nonZeroPatterns[n] = byNMap.size;

	emit({ stage: "branch", progress: 0 });
	if (n + 1 <= maxLen) {
		for (const stats of byNMap.values()) {
			stats.branchMask = 0;
		}
		for (const record of records) {
			if (record.len < n + 1) continue;
			const setN1 = collectSubsequencePatterns(record.word, n + 1);
			for (const pattern of setN1) {
				const prefix = pattern.slice(0, n);
				let stats = byNMap.get(prefix);
				if (!stats) {
					stats = initPatternStats(prefix, maxLen - n, vowels, rare);
					byNMap.set(prefix, stats);
				}
				const code = pattern.charCodeAt(n) - 97;
				if (code >= 0 && code < 26) stats.branchMask |= 1 << code;
			}
		}
		for (const stats of byNMap.values()) {
			stats.branchCount = popcount(stats.branchMask);
		}
	}
	emit({ stage: "branch", progress: 1, branchPrefixes: byNMap.size });

	let finalizeTotal = byNMap.size;
	let finalizeDone = 0;
	emit({ stage: "finalize", progress: 0, processed: 0, total: finalizeTotal });
	for (const stats of byNMap.values()) {
		stats.topWords.sort((a, b) => b.zipf - a.zipf);
		stats.topZipf = stats.topWords[0]?.zipf ?? DEFAULT_ZIPF;
		stats.dominance = stats.topWords.length >= 3 ? stats.topWords[0].zipf - stats.topWords[2].zipf : 0;
		if (stats.gapCounts) {
			stats.medianGap = computeMedianGap(stats.gapCounts, stats.count);
			delete stats.gapCounts;
		}
		finalizeDone += 1;
		if (finalizeDone % 2000 === 0) {
			emit({ stage: "finalize", progress: finalizeDone / finalizeTotal, processed: finalizeDone, total: finalizeTotal });
			await yieldToBrowser();
		}
	}
	emit({ stage: "finalize", progress: 1, processed: finalizeDone, total: finalizeTotal });

	const byN: Record<number, PatternStats[]> = { [n]: Array.from(byNMap.values()) };

	return {
		byN,
		maxN: n,
		maxLen,
		totalPatterns,
		nonZeroPatterns,
	};
}

function initPatternStats(pattern: string, maxGap: number, vowels: Set<string>, rare: Set<string>): PatternStats {
	const structure = canonicalPattern(pattern);
	let vowelCount = 0;
	let vcPattern = "";
	let hasRare = false;
	for (const ch of pattern) {
		const isVowel = vowels.has(ch);
		if (isVowel) vowelCount += 1;
		vcPattern += isVowel ? "V" : "C";
		if (rare.has(ch)) hasRare = true;
	}
	let isAlternating = true;
	for (let i = 1; i < vcPattern.length; i += 1) {
		if (vcPattern[i] === vcPattern[i - 1]) {
			isAlternating = false;
			break;
		}
	}
	return {
		pattern,
		count: 0,
		topWords: [],
		bestGap: Number.POSITIVE_INFINITY,
		bestGapWord: "",
		medianGap: 0,
		branchMask: 0,
		branchCount: 0,
		topZipf: DEFAULT_ZIPF,
		dominance: 0,
		structure,
		vowelCount,
		vcPattern,
		isAlternating,
		hasRare,
		gapCounts: new Uint16Array(maxGap + 1),
	};
}

function collectSubsequencePatterns(word: string, n: number): Set<string> {
	const set = new Set<string>();
	const letters = word.split("");
	const len = letters.length;
	if (n <= 0 || n > len) return set;
	const indices = new Array<number>(n);
	const build = (start: number, depth: number) => {
		if (depth === n) {
			let out = "";
			for (let i = 0; i < n; i += 1) out += letters[indices[i]];
			set.add(out);
			return;
		}
		for (let i = start; i <= len - (n - depth); i += 1) {
			indices[depth] = i;
			build(i + 1, depth + 1);
		}
	};
	build(0, 0);
	return set;
}

function updateTopWords(list: PatternTopWord[], word: string, zipf: number) {
	if (list.find((item) => item.word === word)) return;
	list.push({ word, zipf });
	list.sort((a, b) => b.zipf - a.zipf);
	if (list.length > 3) list.length = 3;
}

function canonicalPattern(pattern: string): string {
	const map = new Map<string, string>();
	let nextCode = 65;
	let out = "";
	for (const ch of pattern) {
		let label = map.get(ch);
		if (!label) {
			label = String.fromCharCode(nextCode);
			nextCode += 1;
			map.set(ch, label);
		}
		out += label;
	}
	return out;
}

function computeMedianGap(counts: Uint16Array, total: number): number {
	if (total === 0) return 0;
	const target = Math.floor((total - 1) / 2);
	let acc = 0;
	for (let i = 0; i < counts.length; i += 1) {
		acc += counts[i];
		if (acc > target) return i;
	}
	return counts.length - 1;
}

function popcount(value: number): number {
	let v = value;
	let count = 0;
	while (v) {
		v &= v - 1;
		count += 1;
	}
	return count;
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function alphabetLetters(): string[] {
	return ALPHABET.split("");
}

export type Procedure = "baseline" | "automaton";
export type SortMode = "gap" | "zipf";

export type WordRecord = {
	word: string;
	zipf: number;
	len: number;
	mask: number;
	nextPos: Int16Array;
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

export type ProcedureBenchmark = {
	procedure: Procedure;
	warmupIters: number;
	measuredIters: number;
	patternCount: number;
	avgMsPerQuery: number;
	medianMsPerQuery: number;
	avgMatches: number;
	medianMatches: number;
};

export type BenchmarkReport = {
	patterns: string[];
	results: ProcedureBenchmark[];
	bestProcedure: Procedure;
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
		};
	});
}

export function buildIndexes(records: WordRecord[]) {
	for (const record of records) {
		record.mask = computeLetterMask(record.word);
		record.nextPos = buildNextPos(record.word);
	}
}

function compareRank(a: RankedWord, b: RankedWord): number {
	if (a.zipf !== b.zipf) return a.zipf < b.zipf ? -1 : 1;
	if (a.gap !== b.gap) return a.gap > b.gap ? -1 : 1;
	if (a.len !== b.len) return a.len > b.len ? -1 : 1;
	if (a.word === b.word) return 0;
	return a.word > b.word ? -1 : 1;
}

function compareRankByGap(a: RankedWord, b: RankedWord): number {
	if (a.gap !== b.gap) return a.gap > b.gap ? -1 : 1;
	if (a.len !== b.len) return a.len > b.len ? -1 : 1;
	if (a.zipf !== b.zipf) return a.zipf < b.zipf ? -1 : 1;
	if (a.word === b.word) return 0;
	return a.word > b.word ? -1 : 1;
}

function compareRankByZipf(a: RankedWord, b: RankedWord): number {
	return compareRank(a, b);
}

function getComparator(sortMode: SortMode) {
	return sortMode === "gap" ? compareRankByGap : compareRankByZipf;
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
	sortMode: SortMode
): QueryRun {
	const pattern = normalizePattern(patternRaw);
	if (!pattern) return { results: [], total: 0 };
	const comparator = getComparator(sortMode);
	const heap = new MinHeap<RankedWord>(comparator);
	const patternMask = computeLetterMask(pattern);
	let total = 0;

	for (let i = 0; i < records.length; i += 1) {
		const record = records[i];
		if (record.len < pattern.length) continue;
		if (procedure === "automaton") {
			if ((patternMask & ~record.mask) !== 0) continue;
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

export function buildBenchmarkPatterns(records: WordRecord[]): string[] {
	const candidates = records.filter((r) => r.len >= 6).map((r) => r.word);
	if (candidates.length === 0) return ["ace", "bake", "cable", "react", "story", "planet"];

	let seed = 1337;
	const nextRand = () => {
		seed ^= seed << 13;
		seed ^= seed >> 17;
		seed ^= seed << 5;
		return Math.abs(seed) / 0x7fffffff;
	};

	const patterns: string[] = [];
	const pickSubsequence = (word: string, len: number) => {
		const indices: number[] = [];
		let prev = -1;
		for (let i = 0; i < len; i += 1) {
			const remaining = len - i - 1;
			const minPos = prev + 1;
			const maxPos = word.length - remaining - 1;
			const choice = Math.floor(minPos + nextRand() * (maxPos - minPos + 1));
			indices.push(choice);
			prev = choice;
		}
		return indices.map((i) => word[i]).join("");
	};

	for (let targetLen = 3; targetLen <= 6; targetLen += 1) {
		for (let i = 0; i < 10; i += 1) {
			const word = candidates[Math.floor(nextRand() * candidates.length)];
			patterns.push(pickSubsequence(word, targetLen));
		}
	}
	return patterns;
}

export function runBenchmark(
	records: WordRecord[],
	patterns: string[],
	options: { warmupIters: number; measuredIters: number; topN: number; procedures: Procedure[] }
): BenchmarkReport {
	const results: ProcedureBenchmark[] = [];
	let best: Procedure = options.procedures[0] ?? "baseline";
	let bestMedian = Number.POSITIVE_INFINITY;

	for (const procedure of options.procedures) {
		for (let i = 0; i < options.warmupIters; i += 1) {
			for (const pattern of patterns) {
				runQuery(records, pattern, options.topN, procedure, "zipf");
			}
		}

		const perQueryTimes: number[] = [];
		const matchCounts: number[] = [];
		for (let i = 0; i < options.measuredIters; i += 1) {
			const start = performance.now();
			let totalMatches = 0;
			for (const pattern of patterns) {
				totalMatches += runQuery(records, pattern, options.topN, procedure, "zipf").total;
			}
			const elapsed = performance.now() - start;
			perQueryTimes.push(elapsed / patterns.length);
			matchCounts.push(totalMatches);
		}

		const avgMsPerQuery = perQueryTimes.reduce((sum, v) => sum + v, 0) / perQueryTimes.length;
		const avgMatches = matchCounts.reduce((sum, v) => sum + v, 0) / matchCounts.length;
		const medianMsPerQuery = median(perQueryTimes);
		const medianMatches = median(matchCounts);

		results.push({
			procedure,
			warmupIters: options.warmupIters,
			measuredIters: options.measuredIters,
			patternCount: patterns.length,
			avgMsPerQuery,
			medianMsPerQuery,
			avgMatches,
			medianMatches,
		});

		if (medianMsPerQuery < bestMedian) {
			bestMedian = medianMsPerQuery;
			best = procedure;
		}
	}

	return { patterns, results, bestProcedure: best };
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid];
	return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function alphabetLetters(): string[] {
	return ALPHABET.split("");
}

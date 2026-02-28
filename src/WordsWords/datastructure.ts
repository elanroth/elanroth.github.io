export type Procedure = "baseline" | "automaton";
export type SortKey = "word" | "zipf" | "gap";
export type SortDirection = "asc" | "desc";

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
	sortDirection: SortDirection
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

export function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function alphabetLetters(): string[] {
	return ALPHABET.split("");
}

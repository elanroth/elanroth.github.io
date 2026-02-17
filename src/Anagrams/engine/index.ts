import { createBanagramsBag, DEFAULT_BANAGRAMS_BAG_SIZE } from "./banagramsBag";
import { haveSameLemma } from "./lemmatizer";

export { getLemma, haveSameLemma } from "./lemmatizer";

export type Tile = string;

export interface PlayerState {
  name: string;
  words: string[];
  score: number;
  joinedAt?: number;
  lastSeen?: number;
  active?: boolean;
}

export interface WordSource {
  playerId: string;
  wordIndex: number;
}

export type LetterCounts = number[];

export type WordInfo = {
  playerId: string;
  wordIndex: number;
  text: string;
  counts: LetterCounts;
  presenceMask: number;
  length: number;
};

export type WordIndex = {
  wordInfos: WordInfo[];
  poolCounts: LetterCounts;
  totalClaimedCounts: LetterCounts;
  wordsWithLetter: number[][];
};

export interface GameState {
  bag: Tile[];
  revealed: Tile[];
  players: Record<string, PlayerState>;
  minWordLength: number;
}

export interface CreateGameOptions {
  players: Record<string, PlayerState> | string[];
  letterBag?: string;
  minWordLength?: number;
  shuffle?: boolean;
}

const DEFAULT_BAG = createBanagramsBag(DEFAULT_BANAGRAMS_BAG_SIZE).join("");

export const normalizeWord = (word: string): string =>
  word.replace(/[^a-z]/gi, "").toUpperCase();

export const wordToLetters = (word: string): Tile[] =>
  normalizeWord(word).split("");

const emptyCounts = (): LetterCounts => Array.from({ length: 26 }, () => 0);

const letterIndex = (letter: string): number => letter.charCodeAt(0) - 65;

export const wordToCounts = (word: string): LetterCounts => {
  const counts = emptyCounts();
  for (const ch of normalizeWord(word)) {
    const idx = letterIndex(ch);
    if (idx >= 0 && idx < 26) counts[idx] += 1;
  }
  return counts;
};

export const tilesToCounts = (tiles: Tile[]): LetterCounts => {
  const counts = emptyCounts();
  for (const tile of tiles) {
    const ch = tile.toUpperCase();
    const idx = letterIndex(ch);
    if (idx >= 0 && idx < 26) counts[idx] += 1;
  }
  return counts;
};

const countsLeq = (a: LetterCounts, b: LetterCounts): boolean => {
  for (let i = 0; i < 26; i += 1) {
    if (a[i] > b[i]) return false;
  }
  return true;
};

const countsAdd = (a: LetterCounts, b: LetterCounts): LetterCounts => {
  const out = emptyCounts();
  for (let i = 0; i < 26; i += 1) out[i] = a[i] + b[i];
  return out;
};

const countsMaxSub = (a: LetterCounts, b: LetterCounts): LetterCounts => {
  const out = emptyCounts();
  for (let i = 0; i < 26; i += 1) out[i] = Math.max(0, a[i] - b[i]);
  return out;
};

const countsSubIfPossible = (a: LetterCounts, b: LetterCounts): { ok: boolean; remaining: LetterCounts } => {
  const out = emptyCounts();
  for (let i = 0; i < 26; i += 1) {
    const diff = a[i] - b[i];
    if (diff < 0) return { ok: false, remaining: emptyCounts() };
    out[i] = diff;
  }
  return { ok: true, remaining: out };
};

const countsAnyPositive = (a: LetterCounts): boolean => a.some((v) => v > 0);

const countsPresenceMask = (counts: LetterCounts): number => {
  let mask = 0;
  for (let i = 0; i < 26; i += 1) {
    if (counts[i] > 0) mask |= 1 << i;
  }
  return mask;
};

export const createLetterBag = (letters: string = DEFAULT_BAG): Tile[] =>
  letters.replace(/[^a-z]/gi, "").toUpperCase().split("");

export const buildWordIndex = (state: GameState): WordIndex => {
  const wordInfos: WordInfo[] = [];
  const wordsWithLetter: number[][] = Array.from({ length: 26 }, () => []);
  const poolCounts = tilesToCounts(state.revealed);
  let totalClaimedCounts = emptyCounts();

  Object.entries(state.players ?? {}).forEach(([playerId, player]) => {
    const words = Array.isArray(player?.words) ? player.words : [];
    words.forEach((text, wordIndex) => {
      const counts = wordToCounts(text);
      const presenceMask = countsPresenceMask(counts);
      const info: WordInfo = {
        playerId,
        wordIndex,
        text,
        counts,
        presenceMask,
        length: text.length,
      };
      const infoIndex = wordInfos.length;
      wordInfos.push(info);
      totalClaimedCounts = countsAdd(totalClaimedCounts, counts);
      for (let i = 0; i < 26; i += 1) {
        if (counts[i] > 0) wordsWithLetter[i].push(infoIndex);
      }
    });
  });

  return { wordInfos, poolCounts, totalClaimedCounts, wordsWithLetter };
};

export const validateSnatch = (
  state: GameState,
  targetWord: string,
  sources: WordSource[],
): { ok: boolean; reason?: string } => {
  const normalized = normalizeWord(targetWord);
  if (normalized.length < state.minWordLength) {
    return { ok: false, reason: `Word must be at least ${state.minWordLength} letters.` };
  }
  if (sources.length === 0) {
    return { ok: false, reason: "Snatch requires at least one source word." };
  }

  const safePlayers = normalizePlayers(state.players);
  const sourceWords = sources
    .map((s) => safePlayers[s.playerId]?.words[s.wordIndex])
    .filter(Boolean) as string[];

  if (sourceWords.length !== sources.length) {
    return { ok: false, reason: "Invalid snatch selection." };
  }

  const targetCounts = wordToCounts(normalized);
  const sourceCounts = sourceWords.reduce((acc, w) => countsAdd(acc, wordToCounts(w)), emptyCounts());
  console.debug("[anagrams] validateSnatch:counts", {
    target: normalized,
    sourceWords,
    targetCounts,
    sourceCounts,
  });
  const sub = countsSubIfPossible(targetCounts, sourceCounts);
  if (!sub.ok) {
    return { ok: false, reason: "New word must include all letters from snatched words." };
  }
  if (!countsAnyPositive(sub.remaining)) {
    return { ok: false, reason: "Snatch must add at least one extra tile." };
  }
  if (!countsLeq(sub.remaining, tilesToCounts(state.revealed))) {
    return { ok: false, reason: "Missing extra tiles for snatch." };
  }
  return { ok: true };
};

export const findSnatchSources = (
  state: GameState,
  targetWord: string,
): { ok: boolean; reason?: string; sources?: WordSource[] } => {
  const normalized = normalizeWord(targetWord);
  if (normalized.length < state.minWordLength) {
    return { ok: false, reason: `Word must be at least ${state.minWordLength} letters.` };
  }

  const targetCounts = wordToCounts(normalized);
  const { wordInfos, poolCounts, totalClaimedCounts, wordsWithLetter } = buildWordIndex(state);

  for (let i = 0; i < 26; i += 1) {
    if (targetCounts[i] > poolCounts[i] + totalClaimedCounts[i]) {
      return { ok: false, reason: "Missing extra tiles for snatch." };
    }
  }

  const requiredFromWords = countsMaxSub(targetCounts, poolCounts);
  const feasibleWordIndices = wordInfos
    .map((info, idx) => ({ info, idx }))
    .filter(({ info }) => countsLeq(info.counts, targetCounts))
    .map(({ idx }) => idx);

  if (feasibleWordIndices.length === 0) {
    return { ok: false, reason: "No words available to snatch." };
  }

  const candidatesByIndex = new Set(feasibleWordIndices);
  const remainingRequiredInit = requiredFromWords;

  const candidateSetForLetter = (letterIndexValue: number): number[] =>
    wordsWithLetter[letterIndexValue].filter((idx) => candidatesByIndex.has(idx));

  const totalNeedLetters = requiredFromWords.reduce((sum, v) => sum + v, 0);
  const maxDepth = Math.min(8, Math.max(1, totalNeedLetters));

  const dfs = (
    startCounts: LetterCounts,
    remainingRequired: LetterCounts,
    chosen: number[],
    depth: number,
  ): number[] | null => {
    const done = !countsAnyPositive(remainingRequired);
    if (done) {
      if (chosen.length === 0) return null;
      const sub = countsSubIfPossible(targetCounts, startCounts);
      if (!sub.ok) return null;
      if (!countsAnyPositive(sub.remaining)) return null;
      if (!countsLeq(sub.remaining, poolCounts)) return null;
      return chosen;
    }

    if (depth >= maxDepth) return null;

    let bestLetter = -1;
    let bestCandidates: number[] = [];
    for (let i = 0; i < 26; i += 1) {
      if (remainingRequired[i] <= 0) continue;
      const cand = candidateSetForLetter(i);
      if (cand.length === 0) return null;
      if (bestLetter === -1 || cand.length < bestCandidates.length) {
        bestLetter = i;
        bestCandidates = cand;
      }
    }

    const scored = bestCandidates
      .map((idx) => ({ idx, info: wordInfos[idx] }))
      .map(({ idx, info }) => ({
        idx,
        score: countsMaxSub(remainingRequired, info.counts).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => a.score - b.score);

    for (const { idx } of scored) {
      if (chosen.includes(idx)) continue;
      const info = wordInfos[idx];
      const nextCounts = countsAdd(startCounts, info.counts);
      if (!countsLeq(nextCounts, targetCounts)) continue;
      const nextRemaining = countsMaxSub(remainingRequired, info.counts);
      const result = dfs(nextCounts, nextRemaining, [...chosen, idx], depth + 1);
      if (result) return result;
    }

    return null;
  };

  const result = dfs(emptyCounts(), remainingRequiredInit, [], 0);
  if (!result) {
    return { ok: false, reason: "No valid snatch sources." };
  }

  const sources = result.map((idx) => ({
    playerId: wordInfos[idx].playerId,
    wordIndex: wordInfos[idx].wordIndex,
  }));

  return { ok: true, sources };
};

export const findSnatchSourceOptions = (
  state: GameState,
  targetWord: string,
  maxOptions: number = 2,
): { ok: boolean; reason?: string; options?: WordSource[][] } => {
  const normalized = normalizeWord(targetWord);
  if (normalized.length < state.minWordLength) {
    return { ok: false, reason: `Word must be at least ${state.minWordLength} letters.` };
  }

  const targetCounts = wordToCounts(normalized);
  const { wordInfos, poolCounts, totalClaimedCounts, wordsWithLetter } = buildWordIndex(state);

  for (let i = 0; i < 26; i += 1) {
    if (targetCounts[i] > poolCounts[i] + totalClaimedCounts[i]) {
      return { ok: false, reason: "Missing extra tiles for snatch." };
    }
  }

  const requiredFromWords = countsMaxSub(targetCounts, poolCounts);
  const feasibleWordIndices = wordInfos
    .map((info, idx) => ({ info, idx }))
    .filter(({ info }) => countsLeq(info.counts, targetCounts))
    .map(({ idx }) => idx);

  if (feasibleWordIndices.length === 0) {
    return { ok: false, reason: "No words available to snatch." };
  }

  const candidatesByIndex = new Set(feasibleWordIndices);

  const candidateSetForLetter = (letterIndexValue: number): number[] =>
    wordsWithLetter[letterIndexValue].filter((idx) => candidatesByIndex.has(idx));

  const totalNeedLetters = requiredFromWords.reduce((sum, v) => sum + v, 0);
  const maxDepth = Math.min(8, Math.max(1, totalNeedLetters));

  const results: number[][] = [];

  const dfs = (
    startCounts: LetterCounts,
    remainingRequired: LetterCounts,
    chosen: number[],
    depth: number,
  ): void => {
    if (results.length >= maxOptions) return;

    const done = !countsAnyPositive(remainingRequired);
    if (done) {
      if (chosen.length === 0) return;
      const sub = countsSubIfPossible(targetCounts, startCounts);
      if (!sub.ok) return;
      if (!countsAnyPositive(sub.remaining)) return;
      if (!countsLeq(sub.remaining, poolCounts)) return;
      results.push(chosen);
      return;
    }

    if (depth >= maxDepth) return;

    let bestLetter = -1;
    let bestCandidates: number[] = [];
    for (let i = 0; i < 26; i += 1) {
      if (remainingRequired[i] <= 0) continue;
      const cand = candidateSetForLetter(i);
      if (cand.length === 0) return;
      if (bestLetter === -1 || cand.length < bestCandidates.length) {
        bestLetter = i;
        bestCandidates = cand;
      }
    }

    const scored = bestCandidates
      .map((idx) => ({ idx, info: wordInfos[idx] }))
      .map(({ idx, info }) => ({
        idx,
        score: countsMaxSub(remainingRequired, info.counts).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => a.score - b.score);

    for (const { idx } of scored) {
      if (chosen.includes(idx)) continue;
      const info = wordInfos[idx];
      const nextCounts = countsAdd(startCounts, info.counts);
      if (!countsLeq(nextCounts, targetCounts)) continue;
      const nextRemaining = countsMaxSub(remainingRequired, info.counts);
      dfs(nextCounts, nextRemaining, [...chosen, idx], depth + 1);
      if (results.length >= maxOptions) return;
    }
  };

  dfs(emptyCounts(), requiredFromWords, [], 0);

  if (results.length === 0) {
    return { ok: false, reason: "No valid snatch sources." };
  }

  const options = results.map((result) =>
    result.map((idx) => ({
      playerId: wordInfos[idx].playerId,
      wordIndex: wordInfos[idx].wordIndex,
    })),
  );

  return { ok: true, options };
};

const shuffleTiles = (tiles: Tile[]): Tile[] => {
  const result = [...tiles];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const removeLetters = (pool: Tile[], letters: Tile[]): Tile[] => {
  const remaining = [...pool];
  for (const letter of letters) {
    const index = remaining.indexOf(letter);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }
  return remaining;
};

const canCoverLetters = (pool: Tile[], letters: Tile[]): boolean => {
  if (letters.length === 0) return false;
  const counts = new Map<Tile, number>();
  for (const letter of pool) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  for (const letter of letters) {
    const remaining = (counts.get(letter) ?? 0) - 1;
    if (remaining < 0) return false;
    counts.set(letter, remaining);
  }
  return true;
};

const subtractLetters = (source: Tile[], remove: Tile[]): { ok: boolean; remaining: Tile[] } => {
  const counts = new Map<Tile, number>();
  for (const letter of source) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  for (const letter of remove) {
    const next = (counts.get(letter) ?? 0) - 1;
    if (next < 0) return { ok: false, remaining: [] };
    counts.set(letter, next);
  }
  const remaining: Tile[] = [];
  for (const [letter, count] of counts.entries()) {
    for (let i = 0; i < count; i += 1) remaining.push(letter);
  }
  return { ok: true, remaining };
};

export const canFormWord = (pool: Tile[], word: string): boolean => {
  const letters = wordToLetters(word);
  return canCoverLetters(pool, letters);
};

export const scoreWord = (word: string): number => wordToLetters(word).length;

export const createGame = ({
  players,
  letterBag = DEFAULT_BAG,
  minWordLength = 3,
  shuffle = true,
}: CreateGameOptions): GameState => ({
  bag: shuffle ? shuffleTiles(createLetterBag(letterBag)) : createLetterBag(letterBag),
  revealed: [],
  players: Array.isArray(players)
    ? players.reduce((acc, name, idx) => {
      acc[`player-${idx}`] = { name, words: [], score: 0, active: true };
      return acc;
    }, {} as Record<string, PlayerState>)
    : Object.entries(players ?? {}).reduce((acc, [playerId, player]) => {
      acc[playerId] = {
        name: player.name,
        words: Array.isArray(player.words) ? player.words : [],
        score: Array.isArray(player.words) ? player.words.reduce((sum, w) => sum + scoreWord(w), 0) : 0,
        joinedAt: player.joinedAt,
        lastSeen: player.lastSeen,
        active: player.active ?? true,
      };
      return acc;
    }, {} as Record<string, PlayerState>),
  minWordLength,
});

const normalizePlayers = (players: Record<string, PlayerState>): Record<string, PlayerState> =>
  Object.entries(players ?? {}).reduce((acc, [playerId, player]) => {
    acc[playerId] = {
      name: player.name,
      words: Array.isArray(player.words) ? player.words : [],
      score: Array.isArray(player.words) ? player.words.reduce((sum, w) => sum + scoreWord(w), 0) : 0,
      joinedAt: player.joinedAt,
      lastSeen: player.lastSeen,
      active: player.active ?? true,
    };
    return acc;
  }, {} as Record<string, PlayerState>);

export const drawTile = (state: GameState): { state: GameState; tile: Tile | null } => {
  if (state.bag.length === 0) {
    return { state, tile: null };
  }
  const [tile, ...rest] = state.bag;
  return {
    state: { ...state, bag: rest, revealed: [...state.revealed, tile] },
    tile,
  };
};

export const claimWord = (
  state: GameState,
  playerId: string,
  word: string,
  sources: WordSource[] = [],
  dictionary?: Set<string> | null,
): { state: GameState; ok: boolean; reason?: string } => {
  const safePlayers = normalizePlayers(state.players);
  const normalized = normalizeWord(word);
  console.debug("[anagrams] claimWord:start", {
    playerId,
    word,
    normalized,
    sources,
    revealed: state.revealed,
    players: Object.values(safePlayers).map((p) => ({ name: p.name, words: p.words })),
  });
  if (normalized.length < state.minWordLength) {
    console.debug("[anagrams] claimWord:fail:minLength", { normalized, minWordLength: state.minWordLength });
    return { state, ok: false, reason: `Word must be at least ${state.minWordLength} letters.` };
  }
  if (!safePlayers[playerId]) {
    console.debug("[anagrams] claimWord:fail:unknownPlayer", { playerId });
    return { state, ok: false, reason: "Unknown player." };
  }

  if (dictionary && dictionary.size > 0 && !dictionary.has(normalized)) {
    console.debug("[anagrams] claimWord:fail:notInDictionary", { normalized });
    return { state, ok: false, reason: "Not in dictionary." };
  }

  const letters = wordToLetters(normalized);
  const sourceList = sources
    .map((source) => ({
      ...source,
      word: safePlayers[source.playerId]?.words[source.wordIndex],
    }))
    .filter((source) => source.word);

  if (sources.length > 0 && sourceList.length !== sources.length) {
    console.debug("[anagrams] claimWord:fail:invalidSources", { sources, sourceList });
    return { state, ok: false, reason: "Invalid snatch selection." };
  }

  if (sourceList.length === 0) {
    if (!canFormWord(state.revealed, normalized)) {
      console.debug("[anagrams] claimWord:fail:poolMissing", { normalized, revealed: state.revealed });
      return { state, ok: false, reason: "Word cannot be formed from revealed tiles." };
    }

    const updatedPlayers = Object.entries(safePlayers).reduce((acc, [id, player]) => {
      if (id !== playerId) {
        acc[id] = player;
        return acc;
      }
      const updatedWords = [...player.words, normalized];
      acc[id] = {
        ...player,
        words: updatedWords,
        score: updatedWords.reduce((sum, w) => sum + scoreWord(w), 0),
      };
      return acc;
    }, {} as Record<string, PlayerState>);

    const nextState = {
      state: {
        ...state,
        revealed: removeLetters(state.revealed, letters),
        players: updatedPlayers,
      },
      ok: true,
    };
    console.debug("[anagrams] claimWord:success:pool", nextState);
    return nextState;
  }

  const sourceLetters = sourceList.flatMap((source) => wordToLetters(source.word as string));
  if (sourceList.some((source) => haveSameLemma(normalized, source.word as string))) {
    console.debug("[anagrams] claimWord:fail:inflection", { normalized, sourceList });
    return { state, ok: false, reason: "Snatch cannot be an inflectional variant of a source word." };
  }
  const subtraction = subtractLetters(letters, sourceLetters);
  console.debug("[anagrams] claimWord:snatch:counts", {
    target: normalized,
    targetLetters: letters,
    sourceLetters,
    subtraction,
  });
  if (!subtraction.ok) {
    console.debug("[anagrams] claimWord:fail:missingSourceLetters", { letters, sourceLetters });
    return { state, ok: false, reason: "New word must include all letters from snatched words." };
  }

  if (subtraction.remaining.length === 0) {
    console.debug("[anagrams] claimWord:fail:noExtraTiles", { letters, sourceLetters });
    return { state, ok: false, reason: "Snatch must add at least one extra tile." };
  }

  if (!canCoverLetters(state.revealed, subtraction.remaining)) {
    console.debug("[anagrams] claimWord:fail:missingExtraTiles", { remaining: subtraction.remaining, revealed: state.revealed });
    return { state, ok: false, reason: "Missing extra tiles for snatch." };
  }

  const updatedPlayers = Object.entries(safePlayers).reduce((acc, [id, player]) => {
    const removing = sourceList
      .filter((source) => source.playerId === id)
      .map((source) => source.wordIndex)
      .sort((a, b) => b - a);

    let nextWords = [...player.words];
    for (const wordIndex of removing) {
      nextWords.splice(wordIndex, 1);
    }

    if (id === playerId) {
      nextWords = [...nextWords, normalized];
    }

    acc[id] = {
      ...player,
      words: nextWords,
      score: nextWords.reduce((sum, w) => sum + scoreWord(w), 0),
    };
    return acc;
  }, {} as Record<string, PlayerState>);

  const nextState = {
    state: {
      ...state,
      revealed: removeLetters(state.revealed, subtraction.remaining),
      players: updatedPlayers,
    },
    ok: true,
  };
  console.debug("[anagrams] claimWord:success:snatch", nextState);
  return nextState;
};

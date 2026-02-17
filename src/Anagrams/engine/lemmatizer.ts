import lemmatize from "wink-lemmatizer";

const lemmaCache = new Map<string, string>();

const normalizeLemmaInput = (word: string): string => word.replace(/[^a-z]/gi, "").toLowerCase();

const pickLemma = (word: string): string => {
  const normalized = normalizeLemmaInput(word);
  if (!normalized) return "";

  const cached = lemmaCache.get(normalized);
  if (cached) return cached;

  // wink-lemmatizer provides rule + exception based lemmas for common POS (noun/verb/adj/adv).
  // We do not have part-of-speech tags in gameplay, so we compute all candidates and choose the
  // shortest lemma as a deterministic proxy for the base form. This blocks purely inflectional
  // variants (plural, tense, comparative) while keeping derivational changes distinct.
  const adverb = typeof lemmatize.adverb === "function" ? lemmatize.adverb(normalized) : "";
  const candidates = [
    lemmatize.verb(normalized),
    lemmatize.noun(normalized),
    lemmatize.adjective(normalized),
    adverb,
    normalized,
  ].filter(Boolean);

  let best = candidates[0] ?? normalized;
  for (const candidate of candidates) {
    if (candidate.length < best.length) {
      best = candidate;
      continue;
    }
    if (candidate.length === best.length && candidate < best) {
      best = candidate;
    }
  }

  lemmaCache.set(normalized, best);
  return best;
};

export const getLemma = (word: string): string => pickLemma(word);

export const haveSameLemma = (wordA: string, wordB: string): boolean => {
  const lemmaA = getLemma(wordA);
  const lemmaB = getLemma(wordB);
  return Boolean(lemmaA) && lemmaA === lemmaB;
};

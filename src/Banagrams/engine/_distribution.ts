// Letter distribution for Bananagrams (from Wikipedia)
// Source: https://en.wikipedia.org/wiki/Bananagrams

// Presets for bag sizes. 144 = full Bananagrams; smaller are proportional (rounded, then adjusted to exact total).
type Dist = Record<string, number>;

const FULL_144: Dist = {
  A: 13, B: 3, C: 3, D: 6, E: 18, F: 3, G: 4, H: 3, I: 12, J: 2, K: 2, L: 5, M: 3,
  N: 8, O: 11, P: 3, Q: 2, R: 9, S: 6, T: 9, U: 6, V: 3, W: 3, X: 2, Y: 3, Z: 2,
};

function scaleTo(total: number): Dist {
  const letters = Object.keys(FULL_144) as Array<keyof typeof FULL_144>;
  const fullTotal = letters.reduce((s, k) => s + FULL_144[k], 0);
  const scaled: Dist = {};
  let running = 0;
  letters.forEach((k) => {
    const raw = (FULL_144[k] / fullTotal) * total;
    const n = Math.max(0, Math.round(raw));
    scaled[k] = n;
    running += n;
  });
  // Adjust to exact total by trimming/adding to most common letters
  const commonOrder = ["E", "A", "I", "O", "T", "N", "S", "R", "L", "H", "D", "C", "U", "M", "P", "G", "B", "F", "Y", "K", "V", "W", "X", "Z", "J", "Q"] as const;
  let idx = 0;
  while (running > total && idx < commonOrder.length) {
    const k = commonOrder[idx];
    if (scaled[k] > 0) { scaled[k] -= 1; running -= 1; }
    else idx++;
  }
  idx = 0;
  while (running < total && idx < commonOrder.length) {
    const k = commonOrder[idx];
    scaled[k] += 1; running += 1;
    idx++;
  }
  return scaled;
}

export const DISTRIBUTIONS: Record<40 | 60 | 100 | 144, Dist> = {
  40: scaleTo(40),
  60: scaleTo(60),
  100: scaleTo(100),
  144: FULL_144,
};

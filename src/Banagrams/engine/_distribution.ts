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

  const base: Dist = {};
  const remainder: Record<string, number> = {};
  let running = 0;

  // Start with floored proportional counts so we never overshoot.
  for (const k of letters) {
    const raw = (FULL_144[k] / fullTotal) * total;
    const n = Math.max(0, Math.floor(raw));
    base[k] = n;
    remainder[k] = raw - n;
    running += n;
  }

  let scaled: Dist = { ...base };

  if (running < total) {
    // Distribute remaining tiles to the largest remainders (ties go to more frequent letters).
    const order = [...letters].sort((a, b) => {
      const diff = remainder[b] - remainder[a];
      if (Math.abs(diff) > 1e-6) return diff;
      return FULL_144[b] - FULL_144[a];
    });
    let need = total - running;
    for (const k of order) {
      if (need <= 0) break;
      scaled[k] += 1;
      need -= 1;
    }
  } else if (running > total) {
    // Rare case due to floating point: trim smallest remainders first.
    const order = [...letters].sort((a, b) => {
      const diff = remainder[a] - remainder[b];
      if (Math.abs(diff) > 1e-6) return diff;
      return FULL_144[a] - FULL_144[b];
    });
    let extra = running - total;
    for (const k of order) {
      if (extra <= 0) break;
      if (scaled[k] > 0) {
        scaled[k] -= 1;
        extra -= 1;
      }
    }
  }

  return scaled;
}

export const DISTRIBUTIONS: Record<8 | 40 | 60 | 100 | 144, Dist> = {
  8: { A: 8 },
  40: scaleTo(40),
  60: scaleTo(60),
  100: scaleTo(100),
  144: FULL_144,
};

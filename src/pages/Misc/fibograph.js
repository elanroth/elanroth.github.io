/**
 * Utilities to build and walk the directed graph defined by the Fibonacci-like
 * recurrence (x,y) -> (y, x+y (mod n)).
 *
 * Exported functions:
 * - nextPair(pair, n)
 * - pairKey(pair)
 * - keyToPair(key)
 * - buildGraph(n)  // returns Map key->nextKey for all n^2 possible pairs
 * - findCycleFrom(startPair, n) // returns { tail, cycle, sequence }
 * - fiboWalk(startPair, n, steps)
 *
 * Notes:
 * - The graph has at most n^2 vertices (ordered pairs modulo n). Each vertex
 *   has out-degree 1 (functional graph). findCycleFrom returns the pre-period
 *   (tail) and the eventual cycle starting from the first repeated node.
 * - This module is kept side-effect free (it does not run examples on import).
 */

// Helpers
export function pairKey([a, b]) {
  return `${a},${b}`;
}

export function keyToPair(key) {
  const [a, b] = key.split(',').map(Number);
  return [a, b];
}

export function nextPair([a, b], n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('n must be a positive integer');
  }
  const x = ((a % n) + n) % n;
  const y = ((b % n) + n) % n;
  const next = (x + y) % n;
  return [y, next];
}

/**
 * Build the full functional graph mapping for modulus n.
 * Returns a Map from key -> nextKey for all ordered pairs (0..n-1)^2.
 */
export function buildGraph(n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('n must be a positive integer');
  }
  const map = new Map();
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const k = pairKey([a, b]);
      const nk = pairKey(nextPair([a, b], n));
      map.set(k, nk);
    }
  }
  return map;
}

/**
 * Find the tail and cycle when iterating the map from startPair under modulus n.
 * Returns an object { tail, cycle, sequence } where:
 * - sequence is the sequence of visited pairs up to the first repeated node (inclusive of the repeated node)
 * - tail is the sequence of pairs before the cycle starts
 * - cycle is the repeating cycle as an array of pairs
 *
 * Example: starting from a node that goes A -> B -> C -> D -> B ...
 * - tail = [A]
 * - cycle = [B, C, D]
 */
export function findCycleFrom(startPair, n) {
  if (!Array.isArray(startPair) || startPair.length < 2) {
    throw new Error('startPair must be an array [a,b]');
  }
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('n must be a positive integer');
  }

  const seen = new Map(); // key -> index in seq
  const seq = [];

        return hull;
}

      // End of fibograph.js

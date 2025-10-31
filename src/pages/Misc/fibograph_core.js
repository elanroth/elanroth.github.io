// Clean, side-effect-free utilities for fibograph visualizer
export function pairKey([a, b]) {
  return `${a},${b}`;
}

export function nextPair([a, b], n) {
  const x = ((a % n) + n) % n;
  const y = ((b % n) + n) % n;
  return [y, (x + y) % n];
}

export function findCycleFrom(startPair, n) {
  if (!Array.isArray(startPair) || startPair.length < 2) {
    throw new Error('startPair must be [a,b]');
  }
  const seen = new Map();
  const seq = [];
  let cur = [((startPair[0] % n) + n) % n, ((startPair[1] % n) + n) % n];
  while (true) {
    const k = pairKey(cur);
    if (seen.has(k)) {
      const first = seen.get(k);
      const tail = seq.slice(0, first);
      const cycle = seq.slice(first);
      return { tail, cycle, sequence: seq };
    }
    seen.set(k, seq.length);
    seq.push(cur.slice());
    cur = nextPair(cur, n);
  }
}

// Jarvis March (gift wrapping) convex hull for 2D points
export function jarvisMarch(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length < 3) return points.slice();

  function orient(a, b, c) {
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  }

  // find leftmost
  let left = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < points[left][0] || (points[i][0] === points[left][0] && points[i][1] < points[left][1])) left = i;
  }

  const hull = [];
  let p = left;
  do {
    hull.push(points[p]);
    let q = (p + 1) % points.length;
    for (let i = 0; i < points.length; i++) {
      if (orient(points[p], points[i], points[q]) > 0) q = i;
    }
    p = q;
  } while (p !== left);
  return hull;
}

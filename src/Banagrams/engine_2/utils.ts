import { DISTRIBUTION } from './_distribution';

// Fisher-Yates shuffle
export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createBag(): string[] {
  const bag: string[] = [];
  for (const [letter, count] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  return bag;
}

export function drawFromBag(bag: string[], count = 1): { tiles: string[]; bag: string[] } {
  const taken = bag.slice(0, count);
  const remaining = bag.slice(count);
  return { tiles: taken, bag: remaining };
}

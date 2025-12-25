import { DISTRIBUTIONS } from './_distribution';
import type { GameOptions } from './types';

// Fisher-Yates shuffle
export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const DEFAULT_OPTIONS: GameOptions = {
  minLength: 3,
  bagSize: 60,
  startingHand: 20,
  timed: false,
};

export function createBag(options?: Partial<GameOptions>): string[] {
  const size = (options?.bagSize ?? DEFAULT_OPTIONS.bagSize) as 40 | 60 | 100 | 144;
  const dist = DISTRIBUTIONS[size] ?? DISTRIBUTIONS[DEFAULT_OPTIONS.bagSize];
  const bag: string[] = [];
  for (const [letter, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  return bag;
}

export function drawFromBag(bag: string[], count = 1): { tiles: string[]; bag: string[] } {
  const taken = bag.slice(0, count);
  const remaining = bag.slice(count);
  return { tiles: taken, bag: remaining };
}

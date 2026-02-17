import { DISTRIBUTIONS } from "./banagramsDistribution";

export const DEFAULT_BANAGRAMS_BAG_SIZE = 60;

export function createBanagramsBag(size: number = DEFAULT_BANAGRAMS_BAG_SIZE): string[] {
  const dist = DISTRIBUTIONS[size] ?? DISTRIBUTIONS[DEFAULT_BANAGRAMS_BAG_SIZE];
  const bag: string[] = [];
  for (const [letter, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i += 1) bag.push(letter);
  }
  return bag;
}

export function shuffleTiles<T>(tiles: T[]): T[] {
  const result = [...tiles];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

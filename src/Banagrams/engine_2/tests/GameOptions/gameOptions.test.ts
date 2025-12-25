import { describe, it, expect } from "vitest";
import { createBag, DEFAULT_OPTIONS } from "../../utils";
import { reducer } from "../../reducer";
import type { GameState } from "../../types";
import { DISTRIBUTIONS } from "../../_distribution";

// helper to build a minimal valid GameState for reducer tests
function makeState(): GameState {
  return {
    selfId: "me",
    gameId: "g1",
    tiles: {},
    rack: [],
    selection: {},
    drag: { kind: "none" },
    bag: [],
    players: {},
    status: { phase: "active" },
    options: { ...DEFAULT_OPTIONS },
    dictionary: { status: "unloaded", words: null },
    requests: {},
    remoteBoards: {},
  };
}

describe("DEFAULT_OPTIONS", () => {
  it("matches expected defaults", () => {
    expect(DEFAULT_OPTIONS).toEqual({ minLength: 3, bagSize: 60, startingHand: 20, timed: false });
  });
});

describe("createBag", () => {
  const sizes: Array<40 | 60 | 100 | 144> = [40, 60, 100, 144];

  sizes.forEach((size) => {
    it(`builds a bag matching the ${size}-tile distribution`, () => {
      const bag = createBag({ bagSize: size });
      const expectedLength = Object.values(DISTRIBUTIONS[size]).reduce((sum, n) => sum + n, 0);
      expect(bag).toHaveLength(expectedLength);
      expect(expectedLength).toBe(size);
    });
  });

  it("falls back to default distribution when given an unknown size", () => {
    const bag = createBag({ bagSize: 999 as any });
    const defaultLength = Object.values(DISTRIBUTIONS[DEFAULT_OPTIONS.bagSize as 40 | 60 | 100 | 144]).reduce((sum, n) => sum + n, 0);
    expect(bag).toHaveLength(defaultLength);
  });
});

describe("reducer OPTIONS_SET", () => {
  it("merges partial options without touching other state", () => {
    const base = makeState();
    const next = reducer(base, { type: "OPTIONS_SET", options: { minLength: 2, bagSize: 100, startingHand: 25 } });
    expect(next.options.minLength).toBe(2);
    expect(next.options.bagSize).toBe(100);
    expect(next.options.startingHand).toBe(25);
    expect(next.status).toBe(base.status);
    expect(next.players).toBe(base.players);
  });
});

import { describe, it, expect } from "vitest";
import { reducer } from "../../reducer";
import { DEFAULT_OPTIONS, drawFromBag, shuffleArray } from "../../utils";
import type { GameState, RemoteBoard, TilesById } from "../../types";

function makeTile(id: string, owner: string) {
  return { id, letter: id.toUpperCase(), pos: { x: 0, y: 0 }, location: "board" as const, owner };
}

function baseState(): GameState {
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

describe("REMOTE_BOARDS_MERGE", () => {
  it("drops self board and keeps others with rack", () => {
    const state = baseState();
    const boards: Record<string, RemoteBoard> = {
      me: { tiles: { a: makeTile("a", "me") } as TilesById, rack: ["a"] },
      other: { tiles: { b: makeTile("b", "other") } as TilesById, rack: ["b"] },
    };
    const next = reducer(state, { type: "REMOTE_BOARDS_MERGE", boards });
    expect(next.remoteBoards.me).toBeUndefined();
    expect(next.remoteBoards.other?.rack).toEqual(["b"]);
    expect(Object.keys(next.remoteBoards)).toEqual(["other"]);
  });

  it("overwrites previous remote board entries", () => {
    const state = { ...baseState(), remoteBoards: { other: { tiles: {}, rack: [] } } } as GameState;
    const next = reducer(state, {
      type: "REMOTE_BOARDS_MERGE",
      boards: { other: { tiles: { c: makeTile("c", "other") } as TilesById, rack: ["c"] } },
    });
    expect(next.remoteBoards.other?.rack).toEqual(["c"]);
    expect(Object.keys(next.remoteBoards.other?.tiles || {})).toEqual(["c"]);
  });
});

describe("drawFromBag", () => {
  it("draws requested count and returns remainder", () => {
    const bag = ["A", "B", "C"];
    const { tiles, bag: rest } = drawFromBag(bag, 2);
    expect(tiles).toEqual(["A", "B"]);
    expect(rest).toEqual(["C"]);
  });

  it("draws only available tiles when count exceeds bag", () => {
    const bag = ["A"];
    const { tiles, bag: rest } = drawFromBag(bag, 3);
    expect(tiles).toEqual(["A"]);
    expect(rest).toEqual([]);
  });
});

describe("shuffleArray", () => {
  it("preserves array length", () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffleArray(arr);
    expect(out).toHaveLength(arr.length);
    expect(new Set(out).size).toBe(arr.length);
  });
});

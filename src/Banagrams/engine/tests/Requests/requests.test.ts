import { describe, expect, it } from "vitest";
import { reducer } from "../../reducer";
import type { GameState, TileState, TilesById } from "../../types";
import { DEFAULT_OPTIONS } from "../../utils";

const baseState = (): GameState => ({
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
});

const makeTile = (id: string, owner: string): TileState => ({
  id,
  letter: id.toUpperCase(),
  pos: { x: 0, y: 0 },
  location: "rack",
  owner,
});

describe("REQUESTS_SET", () => {
  it("replaces request map", () => {
    const state = baseState();
    const next = reducer(state, {
      type: "REQUESTS_SET",
      requests: {
        req1: { id: "req1", from: "p1", want: "E", createdAt: 1, status: "open" },
      },
    });

    expect(Object.keys(next.requests)).toEqual(["req1"]);
    expect(next.requests.req1.want).toBe("E");
  });
});

describe("GIVE_TILE", () => {
  it("removes a rack tile owned by self", () => {
    const tile = makeTile("a", "me");
    const state = {
      ...baseState(),
      tiles: { a: tile } as TilesById,
      rack: ["a"],
      selection: { a: true },
    } as GameState;

    const next = reducer(state, { type: "GIVE_TILE", tileId: "a" });

    expect(next.tiles.a).toBeUndefined();
    expect(next.rack).toEqual([]);
    expect(next.selection.a).toBeUndefined();
  });

  it("does nothing if tile is not in rack or not owned", () => {
    const tile = { ...makeTile("a", "other"), location: "rack" } as TileState;
    const state = {
      ...baseState(),
      tiles: { a: tile } as TilesById,
      rack: ["a"],
    } as GameState;

    const next = reducer(state, { type: "GIVE_TILE", tileId: "a" });

    expect(next.tiles.a).toBeDefined();
    expect(next.rack).toEqual(["a"]);
  });
});

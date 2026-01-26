import { describe, expect, it } from "vitest";
import { canFormWord, claimWord, createGame, drawTile } from "../engine";

describe("anagrams engine", () => {
  it("checks word formation", () => {
    expect(canFormWord(["A", "B", "C"], "cab")).toBe(true);
    expect(canFormWord(["A", "B", "C"], "abba")).toBe(false);
  });

  it("draws tiles from the bag", () => {
    const state = createGame({ players: ["Player 1"], letterBag: "ABC", shuffle: false });
    const { state: nextState, tile } = drawTile(state);

    expect(tile).toBe("A");
    expect(nextState.revealed).toEqual(["A"]);
    expect(nextState.bag).toEqual(["B", "C"]);
  });

  it("claims words using revealed tiles", () => {
    const state = createGame({ players: ["Player 1"], letterBag: "ABC", shuffle: false });
    const revealedState = { ...state, revealed: ["A", "B", "C"] };

    const result = claimWord(revealedState, 0, "cab");

    expect(result.ok).toBe(true);
    expect(result.state.revealed).toEqual([]);
    expect(result.state.players[0].words).toEqual(["CAB"]);
    expect(result.state.players[0].score).toBe(3);
  });

  it("snatches a word using extra tiles", () => {
    const state = createGame({ players: ["Alice", "Bob"], shuffle: false });
    const seeded = {
      ...state,
      revealed: ["S"],
      players: [
        { name: "Alice", words: ["TONE"], score: 4 },
        { name: "Bob", words: [], score: 0 },
      ],
    };

    const result = claimWord(seeded, 1, "stone", [{ playerIndex: 0, wordIndex: 0 }]);

    expect(result.ok).toBe(true);
    expect(result.state.players[0].words).toEqual([]);
    expect(result.state.players[1].words).toEqual(["STONE"]);
    expect(result.state.revealed).toEqual([]);
  });
});

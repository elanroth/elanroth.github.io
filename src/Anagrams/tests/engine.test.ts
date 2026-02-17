import { describe, expect, it } from "vitest";
import { canFormWord, claimWord, createGame, drawTile, haveSameLemma } from "../engine";

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

    const result = claimWord(revealedState, "player-0", "cab");

    expect(result.ok).toBe(true);
    expect(result.state.revealed).toEqual([]);
    expect(result.state.players["player-0"].words).toEqual(["CAB"]);
    expect(result.state.players["player-0"].score).toBe(3);
  });

  it("snatches a word using extra tiles", () => {
    const state = createGame({ players: ["Alice", "Bob"], shuffle: false });
    const seeded = {
      ...state,
      revealed: ["S"],
      players: {
        "player-0": { name: "Alice", words: ["TONE"], score: 4 },
        "player-1": { name: "Bob", words: [], score: 0 },
      },
    };

    const result = claimWord(seeded, "player-1", "stone", [{ playerId: "player-0", wordIndex: 0 }]);

    expect(result.ok).toBe(true);
    expect(result.state.players["player-0"].words).toEqual([]);
    expect(result.state.players["player-1"].words).toEqual(["STONE"]);
    expect(result.state.revealed).toEqual([]);
  });

  it("compares words by lemma", () => {
    expect(haveSameLemma("TONE", "TONES")).toBe(true);
    expect(haveSameLemma("TONE", "TONED")).toBe(true);
    expect(haveSameLemma("TONE", "TONING")).toBe(true);
    expect(haveSameLemma("TONE", "STONE")).toBe(false);
  });
});

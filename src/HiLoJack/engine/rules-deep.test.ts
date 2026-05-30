import { describe, expect, it } from "vitest";
import type { Card, PlayedCard, Rank, Seat, Suit, TrickRecord, Team } from "./types";
import { teamOf } from "./types";
import { legalPlays, rankValue, winnerOfTrick } from "./rules";
import { computeDeltas, scoreHand } from "./scoring";

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const PC = (seat: Seat, suit: Suit, rank: Rank): PlayedCard => ({ seat, card: c(suit, rank) });

// ============================================================================
// legalPlays — exhaustive matrix of follow-suit + trump scenarios
// ============================================================================

describe("legalPlays: deep coverage of follow + trump matrix", () => {
  it("trump LED + I hold trumps → only trumps are legal", () => {
    const hand = [c("S", 5), c("S", 9), c("H", "A"), c("D", "K"), c("C", 2), c("C", 3)];
    const trick = [PC("N", "S", "A")];
    const legal = legalPlays(hand, trick, "S");
    expect(legal).toEqual([c("S", 5), c("S", 9)]);
  });

  it("trump LED + I have no trumps → sluff anything", () => {
    const hand = [c("H", "A"), c("D", "K"), c("D", 2), c("C", 7), c("H", 3), c("C", 4)];
    const trick = [PC("N", "S", "A")];
    const legal = legalPlays(hand, trick, "S");
    expect(legal.length).toBe(6);
  });

  it("non-trump LED + I hold lead suit AND trump → both legal", () => {
    const hand = [c("C", 5), c("C", 9), c("S", "A"), c("S", 2), c("H", 3), c("D", 4)];
    const trick = [PC("N", "C", "A")];
    const legal = legalPlays(hand, trick, "S");
    // Clubs + Spades (trump) are legal; Hearts and Diamonds are not.
    expect(legal).toEqual(
      expect.arrayContaining([c("C", 5), c("C", 9), c("S", "A"), c("S", 2)]),
    );
    expect(legal.length).toBe(4);
  });

  it("non-trump LED + I hold lead suit but NO trump → only lead suit legal", () => {
    const hand = [c("C", 5), c("C", 9), c("H", "A"), c("H", 2), c("D", 3), c("D", 4)];
    const trick = [PC("N", "C", "A")];
    const legal = legalPlays(hand, trick, "S");
    expect(legal).toEqual([c("C", 5), c("C", 9)]);
  });

  it("non-trump LED + I have no lead suit + no trump → sluff anything", () => {
    const hand = [c("H", "A"), c("H", 2), c("D", 3), c("D", 4), c("D", 7), c("H", 9)];
    const trick = [PC("N", "C", "A")];
    const legal = legalPlays(hand, trick, "S");
    expect(legal.length).toBe(6);
  });

  it("HOUSE RULE: non-trump LED + I have no lead suit but DO have trump → sluff anything (trump NOT forced)", () => {
    const hand = [c("S", 5), c("S", 9), c("H", "A"), c("H", 2), c("D", 3), c("D", 7)];
    const trick = [PC("N", "C", "A")];
    const legal = legalPlays(hand, trick, "S");
    // All 6 cards legal — house rule does not force trump here
    expect(legal.length).toBe(6);
  });

  it("empty trick + trump set → full hand legal (any lead allowed)", () => {
    const hand = [c("H", "A"), c("D", 3), c("C", 7), c("S", 8), c("H", 9), c("C", "K")];
    const legal = legalPlays(hand, [], "S");
    expect(legal.length).toBe(6);
  });

  it("empty trick + trump null (opening lead) → full hand legal", () => {
    const hand = [c("H", "A"), c("D", 3), c("C", 7), c("S", 8), c("H", 9), c("C", "K")];
    const legal = legalPlays(hand, [], null);
    expect(legal.length).toBe(6);
  });

  it("singleton hand + trump led + holds the trump → only that one card legal", () => {
    const hand = [c("S", 7)];
    const trick = [PC("N", "S", "A")];
    expect(legalPlays(hand, trick, "S")).toEqual([c("S", 7)]);
  });

  it("singleton hand + non-trump led + holds a non-lead non-trump → that one card legal (sluff)", () => {
    const hand = [c("H", 7)];
    const trick = [PC("N", "C", "A")];
    expect(legalPlays(hand, trick, "S")).toEqual([c("H", 7)]);
  });
});

// ============================================================================
// winnerOfTrick — corner cases
// ============================================================================

describe("winnerOfTrick: corner cases", () => {
  it("all four players play the lead non-trump suit → highest card wins", () => {
    const trick: PlayedCard[] = [
      PC("N", "C", 5),
      PC("E", "C", "J"),
      PC("S", "C", "Q"),
      PC("W", "C", 3),
    ];
    expect(winnerOfTrick(trick, "S")).toBe("S"); // S played Q, highest club
  });

  it("only one trump played + several lead-suit + several off-suit → trump wins regardless of rank", () => {
    // Lead H,A is the highest possible card of lead suit. But a tiny trump beats it.
    const trick: PlayedCard[] = [
      PC("N", "H", "A"),
      PC("E", "H", "K"),
      PC("S", "D", 7),    // sluff (no hearts, no spades — legal)
      PC("W", "S", 2),    // trumped in
    ];
    expect(winnerOfTrick(trick, "S")).toBe("W");
  });

  it("multiple trumps played → highest trump wins", () => {
    const trick: PlayedCard[] = [
      PC("N", "C", "Q"),
      PC("E", "S", 5),
      PC("S", "S", "J"),
      PC("W", "S", 3),
    ];
    expect(winnerOfTrick(trick, "S")).toBe("S"); // S(J) > S(5) > S(3)
  });

  it("nobody played lead suit or trump → highest lead-suit card wins (only the leader's)", () => {
    // (impossible under strict rules but our house rule allows it)
    const trick: PlayedCard[] = [
      PC("N", "C", 5),    // lead
      PC("E", "H", "A"),  // sluff
      PC("S", "D", "K"),  // sluff
      PC("W", "D", 2),    // sluff
    ];
    expect(winnerOfTrick(trick, "S")).toBe("N");
  });

  it("trump is led but only one player follows trump (others sluff)", () => {
    const trick: PlayedCard[] = [
      PC("N", "S", 5),
      PC("E", "S", 9),
      PC("S", "H", 4),    // no spades → sluff
      PC("W", "D", 2),    // no spades → sluff
    ];
    expect(winnerOfTrick(trick, "S")).toBe("E");
  });
});

// ============================================================================
// scoreHand — combinatorial point distribution
// ============================================================================

function trickFor(plays: Array<[Seat, Suit, Rank]>, winner: Seat): TrickRecord {
  return { cards: plays.map(([s, suit, rank]) => PC(s, suit, rank)), winner };
}

describe("scoreHand: who-captured-what across teams", () => {
  it("all 4 points to one team (sweep)", () => {
    const trump: Suit = "S";
    const log: TrickRecord[] = [
      // N wins every trick. Trumps include J (which is the Jack point).
      trickFor([["N", "S", "A"], ["E", "S", 5], ["S", "S", 2], ["W", "S", 3]], "N"),
      trickFor([["N", "S", "K"], ["E", "S", 6], ["S", "S", 7], ["W", "S", 4]], "N"),
      trickFor([["N", "S", "Q"], ["E", "S", "J"], ["S", "S", 9], ["W", "S", 8]], "N"),
      trickFor([["N", "S", 10], ["E", "H", 2], ["S", "H", 3], ["W", "H", 4]], "N"),
      trickFor([["N", "H", "A"], ["E", "H", 5], ["S", "H", 6], ["W", "H", 7]], "N"),
      trickFor([["N", "C", "A"], ["E", "C", 2], ["S", "C", 3], ["W", "C", 4]], "N"),
    ];
    const hp = scoreHand(log, trump);
    expect(hp.high).toBe("NS");
    expect(hp.low).toBe("NS");
    expect(hp.jack).toBe("NS");
    expect(hp.game).toBe("NS");
  });

  it("High goes to the team that captures the trick containing the highest trump played", () => {
    const trump: Suit = "S";
    // S(A) is in the LAST trick, captured by E. So High → EW.
    const log: TrickRecord[] = [
      trickFor([["N", "C", "A"], ["E", "C", 5], ["S", "C", 2], ["W", "C", 3]], "N"),
      trickFor([["N", "C", "K"], ["E", "C", 6], ["S", "C", 4], ["W", "C", 7]], "N"),
      trickFor([["N", "D", "A"], ["E", "D", 5], ["S", "D", 2], ["W", "D", 3]], "N"),
      trickFor([["N", "D", "K"], ["E", "D", 6], ["S", "D", 4], ["W", "D", 7]], "N"),
      trickFor([["N", "H", "A"], ["E", "H", 5], ["S", "H", 2], ["W", "H", 3]], "N"),
      trickFor([["N", "H", "K"], ["E", "S", "A"], ["S", "S", 2], ["W", "S", 3]], "E"),
    ];
    const hp = scoreHand(log, trump);
    expect(hp.high).toBe("EW");
    // Low: S,2 also in the last trick → captured by EW (same trick, same team)
    expect(hp.low).toBe("EW");
  });
});

// Cleaner abstract tests for the delta math (no card-by-card construction):
describe("computeDeltas: full attribution matrix", () => {
  const NS = "NS" as Team;
  const EW = "EW" as Team;

  it("pitcher bids 2, captures 2 (made exactly) → +2 / opp +2 (if opp got 2)", () => {
    const r = computeDeltas({ high: NS, low: NS, jack: EW, game: EW }, NS, 2, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 2, EW: 2 });
  });

  it("pitcher bids 4, captures 3 → fail, -4 / opp earns what they took", () => {
    const r = computeDeltas({ high: NS, low: NS, jack: NS, game: EW }, NS, 4, false);
    expect(r.pitcherMadeBid).toBe(false);
    expect(r.deltas).toEqual({ NS: -4, EW: 1 });
  });

  it("pitcher bids 5, swept all tricks AND all 4 points → +5", () => {
    const r = computeDeltas({ high: NS, low: NS, jack: NS, game: NS }, NS, 5, true);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 5, EW: 0 });
  });

  it("pitcher bids 5, swept tricks but missed Game (which is impossible — sweep means all pip cards too)", () => {
    // Modeled abstractly: if pitcher swept tricks but somehow Game went to opp,
    // the 5-bid logic still uses availability check. This guards the impossible-but-defensive path.
    const r = computeDeltas({ high: NS, low: NS, jack: NS, game: EW }, NS, 5, true);
    expect(r.pitcherMadeBid).toBe(false);
    expect(r.deltas.NS).toBe(-4);
  });

  it("pitcher bids 5 with Jack not dealt (only 3 points available) — succeeds if all 3 + sweep", () => {
    const r = computeDeltas({ high: NS, low: NS, jack: null, game: NS }, NS, 5, true);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 5, EW: 0 });
  });

  it("pitcher bids 5 with Jack not dealt — fails if missing any of the 3 available points", () => {
    const r = computeDeltas({ high: NS, low: NS, jack: null, game: EW }, NS, 5, true);
    expect(r.pitcherMadeBid).toBe(false);
    expect(r.deltas.NS).toBe(-4);
  });

  it("EW is the pitcher, mirror case: all deltas flip", () => {
    const r = computeDeltas({ high: EW, low: NS, jack: EW, game: NS }, EW, 2, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 2, EW: 2 });
  });
});

// ============================================================================
// rankValue sanity
// ============================================================================

describe("rankValue: monotonic", () => {
  it("orders 2 < 3 < … < 10 < J < Q < K < A", () => {
    const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];
    for (let i = 1; i < ranks.length; i++) {
      expect(rankValue(ranks[i])).toBeGreaterThan(rankValue(ranks[i - 1]));
    }
  });
});

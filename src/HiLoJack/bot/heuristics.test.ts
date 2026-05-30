import { describe, expect, it } from "vitest";
import type { Bid, BidAmount, Card, GameState, PlayedCard, Rank, Seat, Suit } from "../engine/types";
import { initialState, reducer } from "../engine/reducer";
import { legalPlays, rankValue } from "../engine/rules";

const PC = (seat: Seat, suit: Suit, rank: Rank): PlayedCard => ({ seat, card: { suit, rank } });
import { nextBotAction, pickAction, pickBid, pickCard, pickTrump } from "./heuristics";

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const SEATS_CW: Seat[] = ["N", "E", "S", "W"];

function seatAll(s: GameState): GameState {
  let st = s;
  for (const seat of SEATS_CW) {
    st = reducer(st, { type: "JOIN_SEAT", seat, uid: `u${seat}`, nickname: seat });
  }
  return st;
}

function craftBidding(opts: {
  turn: Seat;
  dealerSeat: Seat;
  bids?: Partial<Record<Seat, Bid>>;
  hand: Card[];
  forSeat: Seat;
}): GameState {
  let s = initialState("test", 1);
  s = seatAll(s);
  return {
    ...s,
    dealerSeat: opts.dealerSeat,
    hands: { ...s.hands, [opts.forSeat]: opts.hand },
    phase: { kind: "bidding", turn: opts.turn, bids: opts.bids ?? {} },
  };
}

describe("pickBid", () => {
  it("passes on a weak hand", () => {
    const s = craftBidding({
      turn: "N", dealerSeat: "W", forSeat: "N",
      hand: [c("C", 2), c("D", 3), c("H", 4), c("S", 5), c("C", 6), c("D", 7)],
    });
    expect(pickBid(s, "N")).toBe("pass");
  });

  it("bids on a hand with strong suit length and high cards", () => {
    const s = craftBidding({
      turn: "N", dealerSeat: "W", forSeat: "N",
      hand: [c("S", "A"), c("S", "K"), c("S", "Q"), c("S", "J"), c("H", 5), c("D", 3)],
    });
    const bid = pickBid(s, "N");
    expect(bid).not.toBe("pass");
    expect(typeof bid).toBe("number");
  });

  it("dealer-stuck: bids 2 when all three prior passed", () => {
    const s = craftBidding({
      turn: "N", dealerSeat: "N", forSeat: "N",
      bids: { E: "pass", S: "pass", W: "pass" },
      hand: [c("C", 2), c("D", 3), c("H", 4), c("S", 5), c("C", 6), c("D", 7)],
    });
    expect(pickBid(s, "N")).toBe(2);
  });

  it("returns pass when it's not this seat's turn (safety)", () => {
    const s = craftBidding({
      turn: "E", dealerSeat: "W", forSeat: "N",
      hand: [c("S", "A"), c("S", "K"), c("S", "Q"), c("S", "J"), c("H", 5), c("D", 3)],
    });
    expect(pickBid(s, "N")).toBe("pass");
  });
});

describe("pickTrump", () => {
  it("picks the suit with most high cards / length", () => {
    let s = initialState("t", 1);
    s = seatAll(s);
    s = {
      ...s,
      hands: { ...s.hands, N: [c("S", "A"), c("S", "K"), c("S", 9), c("H", 2), c("D", 3), c("C", 4)] },
      phase: {
        kind: "playing", trump: null, pitcher: "N", bid: 2 as BidAmount, handLog: [],
        trick: { leader: "N", winner: null, cards: [] },
      },
    };
    expect(pickTrump(s, "N")).toBe("S");
  });
});

describe("pickCard", () => {
  function craftPlaying(opts: {
    hands: Record<Seat, Card[]>;
    trump: Suit | null;
    leader: Seat;
    played: PlayedCard[];
  }): GameState {
    let s = initialState("t", 1);
    s = seatAll(s);
    return {
      ...s,
      hands: opts.hands,
      phase: {
        kind: "playing",
        trick: { cards: opts.played, leader: opts.leader, winner: null },
        trump: opts.trump,
        pitcher: opts.leader,
        bid: 2,
        handLog: [],
      },
    };
  }

  it("opening lead (trump=null): plays the HIGHEST card of the strongest suit (sets trump)", () => {
    const s = craftPlaying({
      hands: {
        N: [c("S", "A"), c("S", "K"), c("S", 9), c("D", 4), c("H", 2), c("C", 3)],
        E: [], S: [], W: [],
      },
      trump: null, leader: "N", played: [],
    });
    const pick = pickCard(s, "N");
    // Spades is strongest. Highest spade is A.
    expect(pick).toEqual(c("S", "A"));
  });

  it("leading (trump set, holds trumps): plays the HIGHEST trump (pulls trumps)", () => {
    const s = craftPlaying({
      hands: {
        N: [c("S", "A"), c("S", 5), c("D", 9), c("C", "K"), c("H", 2), c("H", "A")],
        E: [], S: [], W: [],
      },
      trump: "S", leader: "N", played: [],
    });
    const pick = pickCard(s, "N");
    // Highest trump available is S,A
    expect(pick).toEqual(c("S", "A"));
  });

  it("leading (trump set, no trumps in hand): plays the LOWEST non-trump", () => {
    const s = craftPlaying({
      hands: {
        N: [c("D", 5), c("D", 9), c("C", "K"), c("H", 2), c("H", "A"), c("C", 4)],
        E: [], S: [], W: [],
      },
      trump: "S", leader: "N", played: [],
    });
    const pick = pickCard(s, "N");
    expect(pick).toEqual(c("H", 2));
  });

  it("following + opponent winning: tries to beat with lowest winning card", () => {
    const s = craftPlaying({
      hands: {
        N: [], E: [c("C", 4), c("C", "K"), c("H", 2)], S: [], W: [],
      },
      trump: "S", leader: "N",
      played: [{ seat: "N", card: c("C", "Q") }], // N (opponent of E) led C,Q
    });
    const pick = pickCard(s, "E");
    // E can follow with C(4) or C(K). C(K) > C(Q) wins. Lowest winning = C(K).
    expect(pick).toEqual(c("C", "K"));
  });

  it("following + opponent winning, no winning card: dumps lowest legal", () => {
    const s = craftPlaying({
      hands: {
        N: [], E: [c("C", 4), c("C", 5), c("H", 2)], S: [], W: [],
      },
      trump: "S", leader: "N",
      played: [{ seat: "N", card: c("C", "A") }],
    });
    const pick = pickCard(s, "E");
    // Can't beat A; must follow C. Dumps C,4 (lowest).
    expect(pick).toEqual(c("C", 4));
  });

  it("following + partner winning: does NOT overtake; dumps lowest legal", () => {
    // E and W are partners. N leads, E plays high, S follows. S sees partner W
    // has not played yet — wait, partner of S is N. Let's set up partner=winning correctly.
    // Partners: N-S, E-W. So S's partner is N. If N is winning, S should dump.
    const s = craftPlaying({
      hands: {
        N: [], E: [], S: [c("C", 5), c("C", "K"), c("D", 9)], W: [],
      },
      trump: "S", leader: "N",
      played: [
        { seat: "N", card: c("C", "A") }, // N (partner of S) leads with A — winning
        { seat: "E", card: c("C", 3) },   // E plays low
      ],
    });
    const pick = pickCard(s, "S");
    // Partner N is winning with A. S should NOT play K to overtake. Should dump C,5.
    expect(pick).toEqual(c("C", 5));
  });
});

describe("pickAction (top-level dispatcher)", () => {
  it("returns null when it isn't this seat's turn during bidding", () => {
    let s = initialState("t", 1);
    s = seatAll(s);
    s = { ...s, phase: { kind: "bidding", turn: "E", bids: {} } };
    expect(pickAction(s, "N")).toBeNull();
  });

  it("returns RESOLVE_TRICK when the trick has 4 cards", () => {
    let s = initialState("t", 1);
    s = seatAll(s);
    s = {
      ...s,
      phase: {
        kind: "playing",
        trick: {
          cards: [
            { seat: "N", card: c("C", 2) },
            { seat: "E", card: c("C", 3) },
            { seat: "S", card: c("C", 4) },
            { seat: "W", card: c("C", 5) },
          ],
          leader: "N",
          winner: "W",
        },
        trump: "S", pitcher: "N", bid: 2, handLog: [],
      },
    };
    const a = pickAction(s, "N");
    expect(a).toEqual({ type: "RESOLVE_TRICK" });
  });

  it("returns SCORE_HAND in scoring phase when not applied", () => {
    let s = initialState("t", 1);
    s = seatAll(s);
    s = {
      ...s,
      phase: {
        kind: "scoring",
        trump: "S", pitcher: "N", bid: 2, handLog: [],
        deltas: { NS: 2, EW: 0 },
        pitcherMadeBid: true,
        applied: false,
      },
    };
    expect(pickAction(s, "N")).toEqual({ type: "SCORE_HAND" });
  });
});

describe("nextBotAction (driver-facing API)", () => {
  it("returns null when the set of bot seats is empty", () => {
    let s = initialState("t", 1);
    s = seatAll(s);
    s = { ...s, phase: { kind: "bidding", turn: "E", bids: {} } };
    expect(nextBotAction(s, new Set())).toBeNull();
  });

  it("picks the bot whose turn it is", () => {
    let s = initialState("t", 1);
    s = seatAll(s);
    s = { ...s, phase: { kind: "bidding", turn: "E", bids: {} } };
    // E is a bot; N is not.
    const r = nextBotAction(s, new Set<Seat>(["N", "E"]));
    expect(r?.seat).toBe("E");
    expect(r?.action.type).toBe("BID");
  });
});

// ---------- End-to-end: 4 bots play a full hand without panic ----------

describe("4 bots play a complete hand to scoring", () => {
  it("runs the engine through bidding → trump → 6 tricks → scoring entirely via bot heuristics", () => {
    let s = initialState("e2e", 999);
    s = seatAll(s);
    s = reducer(s, { type: "START_HAND" });
    expect(s.phase.kind).toBe("bidding");

    const bots: ReadonlySet<Seat> = new Set(["N", "E", "S", "W"]);
    let guard = 0;
    while (s.phase.kind !== "scoring" && guard < 200) {
      const next = nextBotAction(s, bots);
      if (!next) throw new Error(`stuck at ${s.phase.kind} (no action)`);
      s = reducer(s, next.action);
      guard++;
    }
    expect(s.phase.kind).toBe("scoring");
    expect(s.hands.N.length + s.hands.E.length + s.hands.S.length + s.hands.W.length).toBe(0);
  });

  it("plays 5 consecutive hands with all-bot table; dealer rotates each time", () => {
    let s = initialState("multi", 4242);
    s = seatAll(s);
    s = reducer(s, { type: "START_HAND" });
    const bots: ReadonlySet<Seat> = new Set(["N", "E", "S", "W"]);
    const dealerOrder: Seat[] = [];

    for (let h = 0; h < 5; h++) {
      dealerOrder.push(s.dealerSeat);
      let guard = 0;
      while (s.phase.kind !== "scoring" && guard < 200) {
        const next = nextBotAction(s, bots);
        if (!next) throw new Error("stuck mid-hand");
        s = reducer(s, next.action);
        guard++;
      }
      // Apply scoring
      s = reducer(s, { type: "SCORE_HAND" });
      if (s.phase.kind === "gameOver") break;
      // Deal next
      s = reducer(s, { type: "START_HAND" });
    }
    expect(dealerOrder.slice(0, 4)).toEqual(["N", "E", "S", "W"]);
  });
});

describe("pickCard: more strategic scenarios", () => {
  function craftPlayingState2(opts: {
    hands: Record<Seat, Card[]>;
    trump: Suit | null;
    leader: Seat;
    played: PlayedCard[];
  }): GameState {
    let s = initialState("t2", 1);
    s = seatAll(s);
    return {
      ...s,
      hands: opts.hands,
      phase: {
        kind: "playing",
        trick: { cards: opts.played, leader: opts.leader, winner: null },
        trump: opts.trump,
        pitcher: opts.leader,
        bid: 2,
        handLog: [],
      },
    };
  }

  it("opening lead with tied strongest suits is deterministic (suit order stable)", () => {
    const s1 = craftPlayingState2({
      hands: {
        N: [c("C", "A"), c("D", "A"), c("H", "A"), c("S", "A"), c("C", 2), c("D", 2)],
        E: [], S: [], W: [],
      },
      trump: null, leader: "N", played: [],
    });
    const pick1 = pickCard(s1, "N");
    // Two reasonable outcomes — but the picker must be deterministic across calls.
    const pick2 = pickCard(s1, "N");
    expect(pick1).toEqual(pick2);
  });

  it("following a non-trump lead with NO lead suit + has trump: now sluffs the lowest card (no longer forced to trump)", () => {
    // Per the house rule, the bot can sluff anything when missing the lead suit.
    // It should dump the LOWEST card unless trumping in wins cheaply.
    // Set up: N (opponent) leads C,Q. E has no clubs. E has S(2) trump and a bunch of junk.
    // Trumping with S(2) WOULD win the trick — so the bot should still play S(2)
    // (lowest winning card). We're verifying it picks the cheapest winning card.
    const s = craftPlayingState2({
      hands: {
        N: [], E: [c("S", 2), c("H", 4), c("H", 5), c("D", 4), c("D", 5), c("D", 6)], S: [], W: [],
      },
      trump: "S", leader: "N",
      played: [PC("N", "C", "Q")],
    });
    const pick = pickCard(s, "E");
    // S(2) trumps in and wins for sure. That's the lowest winning card.
    expect(pick).toEqual(c("S", 2));
  });

  it("following with NO lead suit + has trump but cannot beat the current best trump: dumps lowest", () => {
    // Opponent already played a high trump. Our small trump can't beat it.
    const s = craftPlayingState2({
      hands: {
        N: [], E: [c("S", 2), c("H", 4), c("H", "A"), c("D", 4), c("D", 5), c("D", 6)], S: [], W: [],
      },
      trump: "S", leader: "N",
      played: [
        PC("N", "C", 5),   // lead
        PC("W", "S", "K"), // partner of E? no — W is opponent of E. W trumped in.
      ],
    });
    // E is in 3rd position. Opponent W is currently winning with S(K). E's S(2)
    // can't beat S(K). So the bot can't win the trick and dumps the lowest legal
    // card. S(2) has the lowest rankValue (0) in the hand, so the bot plays it.
    const pick = pickCard(s, "E");
    expect(pick).toEqual(c("S", 2));
  });

  it("leading a later trick prefers HIGHEST trump (pulling trumps)", () => {
    const s = craftPlayingState2({
      hands: {
        N: [c("S", 9), c("S", "A"), c("H", 3), c("D", 5)],
        E: [], S: [], W: [],
      },
      trump: "S", leader: "N", played: [],
    });
    // Should lead S(A) — highest trump.
    expect(pickCard(s, "N")).toEqual(c("S", "A"));
  });

  it("leading later trick with no trumps in hand: plays lowest non-trump", () => {
    const s = craftPlayingState2({
      hands: {
        N: [c("H", 3), c("D", 5), c("C", "A"), c("H", "K")],
        E: [], S: [], W: [],
      },
      trump: "S", leader: "N", played: [],
    });
    expect(pickCard(s, "N")).toEqual(c("H", 3));
  });

  it("partner currently winning with a trump → don't waste a winning card; dump lowest", () => {
    // Partners are N–S. N is leader, played C,5. E (opponent of N) trumped with S(K).
    // Now S (N's partner) — wait, that means E is winning, not partner. Let me fix.
    // Let me set up: N (partner of S) leads C,5. E plays C,3. Now it's S's turn —
    // partner N is winning (C,5 > C,3). S should dump lowest.
    const s = craftPlayingState2({
      hands: {
        N: [], E: [], S: [c("C", 7), c("C", "A"), c("H", 3), c("D", 4), c("D", 5), c("D", 6)], W: [],
      },
      trump: "S", leader: "N",
      played: [PC("N", "C", 5), PC("E", "C", 3)],
    });
    const pick = pickCard(s, "S");
    // Partner N winning with C,5. S has C,7 and C,A — should NOT overtake.
    // Lowest legal card overall is C,7 (must follow suit, has clubs).
    expect(pick).toEqual(c("C", 7));
  });
});

describe("LEAVE_SEAT engine support", () => {
  it("clears a seat when called by its owner", () => {
    let s = initialState("t", 1);
    s = reducer(s, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    expect(s.players.N?.uid).toBe("uA");
    s = reducer(s, { type: "LEAVE_SEAT", seat: "N", uid: "uA" });
    expect(s.players.N).toBeNull();
  });

  it("does NOT clear a seat when called by a different uid", () => {
    let s = initialState("t", 1);
    s = reducer(s, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    s = reducer(s, { type: "LEAVE_SEAT", seat: "N", uid: "uHACK" });
    expect(s.players.N?.uid).toBe("uA");
  });

  it("is a no-op outside the lobby phase", () => {
    let s = initialState("t", 1);
    s = reducer(s, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "A" });
    s = reducer(s, { type: "JOIN_SEAT", seat: "E", uid: "uB", nickname: "B" });
    s = reducer(s, { type: "JOIN_SEAT", seat: "S", uid: "uC", nickname: "C" });
    s = reducer(s, { type: "JOIN_SEAT", seat: "W", uid: "uD", nickname: "D" });
    s = reducer(s, { type: "START_HAND" });
    expect(s.phase.kind).toBe("bidding");
    // Try to leave while bidding — should be no-op
    const after = reducer(s, { type: "LEAVE_SEAT", seat: "N", uid: "uA" });
    expect(after.players.N?.uid).toBe("uA");
  });

  it("after LEAVE_SEAT, a new JOIN_SEAT for that seat is accepted", () => {
    let s = initialState("t", 1);
    s = reducer(s, { type: "JOIN_SEAT", seat: "N", uid: "uA", nickname: "Alice" });
    s = reducer(s, { type: "LEAVE_SEAT", seat: "N", uid: "uA" });
    s = reducer(s, { type: "JOIN_SEAT", seat: "N", uid: "uB", nickname: "Bob" });
    expect(s.players.N?.uid).toBe("uB");
    expect(s.players.N?.nickname).toBe("Bob");
  });
});

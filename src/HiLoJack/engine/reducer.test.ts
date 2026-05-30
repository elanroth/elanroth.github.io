import { describe, expect, it } from "vitest";
import {
  BidAmount, Card, GameState, PlayedCard, Rank, Seat, Suit, TrickRecord, teamOf,
} from "./types";
import { initialState, reducer } from "./reducer";
import { legalPlays, winnerOfTrick } from "./rules";
import { computeDeltas, scoreHand } from "./scoring";

// ----- test helpers -----

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const SEATS_CW: Seat[] = ["N", "E", "S", "W"];

function joinAll(s: GameState): GameState {
  let st = s;
  for (const seat of SEATS_CW) {
    st = reducer(st, { type: "JOIN_SEAT", seat, uid: `u${seat}`, nickname: seat });
  }
  return st;
}

function mkTrick(plays: [Seat, Card][], winner: Seat): TrickRecord {
  return { cards: plays.map(([seat, card]) => ({ seat, card })), winner };
}

function craftPlayingState(opts: {
  hands: Record<Seat, Card[]>;
  trump: Suit;
  pitcher: Seat;
  bid: BidAmount;
  scoreNS?: number;
  scoreEW?: number;
  targetScore?: 7 | 11 | 21;
  dealerSeat?: Seat;
}): GameState {
  let st = initialState("test", 1);
  st = joinAll(st);
  return {
    ...st,
    hands: opts.hands,
    score: { NS: opts.scoreNS ?? 0, EW: opts.scoreEW ?? 0 },
    targetScore: opts.targetScore ?? 21,
    dealerSeat: opts.dealerSeat ?? "N",
    phase: {
      kind: "playing",
      trick: { cards: [], leader: opts.pitcher, winner: null },
      trump: opts.trump,
      pitcher: opts.pitcher,
      bid: opts.bid,
      handLog: [],
    },
  };
}

function craftScoringState(opts: {
  scoreNS: number;
  scoreEW: number;
  pitcher: Seat;
  bid: BidAmount;
  deltas: { NS: number; EW: number };
  pitcherMadeBid: boolean;
  targetScore?: 7 | 11 | 21;
}): GameState {
  let st = initialState("test", 1);
  st = joinAll(st);
  return {
    ...st,
    score: { NS: opts.scoreNS, EW: opts.scoreEW },
    targetScore: opts.targetScore ?? 21,
    phase: {
      kind: "scoring",
      trump: "S",
      pitcher: opts.pitcher,
      bid: opts.bid,
      handLog: [],
      deltas: opts.deltas,
      pitcherMadeBid: opts.pitcherMadeBid,
      applied: false,
    },
  };
}

// ----- M1a first-pass cases (1–15) -----

describe("HiLoJack engine — M1a first-pass cases (1–15)", () => {
  it("case 1: non-leaders sluff when they have neither lead suit nor trump", () => {
    // Trump = S; lead = C(A). E, S, W hold no clubs and no spades.
    const E = [c("H", "A"), c("H", "K"), c("D", 2), c("D", 3), c("D", 4), c("D", 5)];
    const lead: PlayedCard[] = [{ seat: "N", card: c("C", "A") }];
    // E may play anything (sluff)
    expect(legalPlays(E, lead, "S").length).toBe(6);

    const winner = winnerOfTrick(
      [
        { seat: "N", card: c("C", "A") },
        { seat: "E", card: c("H", "A") },
        { seat: "S", card: c("D", "A") },
        { seat: "W", card: c("H", 8) },
      ],
      "S",
    );
    expect(winner).toBe("N"); // no trumps played, only the lead-suit card (C,A) qualifies
  });

  it("case 2: Jack of trump never dealt → Jack point not awarded", () => {
    const trump: Suit = "S";
    const handLog: TrickRecord[] = [
      mkTrick([["N", c("S", "A")], ["E", c("S", 7)], ["S", c("H", "A")], ["W", c("D", "A")]], "N"),
      mkTrick([["N", c("S", "K")], ["E", c("S", 6)], ["S", c("H", "K")], ["W", c("D", "K")]], "N"),
      mkTrick([["N", c("S", "Q")], ["E", c("S", 5)], ["S", c("H", "Q")], ["W", c("D", "Q")]], "N"),
      mkTrick([["N", c("S", 10)], ["E", c("S", 4)], ["S", c("H", 10)], ["W", c("D", 10)]], "N"),
      mkTrick([["N", c("S", 9)], ["E", c("S", 3)], ["S", c("H", 9)], ["W", c("D", 9)]], "N"),
      mkTrick([["N", c("S", 8)], ["E", c("S", 2)], ["S", c("H", 8)], ["W", c("D", 8)]], "N"),
    ];
    const hp = scoreHand(handLog, trump);
    expect(hp.jack).toBeNull();
    // N won every trick — NS captured both the A and the 2 of trump
    expect(hp.high).toBe("NS");
    expect(hp.low).toBe("NS");
    // NS also captures every pip card (they won all tricks)
    expect(hp.game).toBe("NS");
  });

  it("case 3: exactly one trump played → High and Low both go to that team", () => {
    const trump: Suit = "S";
    const handLog: TrickRecord[] = [
      mkTrick([["N", c("C", "A")], ["E", c("C", "K")], ["S", c("C", "Q")], ["W", c("S", 7)]], "W"),
      mkTrick([["W", c("D", "A")], ["N", c("D", 2)], ["E", c("D", "K")], ["S", c("D", "Q")]], "W"),
      mkTrick([["W", c("H", "A")], ["N", c("H", 2)], ["E", c("H", "K")], ["S", c("H", "Q")]], "W"),
      mkTrick([["W", c("C", 2)], ["N", c("C", 3)], ["E", c("C", 4)], ["S", c("C", 5)]], "S"),
      mkTrick([["S", c("D", 3)], ["W", c("D", 4)], ["N", c("D", 5)], ["E", c("D", 6)]], "E"),
      mkTrick([["E", c("H", 4)], ["S", c("H", 5)], ["W", c("H", 6)], ["N", c("H", 7)]], "N"),
    ];
    const hp = scoreHand(handLog, trump);
    expect(hp.high).toBe("EW"); // S,7 captured by W (EW); only trump played
    expect(hp.low).toBe("EW");
    expect(hp.jack).toBeNull();
  });

  it("case 4: successful 5 bid from 0–0 → +5, game continues (below 21 target)", () => {
    const hp = { high: "NS", low: "NS", jack: "NS", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 5, true);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 5, EW: 0 });

    const st = craftScoringState({
      scoreNS: 0, scoreEW: 0, pitcher: "N", bid: 5,
      deltas: r.deltas, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(5);
    expect(next.phase.kind).not.toBe("gameOver");
  });

  it("case 5: failed regular bid can drop a team's score below zero", () => {
    const hp = { high: "EW", low: "EW", jack: "EW", game: "EW" } as const;
    const r = computeDeltas(hp, "NS", 4, false);
    expect(r.pitcherMadeBid).toBe(false);
    expect(r.deltas).toEqual({ NS: -4, EW: 4 });

    const st = craftScoringState({
      scoreNS: 0, scoreEW: 0, pitcher: "N", bid: 4,
      deltas: r.deltas, pitcherMadeBid: false,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(-4);
    expect(next.score.EW).toBe(4);
  });

  it("case 6: pitcher bids 3, captures all 4 points → scores 4 (overperformance)", () => {
    const hp = { high: "NS", low: "NS", jack: "NS", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 3, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 4, EW: 0 });
  });

  it("case 7: pitcher fails 3-bid; opponents still earn what they captured", () => {
    const hp = { high: "EW", low: "NS", jack: "EW", game: "EW" } as const;
    const r = computeDeltas(hp, "NS", 3, false);
    expect(r.pitcherMadeBid).toBe(false);
    expect(r.deltas).toEqual({ NS: -3, EW: 3 });
  });

  it("case 8: non-pitching team crosses 21 → game does NOT end", () => {
    const st = craftScoringState({
      scoreNS: 5, scoreEW: 19, pitcher: "N", bid: 2,
      deltas: { NS: 2, EW: 2 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.EW).toBe(21);
    expect(next.phase.kind).not.toBe("gameOver");
  });

  it("case 9: pitcher at 19, bids 2, makes 2 → lands at 21, wins", () => {
    const st = craftScoringState({
      scoreNS: 19, scoreEW: 0, pitcher: "N", bid: 2,
      deltas: { NS: 2, EW: 0 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(21);
    expect(next.phase.kind).toBe("gameOver");
    if (next.phase.kind === "gameOver") expect(next.phase.winner).toBe("NS");
  });

  it("case 10: above-target team cannot win unless they pitch and make", () => {
    // EW at 25 from prior pitches; NS pitches this hand, makes 2, lands at 12 → no win
    const st1 = craftScoringState({
      scoreNS: 10, scoreEW: 25, pitcher: "N", bid: 2,
      deltas: { NS: 2, EW: 0 }, pitcherMadeBid: true,
    });
    const after1 = reducer(st1, { type: "SCORE_HAND" });
    expect(after1.phase.kind).not.toBe("gameOver");

    // Now EW pitches and makes 2 → game ends, EW wins
    const st2 = craftScoringState({
      scoreNS: 10, scoreEW: 25, pitcher: "E", bid: 2,
      deltas: { NS: 0, EW: 2 }, pitcherMadeBid: true,
    });
    const after2 = reducer(st2, { type: "SCORE_HAND" });
    expect(after2.phase.kind).toBe("gameOver");
    if (after2.phase.kind === "gameOver") expect(after2.phase.winner).toBe("EW");
  });

  it("case 11: both teams ≥ 21, pitcher makes bid → pitcher wins", () => {
    const st = craftScoringState({
      scoreNS: 22, scoreEW: 24, pitcher: "N", bid: 3,
      deltas: { NS: 3, EW: 1 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.phase.kind).toBe("gameOver");
    if (next.phase.kind === "gameOver") expect(next.phase.winner).toBe("NS");
  });

  it("case 12: both teams ≥ 21, pitcher fails bid → no one wins, game continues", () => {
    const st = craftScoringState({
      scoreNS: 22, scoreEW: 24, pitcher: "N", bid: 3,
      deltas: { NS: -3, EW: 2 }, pitcherMadeBid: false,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.phase.kind).not.toBe("gameOver");
    expect(next.score.NS).toBe(19);
    expect(next.score.EW).toBe(26);
  });

  it("case 13: dealer stuck — pass illegal on dealer's turn after 3 prior passes", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, dealerSeat: "N", phase: { kind: "bidding", turn: "E", bids: {} } };

    st = reducer(st, { type: "BID", seat: "E", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "S", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "W", bid: "pass" });

    // Dealer N tries to pass — must be rejected
    const tryPass = reducer(st, { type: "BID", seat: "N", bid: "pass" });
    expect(tryPass).toBe(st);

    // Dealer N bids 2 → moves directly to playing with trump=null
    // (the pitcher's first card will set trump under the house rule)
    const next = reducer(st, { type: "BID", seat: "N", bid: 2 });
    expect(next.phase.kind).toBe("playing");
    if (next.phase.kind === "playing") {
      expect(next.phase.pitcher).toBe("N");
      expect(next.phase.bid).toBe(2);
      expect(next.phase.trump).toBeNull();
      expect(next.phase.trick.leader).toBe("N");
    }
  });

  it("case 14: non-trump lead — others must follow suit OR play trump", () => {
    const E_hand = [
      c("C", 8), c("C", 7), c("S", 2),
      c("H", "A"), c("H", "K"), c("H", "Q"),
    ];
    const S_hand = [
      c("D", "A"), c("D", "K"), c("D", "Q"),
      c("D", "J"), c("D", 10), c("D", 9),
    ];
    const leadC = [{ seat: "N" as Seat, card: c("C", "A") }];
    const eLegal = legalPlays(E_hand, leadC, "S");
    // E must play C(8), C(7), or S(2) — not the hearts.
    expect(eLegal).toEqual(
      expect.arrayContaining([c("C", 8), c("C", 7), c("S", 2)]),
    );
    expect(eLegal.length).toBe(3);
    expect(eLegal.find((x) => x.suit === "H")).toBeUndefined();

    // S has no clubs and no spades — sluff anything legal
    const sLegal = legalPlays(S_hand, leadC, "S");
    expect(sLegal.length).toBe(6);
  });

  it("house rule: non-trump lead + no lead-suit cards → may play ANY card (not forced to trump)", () => {
    // Trump = S. Lead = C(A). E has NO clubs but DOES have a trump (S, 2).
    // Per Elan's house rule, E may sluff anything — including non-trump non-lead-suit cards.
    const E_hand = [c("S", 2), c("H", 5), c("H", 8), c("D", "Q"), c("D", 4), c("D", 7)];
    const lead = [{ seat: "N" as Seat, card: c("C", "A") }];
    const legal = legalPlays(E_hand, lead, "S");
    // Every card is legal — including the trump (still allowed) and any non-trump
    expect(legal.length).toBe(6);
    expect(legal).toEqual(expect.arrayContaining(E_hand));
  });

  it("case 15: trump lead — others must play trump if they have it", () => {
    const E_hand = [
      c("S", 8), c("S", 7), c("H", 2),
      c("H", "A"), c("H", "K"), c("H", "Q"),
    ];
    const S_hand = [
      c("D", "A"), c("D", "K"), c("D", "Q"),
      c("D", "J"), c("D", 10), c("D", 9),
    ];
    const leadS = [{ seat: "N" as Seat, card: c("S", "A") }];
    const eLegal = legalPlays(E_hand, leadS, "S");
    expect(eLegal).toEqual([c("S", 8), c("S", 7)]);

    const sLegal = legalPlays(S_hand, leadS, "S");
    expect(sLegal.length).toBe(6); // no trump → sluff anything
  });
});

// ----- M1b rigor-pass cases (16–55) -----

describe("HiLoJack engine — M1b bidding (16, 36, 38, 39)", () => {
  it("case 16: bid escalation 2 → 3 → 4 → 5; pitcher is the 5-bidder", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, dealerSeat: "N", phase: { kind: "bidding", turn: "E", bids: {} } };
    st = reducer(st, { type: "BID", seat: "E", bid: 2 });
    st = reducer(st, { type: "BID", seat: "S", bid: 3 });
    st = reducer(st, { type: "BID", seat: "W", bid: 4 });
    st = reducer(st, { type: "BID", seat: "N", bid: 5 });
    expect(st.phase.kind).toBe("playing");
    if (st.phase.kind === "playing") {
      expect(st.phase.pitcher).toBe("N");
      expect(st.phase.bid).toBe(5);
      expect(st.phase.trump).toBeNull();
    }
  });

  it("case 36: BID by the wrong seat is refused (state unchanged)", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, phase: { kind: "bidding", turn: "E", bids: {} } };
    const wrong = reducer(st, { type: "BID", seat: "S", bid: 3 });
    expect(wrong).toBe(st);
  });

  it("case 38: non-pass bid not strictly higher than current high is refused", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, phase: { kind: "bidding", turn: "E", bids: {} } };
    st = reducer(st, { type: "BID", seat: "E", bid: 3 });
    const stBefore = st;
    const refused = reducer(st, { type: "BID", seat: "S", bid: 3 });
    expect(refused).toBe(stBefore);
    const refused2 = reducer(st, { type: "BID", seat: "S", bid: 2 });
    expect(refused2).toBe(stBefore);
    const ok = reducer(st, { type: "BID", seat: "S", bid: 4 });
    expect(ok).not.toBe(stBefore);
  });

  it("case 39: pass always legal on bid turn unless dealer-stuck", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, dealerSeat: "N", phase: { kind: "bidding", turn: "E", bids: {} } };
    st = reducer(st, { type: "BID", seat: "E", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "S", bid: 3 });
    // W can still pass (not stuck)
    const next = reducer(st, { type: "BID", seat: "W", bid: "pass" });
    expect(next).not.toBe(st);
    if (next.phase.kind === "bidding") expect(next.phase.bids.W).toBe("pass");
  });
});

describe("HiLoJack engine — M1b legalPlays mechanics (17–22)", () => {
  it("case 17: hand with only trumps → every play is legal regardless of lead", () => {
    const trumpsOnly = [
      c("S", "A"), c("S", "K"), c("S", "Q"), c("S", "J"), c("S", 10), c("S", 9),
    ];
    const noLeadYet = legalPlays(trumpsOnly, [], "S");
    expect(noLeadYet.length).toBe(6);
    const trumpLed = legalPlays(trumpsOnly, [{ seat: "N", card: c("S", 7) }], "S");
    expect(trumpLed.length).toBe(6);
    const nonTrumpLed = legalPlays(trumpsOnly, [{ seat: "N", card: c("H", 3) }], "S");
    // No hearts, can play trump
    expect(nonTrumpLed.length).toBe(6);
  });

  it("case 18: no trumps + trump suit led → may sluff anything", () => {
    const noTrumps = [
      c("H", 2), c("D", 3), c("C", 4), c("H", 5), c("D", 6), c("C", 7),
    ];
    const result = legalPlays(noTrumps, [{ seat: "N", card: c("S", "A") }], "S");
    expect(result.length).toBe(6);
  });

  it("case 19: holds both lead suit AND trump on non-trump lead → both options appear", () => {
    const hand = [
      c("C", 8), c("C", 7),    // lead-suit (clubs)
      c("S", 5), c("S", 6),    // trumps
      c("H", 2), c("D", 3),    // neither
    ];
    const legal = legalPlays(hand, [{ seat: "N", card: c("C", "A") }], "S");
    expect(legal).toEqual(
      expect.arrayContaining([c("C", 8), c("C", 7), c("S", 5), c("S", 6)]),
    );
    expect(legal.length).toBe(4);
  });

  it("case 20: pitcher trumps in even though following would also be legal — engine accepts", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A")],
        E: [c("C", 8), c("S", 2), c("H", 2), c("D", 2), c("H", 3), c("D", 3)],
        S: [c("D", "A")],
        W: [c("H", "A")],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    // E has C(8) — could follow — but chooses S(2) (trump in)
    const after = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("S", 2) });
    if (after.phase.kind === "playing") {
      expect(after.phase.trick.cards.length).toBe(2);
      expect(after.phase.trick.cards[1].card).toEqual(c("S", 2));
    }
  });

  it("case 21: pitcher follows suit even though trumping would also be legal", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A")],
        E: [c("C", 8), c("S", 2), c("H", 2), c("D", 2), c("H", 3), c("D", 3)],
        S: [c("D", "A")],
        W: [c("H", "A")],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    const after = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 8) });
    if (after.phase.kind === "playing") {
      expect(after.phase.trick.cards[1].card).toEqual(c("C", 8));
    }
  });

  it("case 22: no lead suit, no trump → sluff anything", () => {
    const hand = [c("H", 2), c("H", 3), c("D", 4), c("D", 5), c("H", 7), c("D", 8)];
    const legal = legalPlays(hand, [{ seat: "N", card: c("C", "A") }], "S");
    expect(legal.length).toBe(6);
  });
});

describe("HiLoJack engine — M1b scoring (23–32)", () => {
  it("case 23: Jack of trump captured in the last trick decides the Jack point", () => {
    const trump: Suit = "S";
    const handLog: TrickRecord[] = [
      mkTrick([["N", c("H", "A")], ["E", c("H", 2)], ["S", c("H", "K")], ["W", c("H", 3)]], "N"),
      mkTrick([["N", c("H", "Q")], ["E", c("H", 4)], ["S", c("H", 10)], ["W", c("H", 5)]], "N"),
      mkTrick([["N", c("H", 9)], ["E", c("H", 6)], ["S", c("D", "A")], ["W", c("H", 7)]], "N"),
      mkTrick([["N", c("D", "K")], ["E", c("C", 2)], ["S", c("D", "Q")], ["W", c("D", 10)]], "N"),
      mkTrick([["N", c("D", 9)], ["E", c("C", 3)], ["S", c("D", 8)], ["W", c("D", 7)]], "N"),
      mkTrick([["N", c("S", 5)], ["E", c("S", "J")], ["S", c("S", 2)], ["W", c("S", 3)]], "E"),
      // last trick: E plays S(J), E wins (highest trump). EW gets Jack point.
    ];
    const hp = scoreHand(handLog, trump);
    expect(hp.jack).toBe("EW");
  });

  it("case 24: highest trump played wins High for the first-trick winner", () => {
    const trump: Suit = "S";
    const handLog: TrickRecord[] = [
      mkTrick([["N", c("S", "A")], ["E", c("S", 2)], ["S", c("S", 3)], ["W", c("S", 4)]], "N"),
      mkTrick([["N", c("H", "A")], ["E", c("H", 2)], ["S", c("H", 3)], ["W", c("H", 4)]], "N"),
      mkTrick([["N", c("H", "K")], ["E", c("H", 5)], ["S", c("H", 6)], ["W", c("H", 7)]], "N"),
      mkTrick([["N", c("D", "A")], ["E", c("D", 2)], ["S", c("D", 3)], ["W", c("D", 4)]], "N"),
      mkTrick([["N", c("D", "K")], ["E", c("D", 5)], ["S", c("D", 6)], ["W", c("D", 7)]], "N"),
      mkTrick([["N", c("C", "A")], ["E", c("C", 2)], ["S", c("C", 3)], ["W", c("C", 4)]], "N"),
    ];
    const hp = scoreHand(handLog, trump);
    expect(hp.high).toBe("NS"); // A of spades captured in first trick by N
  });

  it("case 25: pitcher bids 2, captures all 4 → +4", () => {
    const hp = { high: "NS", low: "NS", jack: "NS", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 2, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 4, EW: 0 });
  });

  it("case 26: pitcher bids 4 and exactly makes 4", () => {
    const hp = { high: "NS", low: "NS", jack: "NS", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 4, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 4, EW: 0 });
  });

  it("case 27: pitcher bids 5 and sweeps all tricks & all 4 points → +5", () => {
    const hp = { high: "NS", low: "NS", jack: "NS", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 5, true);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 5, EW: 0 });
  });

  it("case 28: 5 bid with Jack not dealt — needs all 3 available points + all 6 tricks → +5", () => {
    const hp = { high: "NS", low: "NS", jack: null, game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 5, true);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 5, EW: 0 });
  });

  it("case 29: 5 bid but only 5 of 6 tricks → −4", () => {
    const hp = { high: "NS", low: "NS", jack: "NS", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 5, false);
    expect(r.pitcherMadeBid).toBe(false);
    expect(r.deltas.NS).toBe(-4);
  });

  it("case 30: 5 bid sweep — opponents captured nothing, so Game cannot go to them", () => {
    const trump: Suit = "S";
    const handLog: TrickRecord[] = Array.from({ length: 6 }, (_, i) =>
      mkTrick(
        [
          ["N", c("S", (["A", "K", "Q", "J", 10, 9] as Rank[])[i])],
          ["E", c("H", (["A", "K", "Q", "J", 10, 9] as Rank[])[i])],
          ["S", c("D", (["A", "K", "Q", "J", 10, 9] as Rank[])[i])],
          ["W", c("C", (["A", "K", "Q", "J", 10, 9] as Rank[])[i])],
        ],
        "N",
      ),
    );
    const hp = scoreHand(handLog, trump);
    expect(hp.high).toBe("NS");
    expect(hp.low).toBe("NS");
    expect(hp.jack).toBe("NS");
    expect(hp.game).toBe("NS"); // all pip cards in NS pile
  });

  it("case 31: Game-point tie → no Game point; pitcher bid 3 with H+L+J → made bid", () => {
    // hp where game is null because pips tied; pitcher captured H, L, J
    const hp = { high: "NS", low: "NS", jack: "NS", game: null } as const;
    const r = computeDeltas(hp, "NS", 3, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 3, EW: 0 });
  });

  it("case 32: pitcher bids 3 with H+L+Game; opponents get Jack → +3 / +1", () => {
    const hp = { high: "NS", low: "NS", jack: "EW", game: "NS" } as const;
    const r = computeDeltas(hp, "NS", 3, false);
    expect(r.pitcherMadeBid).toBe(true);
    expect(r.deltas).toEqual({ NS: 3, EW: 1 });
  });
});

describe("HiLoJack engine — M1b illegal actions refused (33–35, 37, 53–55)", () => {
  it("case 33: PLAY_CARD with a card not in hand is refused", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A")],
        E: [c("H", 2)], S: [c("D", 2)], W: [c("S", 2)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    const refused = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "K") });
    expect(refused).toBe(st);
  });

  it("case 34: PLAY_CARD that violates follow-suit rules is refused", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A"), c("C", "K")],
        E: [c("C", 8), c("H", 2)], // E must follow clubs or play trump (no trumps here)
        S: [c("D", 2)], W: [c("S", 2)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    const before = st;
    const refused = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("H", 2) });
    expect(refused).toBe(before);
  });

  it("case 35: PLAY_CARD when it isn't that seat's turn is refused", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A")], E: [c("C", 8)], S: [c("D", 2)], W: [c("S", 2)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    const refused = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 8) });
    expect(refused).toBe(st);
  });

  it("case 37: race — same seat trying to play twice in a row is refused on the second", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A"), c("C", "K")], E: [c("C", 8)], S: [c("D", 2)], W: [c("S", 2)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    const before = st;
    const refused = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "K") });
    expect(refused).toBe(before);
  });

  it("case 53: after 4th card played, only RESOLVE_TRICK can advance", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A"), c("C", 9)], E: [c("C", 8)], S: [c("D", 2)], W: [c("S", 2)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    st = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 8) });
    st = reducer(st, { type: "PLAY_CARD", seat: "S", card: c("D", 2) });
    st = reducer(st, { type: "PLAY_CARD", seat: "W", card: c("S", 2) });
    expect(st.phase.kind).toBe("playing");
    if (st.phase.kind === "playing") {
      expect(st.phase.trick.cards.length).toBe(4);
      expect(st.phase.trick.winner).toBe("W");
    }
    // Another PLAY_CARD should be refused
    const stBefore = st;
    const refusedPlay = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", 9) });
    expect(refusedPlay).toBe(stBefore);
    // BID, SCORE_HAND, START_HAND, LEAVE_SEAT all no-ops
    expect(reducer(st, { type: "BID", seat: "N", bid: 2 })).toBe(stBefore);
    expect(reducer(st, { type: "SCORE_HAND" })).toBe(stBefore);
    expect(reducer(st, { type: "START_HAND" })).toBe(stBefore);
    expect(reducer(st, { type: "LEAVE_SEAT", seat: "N", uid: "anyone" })).toBe(stBefore);
    // RESOLVE_TRICK advances
    const advanced = reducer(st, { type: "RESOLVE_TRICK" });
    expect(advanced).not.toBe(stBefore);
  });

  it("case 54: RESOLVE_TRICK on an incomplete trick is a no-op", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A"), c("C", "K")], E: [c("C", 8), c("C", 9)],
        S: [c("D", 2), c("D", 3)], W: [c("S", 2), c("S", 3)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    st = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 8) });
    const before = st;
    const refused = reducer(st, { type: "RESOLVE_TRICK" });
    expect(refused).toBe(before);
  });

  it("case 55: pitcher's first card sets trump (house rule replaces explicit CHOOSE_TRUMP)", () => {
    // After bidding completes, phase = playing with trump=null. The pitcher's
    // first card lands and sets trump to that card's suit.
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, dealerSeat: "W", phase: { kind: "bidding", turn: "N", bids: {} } };
    st = reducer(st, { type: "BID", seat: "N", bid: 2 });
    st = reducer(st, { type: "BID", seat: "E", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "S", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "W", bid: "pass" });
    expect(st.phase.kind).toBe("playing");
    if (st.phase.kind !== "playing") throw new Error();
    expect(st.phase.trump).toBeNull();
    expect(st.phase.pitcher).toBe("N");

    // Inject a known hand for N so we control the first card
    st = {
      ...st,
      hands: { ...st.hands, N: [c("H", "A"), c("H", 5), c("D", 4), c("D", 2), c("C", 3), c("S", 7)] },
    };
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("H", "A") });
    if (st.phase.kind !== "playing") throw new Error();
    expect(st.phase.trump).toBe("H");
    expect(st.phase.trick.cards.length).toBe(1);
  });

  it("non-pitcher cannot lead the first card (only the pitcher sets trump)", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = { ...st, dealerSeat: "W", phase: { kind: "bidding", turn: "N", bids: {} } };
    st = reducer(st, { type: "BID", seat: "N", bid: 2 });
    st = reducer(st, { type: "BID", seat: "E", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "S", bid: "pass" });
    st = reducer(st, { type: "BID", seat: "W", bid: "pass" });
    st = {
      ...st,
      hands: {
        N: [c("H", "A")],
        E: [c("C", 5)], S: [c("D", 2)], W: [c("S", 7)],
      },
    };
    // E tries to play first even though N is the pitcher → refused
    const before = st;
    const refused = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 5) });
    expect(refused).toBe(before);
  });
});

describe("HiLoJack engine — M1b lastTrick visibility (40–43)", () => {
  it("case 40: lastTrick is null at the start of a hand", () => {
    let st = initialState("g", 1);
    st = joinAll(st);
    st = reducer(st, { type: "START_HAND" });
    expect(st.lastTrick).toBeNull();
  });

  it("case 41: lastTrick holds the just-resolved trick after RESOLVE_TRICK", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A"), c("C", "K")], E: [c("C", 8), c("C", 9)],
        S: [c("D", 2), c("D", 3)], W: [c("S", 2), c("S", 3)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    st = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 8) });
    st = reducer(st, { type: "PLAY_CARD", seat: "S", card: c("D", 2) });
    st = reducer(st, { type: "PLAY_CARD", seat: "W", card: c("S", 2) });
    st = reducer(st, { type: "RESOLVE_TRICK" });
    expect(st.lastTrick).not.toBeNull();
    expect(st.lastTrick?.winner).toBe("W"); // W trumped in
    expect(st.lastTrick?.cards.length).toBe(4);
  });

  it("case 42: lastTrick is replaced by the second resolved trick; the first is gone", () => {
    let st = craftPlayingState({
      hands: {
        N: [c("C", "A"), c("C", "K")], E: [c("C", 8), c("C", 9)],
        S: [c("D", 2), c("D", 3)], W: [c("S", 2), c("S", 3)],
      },
      trump: "S", pitcher: "N", bid: 2,
    });
    // first trick: W wins by trumping
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "A") });
    st = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 8) });
    st = reducer(st, { type: "PLAY_CARD", seat: "S", card: c("D", 2) });
    st = reducer(st, { type: "PLAY_CARD", seat: "W", card: c("S", 2) });
    st = reducer(st, { type: "RESOLVE_TRICK" });
    const firstSnapshot = st.lastTrick;
    expect(firstSnapshot?.winner).toBe("W");

    // second trick: W leads
    st = reducer(st, { type: "PLAY_CARD", seat: "W", card: c("S", 3) });
    st = reducer(st, { type: "PLAY_CARD", seat: "N", card: c("C", "K") });
    st = reducer(st, { type: "PLAY_CARD", seat: "E", card: c("C", 9) });
    st = reducer(st, { type: "PLAY_CARD", seat: "S", card: c("D", 3) });
    st = reducer(st, { type: "RESOLVE_TRICK" });
    expect(st.lastTrick).not.toBeNull();
    expect(st.lastTrick).not.toBe(firstSnapshot);
    // The first trick's contents are not retrievable anywhere — only the latest remains.
    const cardSuitRanks = st.lastTrick!.cards.map((p) => `${p.card.suit}${p.card.rank}`);
    expect(cardSuitRanks).toContain("S3");
    expect(cardSuitRanks).not.toContain("CA"); // (CA) was from the first trick
  });

  it("case 43: lastTrick resets to null on new START_HAND", () => {
    // craft a scoring state with applied=true and lastTrick set
    let st = initialState("g", 1);
    st = joinAll(st);
    st = {
      ...st,
      lastTrick: { cards: [{ seat: "N", card: c("C", "A") }], winner: "N" },
      phase: {
        kind: "scoring", trump: "S", pitcher: "N", bid: 2, handLog: [],
        deltas: { NS: 2, EW: 0 }, pitcherMadeBid: true, applied: true,
      },
    };
    const next = reducer(st, { type: "START_HAND" });
    expect(next.lastTrick).toBeNull();
  });
});

describe("HiLoJack engine — M1b score progression and must-pitch-to-win (44–50)", () => {
  it("case 44: NS at 20, bids 2, captures 1 → −2 → 18", () => {
    const st = craftScoringState({
      scoreNS: 20, scoreEW: 0, pitcher: "N", bid: 2,
      deltas: { NS: -2, EW: 3 }, pitcherMadeBid: false,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(18);
    expect(next.phase.kind).not.toBe("gameOver");
  });

  it("case 45: NS at 19, bids 2, captures 2 → 21, wins", () => {
    const st = craftScoringState({
      scoreNS: 19, scoreEW: 0, pitcher: "N", bid: 2,
      deltas: { NS: 2, EW: 0 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(21);
    expect(next.phase.kind).toBe("gameOver");
  });

  it("case 46: NS at 18, bids 2, captures 4 (overperformance) → 22, wins", () => {
    const st = craftScoringState({
      scoreNS: 18, scoreEW: 0, pitcher: "N", bid: 2,
      deltas: { NS: 4, EW: 0 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(22);
    expect(next.phase.kind).toBe("gameOver");
  });

  it("case 47: non-pitcher above target; pitcher (other team) lands below target → game continues", () => {
    const st = craftScoringState({
      scoreNS: 30, scoreEW: 5, pitcher: "E", bid: 3,
      deltas: { NS: 0, EW: 3 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.EW).toBe(8);
    expect(next.phase.kind).not.toBe("gameOver");
  });

  it("case 48: previously above-target team pitches and fails → drops but game continues", () => {
    const st = craftScoringState({
      scoreNS: 30, scoreEW: 0, pitcher: "N", bid: 2,
      deltas: { NS: -2, EW: 0 }, pitcherMadeBid: false,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(28);
    expect(next.phase.kind).not.toBe("gameOver");
  });

  it("case 49: previously above-target team finally pitches and makes → wins", () => {
    const st = craftScoringState({
      scoreNS: 30, scoreEW: 0, pitcher: "N", bid: 2,
      deltas: { NS: 2, EW: 0 }, pitcherMadeBid: true,
    });
    const next = reducer(st, { type: "SCORE_HAND" });
    expect(next.score.NS).toBe(32);
    expect(next.phase.kind).toBe("gameOver");
    if (next.phase.kind === "gameOver") expect(next.phase.winner).toBe("NS");
  });

  it("case 50: two consecutive failed bids drop score from +1 to −5", () => {
    let st = craftScoringState({
      scoreNS: 1, scoreEW: 0, pitcher: "N", bid: 3,
      deltas: { NS: -3, EW: 4 }, pitcherMadeBid: false,
    });
    st = reducer(st, { type: "SCORE_HAND" });
    expect(st.score.NS).toBe(-2);
    // Set up a second failed bid
    const st2 = {
      ...st,
      phase: {
        kind: "scoring" as const,
        trump: "S" as Suit, pitcher: "N" as Seat, bid: 3 as BidAmount, handLog: [],
        deltas: { NS: -3, EW: 4 },
        pitcherMadeBid: false,
        applied: false,
      },
    };
    const after = reducer(st2, { type: "SCORE_HAND" });
    expect(after.score.NS).toBe(-5);
  });
});

describe("HiLoJack engine — M1b dealer rotation and determinism (51, 52)", () => {
  it("case 51: dealer rotates one seat clockwise after each scored hand", () => {
    let st = initialState("g", 7);
    st = joinAll(st);
    expect(st.dealerSeat).toBe("N");
    st = reducer(st, { type: "START_HAND" });
    // Force scoring phase with applied=true
    st = {
      ...st,
      phase: {
        kind: "scoring", trump: "S", pitcher: "N", bid: 2, handLog: [],
        deltas: { NS: 2, EW: 0 }, pitcherMadeBid: true, applied: true,
      },
    };
    st = reducer(st, { type: "START_HAND" });
    expect(st.dealerSeat).toBe("E");
    st = {
      ...st,
      phase: {
        kind: "scoring", trump: "S", pitcher: "E", bid: 2, handLog: [],
        deltas: { NS: 0, EW: 2 }, pitcherMadeBid: true, applied: true,
      },
    };
    st = reducer(st, { type: "START_HAND" });
    expect(st.dealerSeat).toBe("S");
  });

  it("case 52: replay determinism — same seed + same actions → same final state", () => {
    function runOnce(seed: number) {
      let st = initialState("g", seed);
      st = joinAll(st);
      st = reducer(st, { type: "START_HAND" });
      // Everyone passes except dealer (stuck at 2)
      if (st.phase.kind !== "bidding") throw new Error();
      let cursor = st.phase.turn;
      const next: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };
      for (let i = 0; i < 4; i++) {
        if (cursor === st.dealerSeat) {
          st = reducer(st, { type: "BID", seat: cursor, bid: 2 });
        } else {
          st = reducer(st, { type: "BID", seat: cursor, bid: "pass" });
        }
        cursor = next[cursor];
      }
      // House rule: no explicit CHOOSE_TRUMP — pitcher's first card sets trump.
      for (let t = 0; t < 6; t++) {
        for (let i = 0; i < 4; i++) {
          if (st.phase.kind !== "playing") throw new Error();
          const turnSeat: Seat =
            st.phase.trick.cards.length === 0
              ? st.phase.trick.leader
              : next[st.phase.trick.cards[st.phase.trick.cards.length - 1].seat];
          const hand = st.hands[turnSeat];
          const legal = legalPlays(hand, st.phase.trick.cards, st.phase.trump);
          st = reducer(st, { type: "PLAY_CARD", seat: turnSeat, card: legal[0] });
        }
        st = reducer(st, { type: "RESOLVE_TRICK" });
      }
      return st;
    }
    const a = runOnce(12345);
    const b = runOnce(12345);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("HiLoJack engine — property test: 100 random hands behave sanely", () => {
  it("plays 100 random hands without violating invariants", () => {
    const next: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };
    for (let seed = 1; seed <= 100; seed++) {
      let st = initialState("p", seed);
      st = joinAll(st);
      st = reducer(st, { type: "START_HAND" });
      if (st.phase.kind !== "bidding") throw new Error("expected bidding");

      // Bid: each player passes; dealer is stuck at 2.
      let cursor = st.phase.turn;
      for (let i = 0; i < 4; i++) {
        if (cursor === st.dealerSeat) {
          st = reducer(st, { type: "BID", seat: cursor, bid: 2 });
        } else {
          st = reducer(st, { type: "BID", seat: cursor, bid: "pass" });
        }
        cursor = next[cursor];
      }
      if (st.phase.kind !== "playing") throw new Error("expected playing (trump-by-first-lead)");
      const pitcher = st.phase.pitcher;

      for (let t = 0; t < 6; t++) {
        for (let i = 0; i < 4; i++) {
          if (st.phase.kind !== "playing") throw new Error("expected playing");
          const turnSeat: Seat =
            st.phase.trick.cards.length === 0
              ? st.phase.trick.leader
              : next[st.phase.trick.cards[st.phase.trick.cards.length - 1].seat];
          const hand = st.hands[turnSeat];
          const legal = legalPlays(hand, st.phase.trick.cards, st.phase.trump);
          expect(legal.length).toBeGreaterThan(0);
          // pick a "random" legal card based on seed
          const pick = legal[(seed + t * 4 + i) % legal.length];
          const before = st;
          st = reducer(st, { type: "PLAY_CARD", seat: turnSeat, card: pick });
          expect(st).not.toBe(before); // accepted
        }
        st = reducer(st, { type: "RESOLVE_TRICK" });
      }
      expect(st.phase.kind).toBe("scoring");
      if (st.phase.kind === "scoring") {
        // pitcher's delta is one of: -4, -bid, bidPts (>=bid for made), 0..4
        const pitcherTeam = teamOf(pitcher);
        const oppTeam = pitcherTeam === "NS" ? "EW" : "NS";
        const pd = st.phase.deltas[pitcherTeam];
        const od = st.phase.deltas[oppTeam];
        expect([-4, -2, -3, 2, 3, 4, 5]).toContain(pd);
        expect(od).toBeGreaterThanOrEqual(0);
        expect(od).toBeLessThanOrEqual(4);
      }
    }
  });
});

// ----- Smoke: a complete hand transitions correctly through phases -----

describe("HiLoJack engine — smoke: full hand end-to-end", () => {
  it("plays one hand from lobby → scoring without panicking", () => {
    let st = initialState("smoke", 42);
    st = joinAll(st);
    st = reducer(st, { type: "START_HAND" });
    expect(st.phase.kind).toBe("bidding");

    // Everyone passes; dealer (N) is stuck at 2.
    if (st.phase.kind !== "bidding") throw new Error("unreachable");
    const firstBidder = st.phase.turn;
    const order: Seat[] = [];
    let cursor = firstBidder;
    for (let i = 0; i < 4; i++) {
      order.push(cursor);
      cursor = ({ N: "E", E: "S", S: "W", W: "N" } as Record<Seat, Seat>)[cursor];
    }
    for (const seat of order) {
      if (seat === st.dealerSeat) {
        st = reducer(st, { type: "BID", seat, bid: 2 });
      } else {
        st = reducer(st, { type: "BID", seat, bid: "pass" });
      }
    }
    expect(st.phase.kind).toBe("playing");
    // House rule: trump starts null; the pitcher's first card will set it.
    if (st.phase.kind !== "playing") throw new Error("unreachable");
    expect(st.phase.trump).toBeNull();

    // Play 6 tricks naively: each player plays their first legal card.
    for (let trick = 0; trick < 6; trick++) {
      for (let i = 0; i < 4; i++) {
        if (st.phase.kind !== "playing") throw new Error("phase changed mid-trick");
        const turnSeat: Seat =
          st.phase.trick.cards.length === 0
            ? st.phase.trick.leader
            : ({ N: "E", E: "S", S: "W", W: "N" } as Record<Seat, Seat>)[
                st.phase.trick.cards[st.phase.trick.cards.length - 1].seat
              ];
        const hand = st.hands[turnSeat];
        const legal = legalPlays(hand, st.phase.trick.cards, st.phase.trump);
        st = reducer(st, { type: "PLAY_CARD", seat: turnSeat, card: legal[0] });
      }
      st = reducer(st, { type: "RESOLVE_TRICK" });
    }
    expect(st.phase.kind).toBe("scoring");
    if (st.phase.kind === "scoring") {
      // Sum of deltas equals total points awarded that hand (between 0 and 5 depending on outcome).
      const totalDelta = st.phase.deltas.NS + st.phase.deltas.EW;
      // 5-bid success: 5. Regular made or failed: between -bid and 4.
      expect(totalDelta).toBeGreaterThanOrEqual(-4);
      expect(totalDelta).toBeLessThanOrEqual(5);
    }
  });
});

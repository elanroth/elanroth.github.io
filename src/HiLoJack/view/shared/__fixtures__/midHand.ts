import type { Card, GameState, Seat, Suit, Rank } from "../../../engine/types";
import { initialState } from "../../../engine/reducer";

// Deterministic fixtures used by all three skins during M2 to render every phase
// without needing a real Firebase connection.

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

function withPlayers(s: GameState): GameState {
  return {
    ...s,
    players: {
      N: { uid: "uN", nickname: "Riley" },
      E: { uid: "uE", nickname: "Sam" },
      S: { uid: "uS", nickname: "You" },
      W: { uid: "uW", nickname: "Avery" },
    },
  };
}

function withHands(s: GameState): GameState {
  return {
    ...s,
    hands: {
      N: [c("S", "A"), c("S", "K"), c("H", "A"), c("H", 10), c("C", 9), c("D", 4)],
      E: [c("S", 9), c("S", 5), c("H", "J"), c("C", "A"), c("C", 7), c("D", "K")],
      S: [c("S", "Q"), c("S", "J"), c("H", "K"), c("H", 7), c("C", 10), c("D", "A")],
      W: [c("S", 10), c("S", 4), c("H", 8), c("C", "K"), c("C", 5), c("D", 8)],
    },
  };
}

export const FIXTURE_LOBBY: GameState = withPlayers(initialState("fixture", 7));

export const FIXTURE_BIDDING: GameState = {
  ...withHands(withPlayers(initialState("fixture", 7))),
  phase: {
    kind: "bidding",
    turn: "S",
    bids: { N: 2, E: "pass" },
  },
};

// Opening lead: bidding is done; pitcher (S) is about to play the first card,
// which under our house rule will become trump. trump is null until then.
export const FIXTURE_OPENING_LEAD: GameState = {
  ...withHands(withPlayers(initialState("fixture", 7))),
  phase: {
    kind: "playing",
    trump: null,
    pitcher: "S",
    bid: 3,
    handLog: [],
    trick: { leader: "S", winner: null, cards: [] },
  },
};

// Playing: we are mid-trick. Two cards have been played to the table. The local user is up.
// lastTrick contains a completed previous trick (so the last-trick affordance has content).
export const FIXTURE_PLAYING: GameState = {
  ...withHands(withPlayers(initialState("fixture", 7))),
  lastTrick: {
    winner: "S",
    cards: [
      { seat: "W", card: c("H", 9) },
      { seat: "N", card: c("H", 2) },
      { seat: "E", card: c("H", 6) },
      { seat: "S", card: c("S", 8) }, // local user trumped in last trick
    ],
  },
  wonTricks: {
    NS: [c("H", 9), c("H", 2), c("H", 6), c("S", 8)],
    EW: [],
  },
  phase: {
    kind: "playing",
    trump: "S",
    pitcher: "S",
    bid: 3,
    handLog: [
      {
        winner: "S",
        cards: [
          { seat: "W", card: c("H", 9) },
          { seat: "N", card: c("H", 2) },
          { seat: "E", card: c("H", 6) },
          { seat: "S", card: c("S", 8) },
        ],
      },
    ],
    trick: {
      leader: "S",
      winner: null,
      cards: [
        { seat: "N", card: c("C", 9) },
        { seat: "E", card: c("C", "A") },
      ],
    },
  },
};

// Scoring: pitcher (NS) made their bid of 3 by exactly 3. Hand has been resolved; awaiting SCORE_HAND.
export const FIXTURE_SCORING: GameState = {
  ...withHands(withPlayers(initialState("fixture", 7))),
  hands: { N: [], E: [], S: [], W: [] },
  score: { NS: 9, EW: 7 },
  lastTrick: {
    winner: "S",
    cards: [
      { seat: "W", card: c("D", 8) },
      { seat: "N", card: c("D", 4) },
      { seat: "E", card: c("D", "K") },
      { seat: "S", card: c("S", "J") },
    ],
  },
  phase: {
    kind: "scoring",
    trump: "S",
    pitcher: "S",
    bid: 3,
    handLog: [],
    deltas: { NS: 3, EW: 1 },
    pitcherMadeBid: true,
    applied: false,
  },
};

export const FIXTURE_GAMEOVER: GameState = {
  ...withPlayers(initialState("fixture", 7)),
  score: { NS: 22, EW: 18 },
  phase: { kind: "gameOver", winner: "NS" },
};

export const FIXTURES = {
  lobby: FIXTURE_LOBBY,
  bidding: FIXTURE_BIDDING,
  openingLead: FIXTURE_OPENING_LEAD,
  playing: FIXTURE_PLAYING,
  scoring: FIXTURE_SCORING,
  gameOver: FIXTURE_GAMEOVER,
} as const;

export type FixturePhase = keyof typeof FIXTURES;

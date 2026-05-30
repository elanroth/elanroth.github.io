// MODEL — types only, no React, no Firebase, no I/O.
// Read EXECPLAN.md §4.2 for the design contract these types implement.

export type Suit = "C" | "D" | "H" | "S";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "J" | "Q" | "K" | "A";
export type Card = { suit: Suit; rank: Rank };
export type Seat = "N" | "E" | "S" | "W";
export type Team = "NS" | "EW";

export const SUITS: readonly Suit[] = ["C", "D", "H", "S"] as const;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"] as const;
export const SEATS: readonly Seat[] = ["N", "E", "S", "W"] as const;

export type Bid = "pass" | 2 | 3 | 4 | 5;
export type BidAmount = 2 | 3 | 4 | 5;

export type PlayedCard = { seat: Seat; card: Card };
export type TrickRecord = { cards: PlayedCard[]; winner: Seat };

export type Phase =
  | { kind: "lobby" }
  | { kind: "bidding"; turn: Seat; bids: Partial<Record<Seat, Bid>> }
  | {
      kind: "playing";
      trick: { cards: PlayedCard[]; leader: Seat; winner: Seat | null };
      // Per Elan's house rule: the pitcher's first card of the first trick
      // BECOMES trump. So trump is `null` until that card is played, then
      // locked for the rest of the hand. See §3 of EXECPLAN.
      trump: Suit | null;
      pitcher: Seat;
      bid: BidAmount;
      handLog: TrickRecord[];
    }
  | {
      kind: "scoring";
      trump: Suit;
      pitcher: Seat;
      bid: BidAmount;
      handLog: TrickRecord[];
      deltas: Record<Team, number>;
      pitcherMadeBid: boolean;
      applied: boolean;
    }
  | { kind: "gameOver"; winner: Team };

export type GameState = {
  gameId: string;
  players: Record<Seat, { uid: string; nickname: string } | null>;
  hands: Record<Seat, Card[]>;
  wonTricks: Record<Team, Card[]>;
  lastTrick: TrickRecord | null;   // only the immediately previous trick — see EXECPLAN cases 40–43
  score: Record<Team, number>;
  targetScore: 7 | 11 | 21;
  phase: Phase;
  dealerSeat: Seat;
  randomSeed: number;
  handsPlayed: number;
};

export type Action =
  | { type: "JOIN_SEAT"; seat: Seat; uid: string; nickname: string }
  | { type: "START_HAND" }
  | { type: "BID"; seat: Seat; bid: Bid }
  | { type: "PLAY_CARD"; seat: Seat; card: Card }
  | { type: "RESOLVE_TRICK" }
  | { type: "SCORE_HAND" }
  | { type: "SET_OPTIONS"; targetScore?: 7 | 11 | 21 }
  | { type: "LEAVE_SEAT"; seat: Seat; uid: string };

export function teamOf(seat: Seat): Team {
  return seat === "N" || seat === "S" ? "NS" : "EW";
}

export function partnerOf(seat: Seat): Seat {
  return ({ N: "S", S: "N", E: "W", W: "E" } as Record<Seat, Seat>)[seat];
}

export function nextSeatCW(seat: Seat): Seat {
  return ({ N: "E", E: "S", S: "W", W: "N" } as Record<Seat, Seat>)[seat];
}

export function otherTeam(t: Team): Team {
  return t === "NS" ? "EW" : "NS";
}

export function cardEq(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

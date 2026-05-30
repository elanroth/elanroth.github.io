import {
  Action, Bid, BidAmount, Card, GameState, PlayedCard, Seat, SEATS, Suit, TrickRecord,
  cardEq, nextSeatCW, teamOf,
} from "./types";
import { newDeck, shuffle } from "./deck";
import { legalPlays, winnerOfTrick } from "./rules";
import { computeDeltas, scoreHand } from "./scoring";

export function initialState(gameId: string, seed: number): GameState {
  return {
    gameId,
    players: { N: null, E: null, S: null, W: null },
    hands: { N: [], E: [], S: [], W: [] },
    wonTricks: { NS: [], EW: [] },
    lastTrick: null,
    score: { NS: 0, EW: 0 },
    targetScore: 21,
    phase: { kind: "lobby" },
    dealerSeat: "N",
    randomSeed: seed,
    handsPlayed: 0,
  };
}

const VALID_BIDS: readonly Bid[] = ["pass", 2, 3, 4, 5] as const;

function seedForHand(randomSeed: number, handIdx: number): number {
  // XOR with a Weyl-constant-multiplied index. Deterministic across runs.
  return (randomSeed ^ (((handIdx + 1) * 0x9e3779b1) | 0)) >>> 0;
}

function allFourSeated(state: GameState): boolean {
  return SEATS.every((s) => state.players[s] !== null);
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SET_OPTIONS": {
      const next: GameState = { ...state };
      if (action.targetScore !== undefined) next.targetScore = action.targetScore;
      return next;
    }

    case "JOIN_SEAT": {
      if (state.phase.kind !== "lobby") return state;
      if (state.players[action.seat]) return state;
      return {
        ...state,
        players: {
          ...state.players,
          [action.seat]: { uid: action.uid, nickname: action.nickname },
        },
      };
    }

    case "LEAVE_SEAT": {
      if (state.phase.kind !== "lobby") return state;
      const occupant = state.players[action.seat];
      if (!occupant || occupant.uid !== action.uid) return state;
      return {
        ...state,
        players: { ...state.players, [action.seat]: null },
      };
    }

    case "START_HAND": {
      if (state.phase.kind !== "lobby" && state.phase.kind !== "scoring") return state;
      if (state.phase.kind === "scoring" && !state.phase.applied) return state;
      if (!allFourSeated(state)) return state;

      const dealer =
        state.phase.kind === "scoring" ? nextSeatCW(state.dealerSeat) : state.dealerSeat;
      const seed = seedForHand(state.randomSeed, state.handsPlayed);
      const deck = shuffle(newDeck(), seed);
      const hands: Record<Seat, Card[]> = {
        N: deck.slice(0, 6),
        E: deck.slice(6, 12),
        S: deck.slice(12, 18),
        W: deck.slice(18, 24),
      };
      return {
        ...state,
        hands,
        wonTricks: { NS: [], EW: [] },
        lastTrick: null,
        dealerSeat: dealer,
        phase: { kind: "bidding", turn: nextSeatCW(dealer), bids: {} },
      };
    }

    case "BID": {
      if (state.phase.kind !== "bidding") return state;
      if (state.phase.turn !== action.seat) return state;
      if (!VALID_BIDS.includes(action.bid)) return state;

      // Dealer-stuck: if it's dealer's turn and all 3 prior passed, "pass" is illegal.
      const priorBids = state.phase.bids;
      const numPrior = Object.keys(priorBids).length;
      const allPriorPassed = Object.values(priorBids).every((b) => b === "pass");
      const isDealersTurn = action.seat === state.dealerSeat;
      if (isDealersTurn && numPrior === 3 && allPriorPassed && action.bid === "pass") {
        return state;
      }

      // A non-pass bid must strictly exceed the current high non-pass bid.
      const priorNumeric = Object.values(priorBids).filter((b) => b !== "pass") as BidAmount[];
      const high = priorNumeric.length > 0 ? Math.max(...priorNumeric) : 1;
      if (action.bid !== "pass" && action.bid <= high) return state;

      const bids = { ...priorBids, [action.seat]: action.bid };
      if (Object.keys(bids).length < 4) {
        return {
          ...state,
          phase: { ...state.phase, turn: nextSeatCW(state.phase.turn), bids },
        };
      }

      // All 4 have bid — pick pitcher.
      const numericEntries = (Object.entries(bids) as [Seat, Bid][]).filter(
        ([, b]) => b !== "pass",
      ) as [Seat, BidAmount][];

      let pitcher: Seat;
      let bidAmount: BidAmount;
      if (numericEntries.length === 0) {
        // Shouldn't actually reach here because dealer-stuck blocks dealer's pass.
        pitcher = state.dealerSeat;
        bidAmount = 2;
      } else {
        numericEntries.sort((a, b) => b[1] - a[1]);
        pitcher = numericEntries[0][0];
        bidAmount = numericEntries[0][1];
      }

      // Per house rule: pitcher's first card of the first trick BECOMES trump.
      // So we go directly from bidding into the playing phase with trump = null.
      return {
        ...state,
        phase: {
          kind: "playing",
          trick: { cards: [], leader: pitcher, winner: null },
          trump: null,
          pitcher,
          bid: bidAmount,
          handLog: [],
        },
      };
    }

    case "PLAY_CARD": {
      if (state.phase.kind !== "playing") return state;
      const { trick, trump: oldTrump } = state.phase;
      if (trick.cards.length === 4) return state; // waiting on RESOLVE_TRICK

      const turnSeat: Seat =
        trick.cards.length === 0
          ? trick.leader
          : nextSeatCW(trick.cards[trick.cards.length - 1].seat);
      if (turnSeat !== action.seat) return state;

      const hand = state.hands[action.seat];
      const idx = hand.findIndex((c) => cardEq(c, action.card));
      if (idx < 0) return state;

      // House rule: if trump isn't set yet, this must be the pitcher leading the
      // first trick. Any card is legal — and the card played IS trump going forward.
      const isSettingTrump = oldTrump === null;
      if (isSettingTrump) {
        // Sanity: only the pitcher should be leading the first trick.
        if (trick.cards.length !== 0 || action.seat !== state.phase.pitcher) return state;
      } else {
        const legal = legalPlays(hand, trick.cards, oldTrump);
        if (!legal.some((c) => cardEq(c, action.card))) return state;
      }

      const newTrump: Suit = isSettingTrump ? action.card.suit : oldTrump;
      const newHand = hand.slice(0, idx).concat(hand.slice(idx + 1));
      const newCards: PlayedCard[] = trick.cards.concat([
        { seat: action.seat, card: action.card },
      ]);
      const winner = newCards.length === 4 ? winnerOfTrick(newCards, newTrump) : null;

      return {
        ...state,
        hands: { ...state.hands, [action.seat]: newHand },
        phase: {
          ...state.phase,
          trump: newTrump,
          trick: { ...trick, cards: newCards, winner },
        },
      };
    }

    case "RESOLVE_TRICK": {
      if (state.phase.kind !== "playing") return state;
      const { trick, trump, pitcher, bid, handLog } = state.phase;
      if (trick.cards.length !== 4 || trick.winner === null) return state;
      // By the time a full trick is resolved, the first card has set trump.
      // If for some reason trump is still null we cannot resolve safely — bail.
      if (trump === null) return state;

      const winner = trick.winner;
      const wTeam = teamOf(winner);
      const cards = trick.cards.map((p) => p.card);
      const newWon = {
        ...state.wonTricks,
        [wTeam]: state.wonTricks[wTeam].concat(cards),
      };
      const completedTrick: TrickRecord = { cards: trick.cards.slice(), winner };
      const newLog = handLog.concat([completedTrick]);

      const handsRemaining =
        state.hands.N.length + state.hands.E.length + state.hands.S.length + state.hands.W.length;

      if (handsRemaining === 0) {
        // Last trick of the hand — compute deltas, move to scoring.
        const hp = scoreHand(newLog, trump);
        const pitcherTeam = teamOf(pitcher);
        const sweptAll = newLog.every((t) => teamOf(t.winner) === pitcherTeam);
        const { deltas, pitcherMadeBid } = computeDeltas(hp, pitcherTeam, bid, sweptAll);
        return {
          ...state,
          wonTricks: newWon,
          lastTrick: completedTrick,
          phase: {
            kind: "scoring",
            trump,
            pitcher,
            bid,
            handLog: newLog,
            deltas,
            pitcherMadeBid,
            applied: false,
          },
        };
      }

      return {
        ...state,
        wonTricks: newWon,
        lastTrick: completedTrick,
        phase: {
          kind: "playing",
          trick: { cards: [], leader: winner, winner: null },
          trump,
          pitcher,
          bid,
          handLog: newLog,
        },
      };
    }

    case "SCORE_HAND": {
      if (state.phase.kind !== "scoring") return state;
      if (state.phase.applied) return state;

      const { deltas, pitcher, pitcherMadeBid } = state.phase;
      const newScore: Record<"NS" | "EW", number> = {
        NS: state.score.NS + deltas.NS,
        EW: state.score.EW + deltas.EW,
      };
      const pitcherTeam = teamOf(pitcher);

      // Win condition per §3.9: pitcher's team made the bid AND their new score ≥ target.
      if (pitcherMadeBid && newScore[pitcherTeam] >= state.targetScore) {
        return {
          ...state,
          score: newScore,
          handsPlayed: state.handsPlayed + 1,
          phase: { kind: "gameOver", winner: pitcherTeam },
        };
      }

      return {
        ...state,
        score: newScore,
        handsPlayed: state.handsPlayed + 1,
        phase: { ...state.phase, applied: true },
      };
    }

    default:
      return state;
  }
}

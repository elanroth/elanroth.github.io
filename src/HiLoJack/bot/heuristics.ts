import type { Action, Bid, Card, GameState, PlayedCard, Seat, Suit } from "../engine/types";
import { partnerOf, teamOf } from "../engine/types";
import { legalPlays, rankValue } from "../engine/rules";

// Intentionally simple "v0" bots — see EXECPLAN §11 "deferred" for the future
// rewrite. The aim here is "good enough that the game flows and is not
// embarrassingly bad against a friend." It is NOT competitive.

function suitStrength(hand: Card[], suit: Suit): number {
  const inSuit = hand.filter((c) => c.suit === suit);
  let s = inSuit.length;
  for (const c of inSuit) {
    if (c.rank === "A") s += 2;
    else if (c.rank === "K") s += 1.5;
    else if (c.rank === "Q") s += 1;
    else if (c.rank === "J") s += 0.8;
    else if (c.rank === 10) s += 0.5;
  }
  return s;
}

export function pickBid(state: GameState, seat: Seat): Bid {
  if (state.phase.kind !== "bidding") return "pass";
  if (state.phase.turn !== seat) return "pass";

  // Dealer-stuck rule: dealer cannot pass after 3 passes
  const priorBids = state.phase.bids;
  const numPrior = Object.keys(priorBids).length;
  const allPriorPassed = Object.values(priorBids).every((b) => b === "pass");
  const isDealerStuck = seat === state.dealerSeat && numPrior === 3 && allPriorPassed;

  const hand = state.hands[seat];
  const suits: Suit[] = ["C", "D", "H", "S"];
  const strengths = suits.map((s) => suitStrength(hand, s));
  const best = Math.max(...strengths);

  const priorNumeric = Object.values(priorBids).filter((b) => b !== "pass") as number[];
  const high = priorNumeric.length ? Math.max(...priorNumeric) : 1;

  // Thresholds (conservative — v0 bots will rarely bid 4 or 5)
  if (best >= 9 && high < 4) return 4;
  if (best >= 7 && high < 3) return 3;
  if (best >= 5 && high < 2) return 2;
  if (isDealerStuck) return 2;
  return "pass";
}

// Pick the bot's preferred trump suit (used by the opening-lead heuristic since
// the first card determines trump under our house rule).
export function pickTrump(state: GameState, seat: Seat): Suit {
  const hand = state.hands[seat];
  const suits: Suit[] = ["C", "D", "H", "S"];
  let best: Suit = "S";
  let bestScore = -1;
  for (const s of suits) {
    const score = suitStrength(hand, s);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

// "Strength" of a card given a lead suit and trump — higher = stronger play.
// Trumps always beat the lead suit; non-trumps off-suit can't win (sluff).
function strengthInTrick(card: Card, leadSuit: Suit, trump: Suit): number {
  if (card.suit === trump) return 100 + rankValue(card.rank);
  if (card.suit === leadSuit) return rankValue(card.rank);
  return -1;
}

function currentWinnerOfPartial(trick: PlayedCard[], trump: Suit): { seat: Seat; strength: number } | null {
  if (trick.length === 0) return null;
  const leadSuit = trick[0].card.suit;
  let best: { seat: Seat; strength: number } | null = null;
  for (const p of trick) {
    const s = strengthInTrick(p.card, leadSuit, trump);
    if (s < 0) continue;
    if (!best || s > best.strength) best = { seat: p.seat, strength: s };
  }
  return best;
}

export function pickCard(state: GameState, seat: Seat): Card {
  if (state.phase.kind !== "playing") {
    throw new Error(`pickCard called in phase ${state.phase.kind}`);
  }
  const hand = state.hands[seat];
  const trumpMaybe = state.phase.trump;
  const trick = state.phase.trick.cards;

  // SPECIAL: opening lead of the hand. Trump is not yet set — whatever we play
  // here BECOMES trump. Pick the highest card of our strongest suit so that:
  //   (a) trump lands in our best suit,
  //   (b) we likely win the first trick (capturing High and Game-pip lead),
  //   (c) we start "pulling trumps" out of opponents' hands.
  if (trick.length === 0 && trumpMaybe === null) {
    const preferred = pickTrump(state, seat);
    const inSuit = hand.filter((c) => c.suit === preferred);
    const pool = inSuit.length > 0 ? inSuit : hand;
    return [...pool].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
  }

  const trump = trumpMaybe as Suit; // safe past the first-card check
  const legal = legalPlays(hand, trick, trump);
  if (legal.length === 0) throw new Error("no legal plays");

  // 1) Leading a non-opening trick: if we hold trumps, lead the HIGHEST trump
  //    (per Elan's note "play trumps from highest to lowest"). This pulls
  //    trumps out of opponents' hands. If we have no trump, lead the lowest
  //    non-trump (save what little we have).
  if (trick.length === 0) {
    const myTrumps = legal.filter((c) => c.suit === trump);
    if (myTrumps.length > 0) {
      return [...myTrumps].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
    }
    return [...legal].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
  }

  // 2) Following: check who's currently winning the trick
  const leadSuit = trick[0].card.suit;
  const current = currentWinnerOfPartial(trick, trump);

  // If partner is currently winning, dump the lowest legal card (don't overtake them)
  if (current && teamOf(current.seat) === teamOf(seat)) {
    return [...legal].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
  }

  // Otherwise — opponent is winning (or no winner yet). Try to overtake with the
  // LOWEST winning card we have; else dump our lowest card.
  const candidates = legal.map((c) => ({
    card: c,
    strength: strengthInTrick(c, leadSuit, trump),
  }));
  const winning = candidates.filter((m) => current === null || m.strength > current.strength);
  if (winning.length > 0) {
    winning.sort((a, b) => a.strength - b.strength);
    return winning[0].card;
  }
  return [...legal].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
}

// Top-level dispatcher: given a current state, what action (if any) should a bot
// occupying `seat` take right now?
//
// Returns `null` if it's not this bot's turn. The caller is responsible for
// debouncing so this doesn't fire repeatedly on identical state.
export function pickAction(state: GameState, seat: Seat): Action | null {
  switch (state.phase.kind) {
    case "bidding":
      if (state.phase.turn !== seat) return null;
      return { type: "BID", seat, bid: pickBid(state, seat) };
    case "playing": {
      const trick = state.phase.trick;
      // After 4 cards have been played, RESOLVE_TRICK advances; any bot can fire it.
      if (trick.cards.length === 4) return { type: "RESOLVE_TRICK" };
      const turnSeat: Seat =
        trick.cards.length === 0
          ? trick.leader
          : ({ N: "E", E: "S", S: "W", W: "N" } as Record<Seat, Seat>)[
              trick.cards[trick.cards.length - 1].seat
            ];
      if (turnSeat !== seat) return null;
      return { type: "PLAY_CARD", seat, card: pickCard(state, seat) };
    }
    case "scoring":
      // Any bot can fire the SCORE_HAND commit once.
      if (!state.phase.applied) return { type: "SCORE_HAND" };
      return null;
    default:
      return null;
  }
}

// Helper used by the React driver: of the set of bot seats, find the first one
// that has a useful action right now. We collapse RESOLVE_TRICK / SCORE_HAND
// (which any seat can do) to the first bot in the set.
export function nextBotAction(
  state: GameState,
  botSeats: ReadonlySet<Seat>,
): { seat: Seat; action: Action } | null {
  if (botSeats.size === 0) return null;
  // Try each bot — for whose-turn actions, only the right seat returns non-null;
  // for global actions (RESOLVE_TRICK / SCORE_HAND), any bot will return them.
  for (const seat of botSeats) {
    const action = pickAction(state, seat);
    if (action) return { seat, action };
  }
  return null;
}

// Stable, deterministic uid for a bot at a given seat in a given game.
// Re-mounting the host's tab regenerates the same uid → /players claim is a no-op.
export function botUid(gameId: string, seat: Seat): string {
  return `bot-${seat}-${gameId}`;
}

export function botNickname(seat: Seat): string {
  return `Bot ${seat}`;
}

// Re-export some engine bits so tests can use them without a separate import
export { legalPlays, partnerOf };

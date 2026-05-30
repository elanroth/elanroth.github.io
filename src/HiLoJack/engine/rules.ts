import { Card, PlayedCard, Rank, Seat, Suit } from "./types";

const RANK_ORDER = new Map<Rank, number>([
  [2, 0], [3, 1], [4, 2], [5, 3], [6, 4], [7, 5], [8, 6], [9, 7], [10, 8],
  ["J", 9], ["Q", 10], ["K", 11], ["A", 12],
]);

export function rankValue(r: Rank): number {
  const v = RANK_ORDER.get(r);
  if (v === undefined) throw new Error(`unknown rank: ${String(r)}`);
  return v;
}

// Per §3.4 of EXECPLAN (Elan's house rule):
//   - Trump LEAD: you must play a trump if you have any; otherwise sluff anything.
//   - Non-trump LEAD, you HOLD the lead suit: you may follow suit OR trump in.
//   - Non-trump LEAD, you DON'T hold the lead suit: you may play ANY card
//     (you are NOT forced to play trump). This is the variant point — many
//     other Pitch rule sets force trump in this case; Elan's table does not.
//
// `trump` may be `null` only when this is the very first card of the first
// trick of a hand (the pitcher's lead sets trump). In that case the trick is
// empty too, so we return the full hand and never look at trump.
export function legalPlays(hand: Card[], trickCards: PlayedCard[], trump: Suit | null): Card[] {
  if (trickCards.length === 0) return hand.slice();
  if (trump === null) return hand.slice(); // defensive — should not occur in normal flow
  const leadSuit = trickCards[0].card.suit;

  if (leadSuit === trump) {
    // Trump led: must play trump if you have any
    const trumps = hand.filter((c) => c.suit === trump);
    return trumps.length > 0 ? trumps : hand.slice();
  }

  // Non-trump led
  const followers = hand.filter((c) => c.suit === leadSuit);
  if (followers.length > 0) {
    // You hold the lead suit — either follow suit OR trump in (both legal)
    const trumps = hand.filter((c) => c.suit === trump);
    return followers.concat(trumps);
  }
  // You don't hold the lead suit — house rule: play ANY card (not forced to trump)
  return hand.slice();
}

export function winnerOfTrick(cards: PlayedCard[], trump: Suit): Seat {
  if (cards.length !== 4) throw new Error("winnerOfTrick called on incomplete trick");
  const leadSuit = cards[0].card.suit;
  const trumps = cards.filter((p) => p.card.suit === trump);
  const pool = trumps.length > 0 ? trumps : cards.filter((p) => p.card.suit === leadSuit);
  let best = pool[0];
  for (const p of pool) {
    if (rankValue(p.card.rank) > rankValue(best.card.rank)) best = p;
  }
  return best.seat;
}

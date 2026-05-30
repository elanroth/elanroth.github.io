import { BidAmount, Rank, Suit, Team, TrickRecord, teamOf } from "./types";
import { rankValue } from "./rules";

// Game-point "pips" per §3.6 of EXECPLAN.
const PIPS: Record<string, number> = { "10": 10, A: 4, K: 3, Q: 2, J: 1 };

function pipsOf(rank: Rank): number {
  return PIPS[String(rank)] ?? 0;
}

export type HandPoints = {
  high: Team | null;
  low: Team | null;
  jack: Team | null;
  game: Team | null;
};

export function scoreHand(handLog: TrickRecord[], trump: Suit): HandPoints {
  let hi: { team: Team; v: number } | null = null;
  let lo: { team: Team; v: number } | null = null;
  let jack: Team | null = null;
  const pipsByTeam: Record<Team, number> = { NS: 0, EW: 0 };

  for (const t of handLog) {
    const wTeam = teamOf(t.winner);
    for (const p of t.cards) {
      const v = rankValue(p.card.rank);
      if (p.card.suit === trump) {
        if (!hi || v > hi.v) hi = { team: wTeam, v };
        if (!lo || v < lo.v) lo = { team: wTeam, v };
        if (p.card.rank === "J") jack = wTeam;
      }
      pipsByTeam[wTeam] += pipsOf(p.card.rank);
    }
  }

  let game: Team | null = null;
  if (pipsByTeam.NS > pipsByTeam.EW) game = "NS";
  else if (pipsByTeam.EW > pipsByTeam.NS) game = "EW";

  return {
    high: hi?.team ?? null,
    low: lo?.team ?? null,
    jack,
    game,
  };
}

export function pointsForTeam(p: HandPoints, team: Team): number {
  let n = 0;
  if (p.high === team) n++;
  if (p.low === team) n++;
  if (p.jack === team) n++;
  if (p.game === team) n++;
  return n;
}

export function availablePoints(p: HandPoints): number {
  let n = 0;
  if (p.high !== null) n++;
  if (p.low !== null) n++;
  if (p.jack !== null) n++;
  if (p.game !== null) n++;
  return n;
}

// Per §3.7 + §3.8 of EXECPLAN.
// Regular bid: made → +pointsForTeam(pitcher) and +pointsForTeam(opp); failed → -bid (pitcher), +oppPts (opp).
// 5 bid: succeeded (all tricks AND every point that exists) → +5 / 0; failed → -4 / +oppPts.
export function computeDeltas(
  hp: HandPoints,
  pitcherTeam: Team,
  bid: BidAmount,
  pitcherSweptAllTricks: boolean,
): { deltas: Record<Team, number>; pitcherMadeBid: boolean } {
  const oppTeam: Team = pitcherTeam === "NS" ? "EW" : "NS";
  const pitcherPts = pointsForTeam(hp, pitcherTeam);
  const oppPts = pointsForTeam(hp, oppTeam);

  if (bid === 5) {
    const avail = availablePoints(hp);
    const succeeded = pitcherSweptAllTricks && pitcherPts === avail;
    const deltas: Record<Team, number> = { NS: 0, EW: 0 };
    if (succeeded) {
      deltas[pitcherTeam] = 5;
      deltas[oppTeam] = 0;
    } else {
      deltas[pitcherTeam] = -4;
      deltas[oppTeam] = oppPts;
    }
    return { deltas, pitcherMadeBid: succeeded };
  }

  // Regular bid 2/3/4
  const made = pitcherPts >= bid;
  const deltas: Record<Team, number> = { NS: 0, EW: 0 };
  if (made) {
    deltas[pitcherTeam] = pitcherPts;
    deltas[oppTeam] = oppPts;
  } else {
    deltas[pitcherTeam] = -bid;
    deltas[oppTeam] = oppPts;
  }
  return { deltas, pitcherMadeBid: made };
}

// Skin B — Top-Down Minimal.
// See EXECPLAN.md §5 ("Skin B — Top-Down Minimal" / flat schematic) and §6 (this file is owned
// by Track V-B; only `view/shared/` may be extended, and only in backward-compatible ways).
//
// Aesthetic: pure top-down, zero perspective. White / very pale background, thin black borders,
// large rank glyphs, small suit pip, sans-serif. Looks like a printable rulebook diagram.
// No shadows, no felt, no 3D. Only animation is a simple slide-in for cards landing in the trick.

import type { CSSProperties } from "react";
import type {
  Action,
  Card as CardT,
  PlayedCard,
  Seat,
  Suit,
} from "../engine/types";
import { SEATS } from "../engine/types";
import { legalPlays } from "../engine/rules";
import type { SkinProps } from "./shared/SkinProps";
import { relPos, rotationFor } from "./shared/orientation";
import { ScoreBoard } from "./shared/ScoreBoard";
import { LastTrickButton } from "./shared/LastTrickButton";
import { BidPanel } from "./shared/BidPanel";

const SUIT_GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
// Even suit colors are kept simple/high-contrast: red for hearts/diamonds, black for clubs/spades.
const SUIT_COLOR: Record<Suit, string> = {
  C: "text-black",
  S: "text-black",
  D: "text-red-700",
  H: "text-red-700",
};

// A flat card — no shadows, no gradients, no rounded corners beyond a hint. Pure schematic.
function FlatCard({
  card,
  faceDown = false,
  size = "md",
  onClick,
  disabled = false,
  rotation = 0,
}: {
  card?: CardT;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  rotation?: number;
}) {
  const dims = {
    sm: "w-10 h-14 text-sm",
    md: "w-14 h-20 text-lg",
    lg: "w-20 h-28 text-2xl",
  }[size];
  const style: CSSProperties = {
    transform: `rotate(${rotation}deg)`,
  };
  const clickable = !!onClick && !disabled;
  const cursor = clickable ? "cursor-pointer hover:bg-amber-50" : "";
  const muted = disabled ? "opacity-30" : "";
  if (faceDown || !card) {
    return (
      <div
        style={style}
        onClick={clickable ? onClick : undefined}
        className={`${dims} bg-white border-2 border-black flex items-center justify-center font-sans ${muted}`}
        aria-label="face-down card"
      >
        <div className="w-full h-full m-1 border border-black" />
      </div>
    );
  }
  const color = SUIT_COLOR[card.suit];
  const glyph = SUIT_GLYPH[card.suit];
  return (
    <div
      style={style}
      onClick={clickable ? onClick : undefined}
      className={`${dims} bg-white border-2 border-black flex flex-col items-center justify-between px-1 py-1 font-sans ${color} ${cursor} ${muted}`}
      aria-label={`${card.rank}${glyph}`}
    >
      <div className="self-start font-extrabold leading-none tracking-tight">{card.rank}</div>
      <div className="text-[0.7em] leading-none">{glyph}</div>
      <div className="self-end font-extrabold leading-none tracking-tight rotate-180">{card.rank}</div>
    </div>
  );
}

// A flat row of cards for an opponent / partner. Each card is rotated according to seat.
function OpponentHand({
  count,
  rotation,
  vertical,
}: {
  count: number;
  rotation: number;
  vertical: boolean;
}) {
  const cards = Array.from({ length: count }, (_, i) => i);
  return (
    <div
      className={`flex items-center justify-center gap-1 ${vertical ? "flex-col" : "flex-row"}`}
    >
      {cards.map((i) => (
        <FlatCard key={i} faceDown size="sm" rotation={rotation} />
      ))}
    </div>
  );
}

// Seat label shown alongside each seat's hand, with bid and made/pitcher chip when relevant.
function SeatBadge({
  seat,
  nickname,
  isTurn,
  isPitcher,
  bid,
}: {
  seat: Seat;
  nickname?: string;
  isTurn?: boolean;
  isPitcher?: boolean;
  bid?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 border-2 border-black text-xs font-mono bg-white ${
        isTurn ? "bg-yellow-200" : ""
      }`}
    >
      <span className="font-bold">{seat}</span>
      {nickname ? <span className="opacity-70">· {nickname}</span> : null}
      {isPitcher ? <span className="px-1 border border-black ml-1">pitch</span> : null}
      {bid ? <span className="px-1 border border-black ml-1">bid {bid}</span> : null}
    </div>
  );
}

function pitcherFromPhase(state: SkinProps["state"]): Seat | null {
  const p = state.phase;
  if (p.kind === "playing" || p.kind === "scoring") return p.pitcher;
  return null;
}

function bidForSeat(state: SkinProps["state"], seat: Seat): string | undefined {
  const p = state.phase;
  if (p.kind === "bidding") {
    const v = p.bids[seat];
    if (v === undefined) return undefined;
    return v === "pass" ? "P" : String(v);
  }
  if (p.kind === "playing" || p.kind === "scoring") {
    if (p.pitcher === seat) return String(p.bid);
  }
  return undefined;
}

function isTurnSeat(state: SkinProps["state"], seat: Seat): boolean {
  const p = state.phase;
  if (p.kind === "bidding") return p.turn === seat;
  if (p.kind === "playing") {
    // Whose turn to play is leader if no cards, else next clockwise after last card.
    if (p.trick.cards.length === 0) return p.trick.leader === seat;
    const last = p.trick.cards[p.trick.cards.length - 1].seat;
    const order: Seat[] = ["N", "E", "S", "W"];
    const next = order[(order.indexOf(last) + 1) % 4];
    return next === seat;
  }
  return false;
}

// The 4-square mini-grid in the center cell showing the current trick.
function TrickGrid({
  played,
  localSeat,
}: {
  played: PlayedCard[];
  localSeat: Seat;
}) {
  // Place each played card according to where the seat sits relative to the local viewer.
  const slot: Record<"top" | "bottom" | "left" | "right", PlayedCard | undefined> = {
    top: undefined,
    bottom: undefined,
    left: undefined,
    right: undefined,
  };
  for (const p of played) {
    slot[relPos(p.seat, localSeat)] = p;
  }
  const cell = (pos: "top" | "bottom" | "left" | "right") => {
    const p = slot[pos];
    return (
      <div className="flex items-center justify-center">
        {p ? (
          <div className="animate-[fadeIn_0.18s_ease-out]">
            <FlatCard
              card={p.card}
              size="md"
              rotation={rotationFor(p.seat, localSeat)}
            />
          </div>
        ) : (
          <div className="w-14 h-20 border border-dashed border-black/30" />
        )}
      </div>
    );
  };
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full place-items-center">
      <div />
      {cell("top")}
      <div />
      {cell("left")}
      <div className="text-[10px] font-mono opacity-50">trick</div>
      {cell("right")}
      <div />
      {cell("bottom")}
      <div />
    </div>
  );
}

export default function SkinB(props: SkinProps) {
  const { state, localSeat, dispatch, devPhaseSwitcher } = props;
  const phase = state.phase;

  // Figure out which seat goes on which edge (relative to the local viewer).
  const seatByPos: Record<"top" | "bottom" | "left" | "right", Seat> = {
    top: "N",
    bottom: "S",
    left: "W",
    right: "E",
  };
  for (const s of SEATS) {
    seatByPos[relPos(s, localSeat)] = s;
  }
  const partnerSeat = seatByPos.top;
  const leftSeat = seatByPos.left;
  const rightSeat = seatByPos.right;

  const pitcher = pitcherFromPhase(state);

  // ---------- Center cell content (phase-specific) ----------
  const renderCenter = () => {
    if (phase.kind === "lobby") {
      const seatedCount = SEATS.filter((s) => state.players[s] !== null).length;
      return (
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-2xl font-bold tracking-tight">Hi-Lo-Jack</div>
          <div className="text-sm font-mono">Lobby · {seatedCount}/4 seated</div>
          <div className="text-xs opacity-60 max-w-xs">
            Waiting for four players. Target: {state.targetScore}.
          </div>
        </div>
      );
    }
    if (phase.kind === "bidding") {
      return (
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-xs font-mono uppercase tracking-widest">Bidding</div>
          <BidPanel state={state} localSeat={localSeat} dispatch={dispatch} />
        </div>
      );
    }
    if (phase.kind === "playing") {
      const trickComplete = phase.trick.cards.length === 4;
      const trumpLabel = phase.trump ? SUIT_GLYPH[phase.trump] : "—";
      const isPitcher = phase.pitcher === localSeat;
      return (
        <div className="flex flex-col w-full h-full">
          <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-mono opacity-70">
            <span>trump {trumpLabel}</span>
            <span>pitcher {phase.pitcher} · bid {phase.bid}</span>
          </div>
          {phase.trump === null && (
            <div className="text-center text-[10px] font-mono opacity-70 pb-1">
              {isPitcher
                ? "Lead any card — its suit becomes trump."
                : `Waiting on ${phase.pitcher} to lead (sets trump)`}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <TrickGrid played={phase.trick.cards} localSeat={localSeat} />
          </div>
          {trickComplete && (
            <div className="pt-1 flex justify-center">
              <button
                onClick={() => dispatch({ type: "RESOLVE_TRICK" })}
                className="px-3 py-1 border-2 border-black bg-white text-xs font-bold hover:bg-amber-50"
              >
                next trick →
              </button>
            </div>
          )}
        </div>
      );
    }
    if (phase.kind === "scoring") {
      const nextAction: Action = phase.applied ? { type: "START_HAND" } : { type: "SCORE_HAND" };
      return (
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-xs font-mono uppercase tracking-widest">Scoring</div>
          <div className="border-2 border-black bg-white p-3 text-sm font-mono">
            <div>trump {SUIT_GLYPH[phase.trump]} · pitcher {phase.pitcher} · bid {phase.bid}</div>
            <div className="mt-1">
              N–S {phase.deltas.NS >= 0 ? "+" : ""}{phase.deltas.NS}
              {"  "}
              E–W {phase.deltas.EW >= 0 ? "+" : ""}{phase.deltas.EW}
            </div>
            <div className={`mt-1 font-bold ${phase.pitcherMadeBid ? "text-black" : "text-red-700"}`}>
              Pitcher {phase.pitcherMadeBid ? "MADE" : "SET"}
            </div>
          </div>
          <button
            onClick={() => dispatch(nextAction)}
            className="px-3 py-1 border-2 border-black bg-white text-xs font-bold hover:bg-amber-50"
          >
            {phase.applied ? "deal next hand" : "apply score"}
          </button>
        </div>
      );
    }
    // gameOver
    if (phase.kind === "gameOver") {
      return (
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-xs font-mono uppercase tracking-widest opacity-70">Game Over</div>
          <div className="text-3xl font-extrabold tracking-tight">{phase.winner} wins</div>
          <div className="text-sm font-mono">
            N–S {state.score.NS} · E–W {state.score.EW}
          </div>
        </div>
      );
    }
    return null;
  };

  // ---------- Local hand interactivity ----------
  const localHand = state.hands[localSeat] ?? [];
  const isLocalsTurnToPlay = phase.kind === "playing" && isTurnSeat(state, localSeat);
  const legalForLocal: CardT[] =
    phase.kind === "playing" && isLocalsTurnToPlay
      ? legalPlays(localHand, phase.trick.cards, phase.trump)
      : [];

  const cardIsLegal = (card: CardT) =>
    legalForLocal.some((l) => l.suit === card.suit && l.rank === card.rank);

  // ---------- Render the 3×3 viewport ----------
  return (
    <div className="w-full h-screen bg-stone-50 text-black font-sans grid grid-cols-3 grid-rows-3">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Top-left: ScoreBoard */}
      <div className="flex items-start justify-start p-3">
        <div className="border-2 border-black bg-white">
          <ScoreBoard state={state} />
        </div>
      </div>

      {/* Top-center: partner */}
      <div className="flex flex-col items-center justify-start p-2 gap-1">
        <SeatBadge
          seat={partnerSeat}
          nickname={state.players[partnerSeat]?.nickname}
          isTurn={isTurnSeat(state, partnerSeat)}
          isPitcher={pitcher === partnerSeat}
          bid={bidForSeat(state, partnerSeat)}
        />
        <OpponentHand
          count={state.hands[partnerSeat]?.length ?? 0}
          rotation={rotationFor(partnerSeat, localSeat)}
          vertical={false}
        />
      </div>

      {/* Top-right: LastTrickButton */}
      <div className="flex items-start justify-end p-3">
        <div className="border-2 border-black bg-white p-1">
          <LastTrickButton state={state} />
          {!state.lastTrick && (
            <div className="text-[10px] font-mono opacity-50 px-1">no last trick</div>
          )}
        </div>
      </div>

      {/* Middle-left: left opponent */}
      <div className="flex flex-col items-center justify-center p-2 gap-1">
        <SeatBadge
          seat={leftSeat}
          nickname={state.players[leftSeat]?.nickname}
          isTurn={isTurnSeat(state, leftSeat)}
          isPitcher={pitcher === leftSeat}
          bid={bidForSeat(state, leftSeat)}
        />
        <OpponentHand
          count={state.hands[leftSeat]?.length ?? 0}
          rotation={rotationFor(leftSeat, localSeat)}
          vertical={true}
        />
      </div>

      {/* Center cell */}
      <div className="border-2 border-black bg-white p-2 m-1 flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
        <div className="w-full h-full flex items-center justify-center">{renderCenter()}</div>
      </div>

      {/* Middle-right: right opponent */}
      <div className="flex flex-col items-center justify-center p-2 gap-1">
        <SeatBadge
          seat={rightSeat}
          nickname={state.players[rightSeat]?.nickname}
          isTurn={isTurnSeat(state, rightSeat)}
          isPitcher={pitcher === rightSeat}
          bid={bidForSeat(state, rightSeat)}
        />
        <OpponentHand
          count={state.hands[rightSeat]?.length ?? 0}
          rotation={rotationFor(rightSeat, localSeat)}
          vertical={true}
        />
      </div>

      {/* Bottom-left: spacer (could later hold notes) */}
      <div className="p-2" />

      {/* Bottom-center: local hand */}
      <div className="flex flex-col items-center justify-end p-2 gap-2">
        <SeatBadge
          seat={localSeat}
          nickname={state.players[localSeat]?.nickname ?? "You"}
          isTurn={isTurnSeat(state, localSeat)}
          isPitcher={pitcher === localSeat}
          bid={bidForSeat(state, localSeat)}
        />
        <div className="flex items-end justify-center gap-1">
          {localHand.length === 0 ? (
            <div className="text-[10px] font-mono opacity-50">no cards</div>
          ) : (
            localHand.map((card, i) => {
              const isPlayable = phase.kind === "playing" && isLocalsTurnToPlay;
              const playable = isPlayable && cardIsLegal(card);
              const disabled = isPlayable ? !playable : true;
              return (
                <FlatCard
                  key={`${card.suit}-${card.rank}-${i}`}
                  card={card}
                  size="md"
                  disabled={disabled && phase.kind === "playing"}
                  onClick={
                    playable
                      ? () => dispatch({ type: "PLAY_CARD", seat: localSeat, card })
                      : undefined
                  }
                />
              );
            })
          )}
        </div>
      </div>

      {/* Bottom-right: spacer */}
      <div className="p-2" />

      {/* Optional dev phase switcher overlay */}
      {devPhaseSwitcher}
    </div>
  );
}

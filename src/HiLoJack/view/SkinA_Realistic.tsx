import type { CSSProperties } from "react";
import type {
  Card as CardT,
  GameState,
  PlayedCard,
  Phase,
  Seat,
  Suit,
} from "../engine/types";
import { SEATS, partnerOf, teamOf } from "../engine/types";
import { legalPlays, rankValue } from "../engine/rules";
import { CardFace } from "./shared/Card";
import { BidPanel } from "./shared/BidPanel";
import { ScoreBoard } from "./shared/ScoreBoard";
import { LastTrickButton } from "./shared/LastTrickButton";
import { relPos, rotationFor } from "./shared/orientation";
import type { SkinProps } from "./shared/SkinProps";

// ---------- helpers ----------

const SUIT_GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
const SUIT_COLOR: Record<Suit, string> = {
  C: "text-slate-900",
  S: "text-slate-900",
  D: "text-rose-600",
  H: "text-rose-600",
};

const SUITS_DISPLAY: Suit[] = ["C", "D", "H", "S"];

// Offsets from table center, in % of the felt area. Used to slot played cards
// near the seat they came from while still clustering them inside the oval.
const PLAYED_POS: Record<"bottom" | "top" | "left" | "right", CSSProperties> = {
  bottom: { left: "50%", top: "65%", transform: "translate(-50%, -50%)" },
  top: { left: "50%", top: "35%", transform: "translate(-50%, -50%)" },
  left: { left: "35%", top: "50%", transform: "translate(-50%, -50%)" },
  right: { left: "65%", top: "50%", transform: "translate(-50%, -50%)" },
};

// Names for display.
function nameOf(state: GameState, seat: Seat): string {
  return state.players[seat]?.nickname ?? seat;
}

// Returns the trump suit of the current phase if any (playing/scoring).
function currentTrump(phase: Phase): Suit | null {
  if (phase.kind === "playing" || phase.kind === "scoring") return phase.trump;
  return null;
}

// Fan-curve helpers for the local hand. We use a mild arc so the hand looks
// like it's being held in two hands rather than laid out flat.
function fanTransform(idx: number, total: number): CSSProperties {
  if (total <= 1) return {};
  const mid = (total - 1) / 2;
  const offset = idx - mid;
  const rot = offset * 6; // degrees per card
  const lift = -Math.abs(offset) * 4; // px — outer cards droop down
  return {
    transform: `translateY(${lift}px) rotate(${rot}deg)`,
    transformOrigin: "50% 100%",
    transition: "transform 200ms ease",
  };
}

// ---------- sub-components ----------

function PartnerHand({ count }: { count: number }) {
  // Face-down, tilted back with perspective for a sense of distance.
  return (
    <div
      className="flex justify-center items-end gap-1"
      style={{
        transform: "perspective(800px) rotateX(35deg) scale(0.9)",
        transformOrigin: "50% 100%",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardFace key={i} size="sm" faceDown />
      ))}
    </div>
  );
}

function SideHand({ count, side }: { count: number; side: "left" | "right" }) {
  // A vertical stack of LANDSCAPE face-down cards — each card's long edge
  // runs horizontally, as if held by a player seated to the side of the table
  // facing inward. We don't rotate the container (the old version did, which
  // collapsed the strip into a horizontal row along the bottom corner). A
  // subtle perspective + rotateY tilts each card toward the table center for
  // a touch of 3D, matching the partner-row's "across-the-table" look.
  const tilt = side === "left" ? 18 : -18;
  return (
    <div className="flex flex-col items-center">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-14 h-9 rounded-md bg-gradient-to-br from-indigo-700 to-indigo-950 border border-indigo-300/40 shadow-md"
          style={{
            marginTop: i > 0 ? "-1.25rem" : 0,
            transform: `perspective(420px) rotateY(${tilt}deg)`,
            transformOrigin: side === "left" ? "right center" : "left center",
          }}
        />
      ))}
    </div>
  );
}

function SeatLabel({
  state,
  seat,
  highlight,
}: {
  state: GameState;
  seat: Seat;
  highlight?: boolean;
}) {
  return (
    <div
      className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded ${
        highlight
          ? "bg-amber-300 text-slate-900 font-semibold shadow"
          : "bg-black/40 text-white/90"
      }`}
    >
      {nameOf(state, seat)} <span className="opacity-60">({seat})</span>
    </div>
  );
}

// Display order for the local user's hand: C, D, S, H (alternates black-red-black-red).
// Within each suit, sorted low-to-high left-to-right.
const SUIT_DISPLAY_ORDER: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 };
function sortedForDisplay(cards: CardT[]): CardT[] {
  return [...cards].sort((a, b) => {
    const ds = SUIT_DISPLAY_ORDER[a.suit] - SUIT_DISPLAY_ORDER[b.suit];
    if (ds !== 0) return ds;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

function LocalHand({
  state,
  localSeat,
  dispatch,
}: {
  state: GameState;
  localSeat: Seat;
  dispatch: SkinProps["dispatch"];
}) {
  const rawHand = state.hands[localSeat] ?? [];
  const hand = sortedForDisplay(rawHand);
  const phase = state.phase;
  const isPlaying = phase.kind === "playing";
  const isMyPlayTurn =
    isPlaying && nextToPlay(phase) === localSeat;

  const trump = currentTrump(phase);
  // legalPlays operates on the raw hand; legalSet keys are suit+rank so the
  // sorted-for-display order doesn't matter for the legality check.
  const legal: CardT[] =
    isMyPlayTurn && trump
      ? legalPlays(rawHand, phase.trick.cards, trump)
      : rawHand.slice();

  const legalSet = new Set(legal.map(cardKey));

  return (
    <div className="flex justify-center items-end gap-[-1rem]">
      {hand.map((card, i) => {
        const k = cardKey(card);
        const playable = isMyPlayTurn && legalSet.has(k);
        const disabled = isPlaying && isMyPlayTurn && !playable;
        return (
          <div
            key={k + ":" + i}
            style={fanTransform(i, hand.length)}
            className="-ml-4 first:ml-0"
          >
            <CardFace
              card={card}
              size="md"
              disabled={disabled}
              highlight={playable}
              onClick={
                isMyPlayTurn && playable
                  ? () =>
                      dispatch({
                        type: "PLAY_CARD",
                        seat: localSeat,
                        card,
                      })
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function nextToPlay(phase: Phase): Seat | null {
  if (phase.kind !== "playing") return null;
  const played = phase.trick.cards;
  if (played.length === 4) return null;
  // Whose turn is it? Leader plays first, then clockwise.
  if (played.length === 0) return phase.trick.leader;
  const last = played[played.length - 1].seat;
  // Walk clockwise from last by one.
  const order: Seat[] = ["N", "E", "S", "W"];
  const idx = order.indexOf(last);
  return order[(idx + 1) % 4];
}

function cardKey(c: CardT): string {
  return `${c.suit}${c.rank}`;
}

function TrumpBadge({ suit }: { suit: Suit }) {
  return (
    <div
      className={`px-2 py-1 rounded-md bg-white/90 shadow text-base font-bold ${SUIT_COLOR[suit]}`}
      title="Trump"
    >
      Trump {SUIT_GLYPH[suit]}
    </div>
  );
}

function PlayedTrick({
  state,
  localSeat,
}: {
  state: GameState;
  localSeat: Seat;
}) {
  if (state.phase.kind !== "playing") return null;
  const cards = state.phase.trick.cards;
  return (
    <>
      {cards.map((p, i) => {
        const pos = relPos(p.seat, localSeat);
        const rot = rotationFor(p.seat, localSeat);
        return (
          <div
            key={`${p.seat}-${i}`}
            className="absolute"
            style={{
              ...PLAYED_POS[pos],
              transition: "transform 250ms ease, top 250ms ease, left 250ms ease",
            }}
          >
            <div style={{ transform: `rotate(${rot}deg)` }}>
              <CardFace card={p.card} size="md" />
            </div>
          </div>
        );
      })}
    </>
  );
}

// Banner shown when the pitcher is about to play the opening lead (which sets
// trump under the house rule). For other players, shows that the pitcher is
// about to lead.
function OpeningLeadBanner({
  state,
  localSeat,
}: {
  state: GameState;
  localSeat: Seat;
}) {
  if (state.phase.kind !== "playing") return null;
  if (state.phase.trump !== null) return null;
  const pitcher = state.phase.pitcher;
  const isPitcher = pitcher === localSeat;
  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-black/40 text-white">
      <div className="text-xs uppercase tracking-wider opacity-80 text-center">
        {isPitcher
          ? `You won the bid (${state.phase.bid}). Lead a card — its suit becomes trump.`
          : `${nameOf(state, pitcher)} (${pitcher}) is leading — their card sets trump.`}
      </div>
    </div>
  );
}

function NextTrickButton({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: SkinProps["dispatch"];
}) {
  if (state.phase.kind !== "playing") return null;
  if (state.phase.trick.cards.length !== 4) return null;
  return (
    <button
      onClick={() => dispatch({ type: "RESOLVE_TRICK" })}
      className="px-4 py-2 rounded-md bg-amber-300 text-slate-900 font-semibold shadow hover:bg-amber-200 transition"
    >
      Next trick →
    </button>
  );
}

function ScoringPanel({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: SkinProps["dispatch"];
}) {
  if (state.phase.kind !== "scoring") return null;
  const { deltas, pitcher, bid, pitcherMadeBid, applied } = state.phase;
  const pitcherTeam = teamOf(pitcher);
  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-black/60 text-white shadow-2xl border border-amber-400/30">
      <div className="text-sm uppercase tracking-wider opacity-80">Hand complete</div>
      <div className="text-xs opacity-80">
        Pitcher: {nameOf(state, pitcher)} ({pitcher}, {pitcherTeam}) bid {bid} —{" "}
        <span className={pitcherMadeBid ? "text-emerald-300" : "text-rose-300"}>
          {pitcherMadeBid ? "made it" : "set"}
        </span>
      </div>
      <div className="flex gap-6 items-center">
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-wider opacity-70">N–S</div>
          <div
            className={`text-2xl font-bold ${
              deltas.NS > 0
                ? "text-emerald-300"
                : deltas.NS < 0
                ? "text-rose-300"
                : "opacity-60"
            }`}
          >
            {deltas.NS > 0 ? "+" : ""}
            {deltas.NS}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-wider opacity-70">E–W</div>
          <div
            className={`text-2xl font-bold ${
              deltas.EW > 0
                ? "text-emerald-300"
                : deltas.EW < 0
                ? "text-rose-300"
                : "opacity-60"
            }`}
          >
            {deltas.EW > 0 ? "+" : ""}
            {deltas.EW}
          </div>
        </div>
      </div>
      <button
        onClick={() =>
          dispatch(applied ? { type: "START_HAND" } : { type: "SCORE_HAND" })
        }
        className="px-4 py-2 rounded-md bg-amber-300 text-slate-900 font-semibold shadow hover:bg-amber-200 transition"
      >
        {applied ? "Deal next hand →" : "Apply score →"}
      </button>
    </div>
  );
}

function GameOverPanel({ state }: { state: GameState }) {
  if (state.phase.kind !== "gameOver") return null;
  const winners = state.phase.winner;
  const seats = SEATS.filter((s) => teamOf(s) === winners);
  const names = seats.map((s) => nameOf(state, s)).join(" & ");
  return (
    <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-black/70 text-white shadow-2xl border-2 border-amber-300">
      <div className="text-amber-300 text-xs uppercase tracking-[0.3em]">Game over</div>
      <div className="text-3xl font-bold text-amber-200">{winners} wins!</div>
      <div className="text-sm opacity-80">{names}</div>
      <div className="flex gap-6 mt-2 text-sm">
        <div>
          N–S: <span className="font-bold">{state.score.NS}</span>
        </div>
        <div>
          E–W: <span className="font-bold">{state.score.EW}</span>
        </div>
      </div>
    </div>
  );
}

function LobbyPanel({
  state,
  localSeat,
  dispatch,
}: {
  state: GameState;
  localSeat: Seat;
  dispatch: SkinProps["dispatch"];
}) {
  if (state.phase.kind !== "lobby") return null;
  const allSeated = SEATS.every((s) => state.players[s] !== null);
  return (
    <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-black/50 text-white shadow-xl">
      <div className="text-sm uppercase tracking-wider opacity-80">Lobby</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {SEATS.map((s) => {
          const p = state.players[s];
          return (
            <div
              key={s}
              className={`px-3 py-1.5 rounded-md ${
                p ? "bg-emerald-700/80" : "bg-slate-700/60"
              } ${s === localSeat ? "ring-2 ring-amber-300" : ""}`}
            >
              <span className="opacity-70">{s}:</span>{" "}
              {p ? p.nickname : <span className="opacity-60">open</span>}
            </div>
          );
        })}
      </div>
      {allSeated && (
        <button
          onClick={() => dispatch({ type: "START_HAND" })}
          className="px-4 py-2 rounded-md bg-amber-300 text-slate-900 font-semibold shadow hover:bg-amber-200 transition"
        >
          Deal first hand →
        </button>
      )}
    </div>
  );
}

// Whose turn is it overall? Used to highlight the seat label.
function activeSeat(state: GameState): Seat | null {
  const p = state.phase;
  if (p.kind === "bidding") return p.turn;
  if (p.kind === "playing") return nextToPlay(p);
  return null;
}

// ---------- main ----------

export default function SkinA(props: SkinProps) {
  const { state, localSeat, dispatch, devPhaseSwitcher } = props;
  const partner = partnerOf(localSeat);
  const phase = state.phase;
  const trump = currentTrump(phase);
  const active = activeSeat(state);

  // Figure out which seat sits at each compass position relative to local.
  const seatAt: Record<"bottom" | "top" | "left" | "right", Seat> = {
    bottom: localSeat,
    top: partner,
    left: SEATS.find(
      (s) => s !== localSeat && s !== partner && relPos(s, localSeat) === "left",
    ) as Seat,
    right: SEATS.find(
      (s) => s !== localSeat && s !== partner && relPos(s, localSeat) === "right",
    ) as Seat,
  };

  // Card counts for the hidden seats. During lobby and gameOver these may be 0.
  const handLen = (s: Seat) => state.hands[s]?.length ?? 0;

  return (
    <div
      className="relative w-full h-full min-h-screen overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(ellipse at center, #065f46 0%, #064e3b 45%, #022c22 100%)",
      }}
    >
      {/* Felt-table darker oval in the middle */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "10%",
          right: "10%",
          top: "18%",
          bottom: "18%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.65) 100%)",
          boxShadow: "inset 0 0 80px rgba(0,0,0,0.5)",
        }}
      />

      {/* Top-left: scoreboard + (when in play) trump badge */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <ScoreBoard state={state} />
        {trump && <TrumpBadge suit={trump} />}
      </div>

      {/* Top-right: last-trick button. devPhaseSwitcher (if any) renders itself fixed
          at top-right too; we leave a margin to avoid stacking exactly atop it. */}
      <div className="absolute top-3 right-3 z-30">
        <LastTrickButton state={state} />
      </div>

      {/* Dev phase switcher (host responsibility — we just render it). */}
      {devPhaseSwitcher}

      {/* Partner (top) */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 z-20 flex flex-col items-center gap-1">
        <SeatLabel state={state} seat={seatAt.top} highlight={active === seatAt.top} />
        <PartnerHand count={handLen(seatAt.top)} />
      </div>

      {/* Left opponent */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
        <SeatLabel state={state} seat={seatAt.left} highlight={active === seatAt.left} />
        <SideHand count={handLen(seatAt.left)} side="left" />
      </div>

      {/* Right opponent */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
        <SeatLabel state={state} seat={seatAt.right} highlight={active === seatAt.right} />
        <SideHand count={handLen(seatAt.right)} side="right" />
      </div>

      {/* Center: the table — played cards, phase-specific overlays */}
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <div className="relative w-[60%] h-[55%]">
          <PlayedTrick state={state} localSeat={localSeat} />
        </div>
      </div>

      {/* Center overlays for non-playing phases (lobby/scoring/gameOver) and opening-lead banner */}
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <div className="pointer-events-auto flex flex-col items-center gap-3">
          {phase.kind === "lobby" && (
            <LobbyPanel state={state} localSeat={localSeat} dispatch={dispatch} />
          )}
          {phase.kind === "playing" && phase.trump === null && (
            <OpeningLeadBanner state={state} localSeat={localSeat} />
          )}
          {phase.kind === "scoring" && (
            <ScoringPanel state={state} dispatch={dispatch} />
          )}
          {phase.kind === "gameOver" && <GameOverPanel state={state} />}
          {phase.kind === "playing" && (
            <div className="mt-32">
              <NextTrickButton state={state} dispatch={dispatch} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: local user's hand + (when bidding) the bid panel */}
      <div className="absolute left-0 right-0 bottom-3 z-30 flex flex-col items-center gap-3">
        {phase.kind === "bidding" && (
          <BidPanel state={state} localSeat={localSeat} dispatch={dispatch} />
        )}
        <div className="flex flex-col items-center gap-1">
          <LocalHand state={state} localSeat={localSeat} dispatch={dispatch} />
          <SeatLabel
            state={state}
            seat={localSeat}
            highlight={active === localSeat}
          />
        </div>
      </div>
    </div>
  );
}

// Avoid "imported but unused" diagnostics for symbols we re-export indirectly.
export type { PlayedCard };

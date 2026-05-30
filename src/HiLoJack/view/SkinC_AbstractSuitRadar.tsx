// Skin C — "Suit Radar" (abstract)
// Design intent: a dark synoptic radar where each seat owns a wedge of a central circle.
// Cards are glowing dots whose angle-within-wedge encodes suit, and whose radial distance
// from the bullseye encodes rank (A near rim, 2 near center). Played cards travel inward
// to the bullseye, forming the current trick as a small constellation. See EXECPLAN §5.

import { useMemo, useState } from "react";
import type {
  Action,
  Card as CardT,
  GameState,
  PlayedCard,
  Seat,
  Suit,
} from "../engine/types";
import { SUITS, partnerOf, teamOf } from "../engine/types";
import { legalPlays, rankValue } from "../engine/rules";
import type { SkinProps } from "./shared/SkinProps";
import { relPos } from "./shared/orientation";
import { BidPanel } from "./shared/BidPanel";
import { ScoreBoard } from "./shared/ScoreBoard";
import { LastTrickButton } from "./shared/LastTrickButton";

// ---------------------------------------------------------------------------
// Geometry constants — single source of truth so the visual stays coherent.

const VB = 1000;                 // SVG viewBox is VB x VB
const CX = VB / 2;
const CY = VB / 2;
const R_OUTER = 440;             // outer radar radius
const R_INNER = 80;              // inner "bullseye" where played cards land
const R_MIN_RANK = R_INNER + 30; // 2 sits here
const R_MAX_RANK = R_OUTER - 35; // A sits here
const TRUMP_ARC_PAD = 6;         // gap outside the perimeter where the trump arc lives

// Glow palette — distinct hues per suit so the radar reads at a glance.
const SUIT_HUE: Record<Suit, string> = {
  C: "#10b981", // emerald
  D: "#60a5fa", // sky blue
  H: "#f43f5e", // rose
  S: "#a78bfa", // violet
};
const SUIT_GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };

// Each wedge spans 90°. We rotate the radar so the LOCAL seat's wedge is at the bottom.
// SVG angle convention used throughout: 0° = +x (right), increasing clockwise (because
// we flip Y for screen coords). We use degrees and convert at the polar() boundary.

// Wedge centers (in degrees) using compass-ish layout from the LOCAL viewer's POV:
//   bottom (self)  → 90°
//   right          → 0°
//   top (partner)  → -90° (i.e. 270°)
//   left           → 180°
const WEDGE_CENTER_DEG: Record<"bottom" | "right" | "top" | "left", number> = {
  bottom: 90,
  right: 0,
  top: 270,
  left: 180,
};
const WEDGE_HALF = 45;           // each wedge spans ±45° around its center

// Suits get sub-angles inside the wedge: 4 suits → quartered.
// Sub-angle offsets relative to the wedge center, evenly spaced inside (-WEDGE_HALF, +WEDGE_HALF).
function suitOffsetDeg(suit: Suit): number {
  const i = SUITS.indexOf(suit); // 0..3
  // Place each suit at the midpoint of its sub-band: -33.75, -11.25, +11.25, +33.75
  const band = (WEDGE_HALF * 2) / 4; // 22.5
  return -WEDGE_HALF + band / 2 + i * band;
}

// ---------------------------------------------------------------------------
// Polar → Cartesian. We pass degrees in; SVG y-axis grows downward so positive
// degrees rotate visually clockwise from +x, which matches our compass intuition.
function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function rankRadius(card: CardT): number {
  const v = rankValue(card.rank); // 0..12
  const t = v / 12;
  return R_MIN_RANK + t * (R_MAX_RANK - R_MIN_RANK);
}

// Position of a card-dot inside a seat's wedge.
function dotPosition(seat: Seat, local: Seat, card: CardT): { x: number; y: number; deg: number; r: number } {
  const wedgeCenter = WEDGE_CENTER_DEG[relPos(seat, local)];
  const deg = wedgeCenter + suitOffsetDeg(card.suit);
  const r = rankRadius(card);
  const p = polar(CX, CY, r, deg);
  return { ...p, deg, r };
}

// Position inside the bullseye for a card that's been played to the current trick.
// We arrange the 4 trick cards as a tiny diamond around the bullseye center, keyed by
// the relative position of the seat that played them, so the constellation looks like
// "where it came from".
function trickDotPosition(seat: Seat, local: Seat): { x: number; y: number } {
  const pos = relPos(seat, local);
  const off = 26;
  if (pos === "bottom") return { x: CX, y: CY + off };
  if (pos === "top") return { x: CX, y: CY - off };
  if (pos === "left") return { x: CX - off, y: CY };
  return { x: CX + off, y: CY };
}

// Arc path generator for the trump highlight. Sweeps the wedge that LEADS — wait, actually
// per spec we highlight TRUMP across the perimeter, not per-seat. We make a small ring
// arc around the full circumference but tinted by the trump hue; the arc is the WHOLE
// perimeter, broken into 4 sub-arcs that line up with each wedge's trump sub-band, so
// you can read "this is where the trump cards live in each wedge".
function trumpSubArcPath(seat: Seat, local: Seat, trump: Suit): string {
  const wedgeCenter = WEDGE_CENTER_DEG[relPos(seat, local)];
  const center = wedgeCenter + suitOffsetDeg(trump);
  const band = (WEDGE_HALF * 2) / 4;
  const a0 = center - band / 2;
  const a1 = center + band / 2;
  const r = R_OUTER + TRUMP_ARC_PAD;
  const p0 = polar(CX, CY, r, a0);
  const p1 = polar(CX, CY, r, a1);
  // Always small arc; large-arc-flag = 0, sweep-flag = 1 (clockwise in SVG y-down).
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
}

// Wedge boundary path (a pie slice) used for backdrops and turn highlights.
function wedgePath(seat: Seat, local: Seat): string {
  const wedgeCenter = WEDGE_CENTER_DEG[relPos(seat, local)];
  const a0 = wedgeCenter - WEDGE_HALF;
  const a1 = wedgeCenter + WEDGE_HALF;
  const pOuter0 = polar(CX, CY, R_OUTER, a0);
  const pOuter1 = polar(CX, CY, R_OUTER, a1);
  return `M ${CX} ${CY} L ${pOuter0.x} ${pOuter0.y} A ${R_OUTER} ${R_OUTER} 0 0 1 ${pOuter1.x} ${pOuter1.y} Z`;
}

// ---------------------------------------------------------------------------
// Dot — a single glowing card marker.

function CardDot({
  card,
  cx,
  cy,
  hue,
  big,
  faded,
  onClick,
  pulse,
  label,
  labelDeg,
}: {
  card: CardT;
  cx: number;
  cy: number;
  hue: string;
  big?: boolean;
  faded?: boolean;
  onClick?: () => void;
  pulse?: boolean;
  label?: string;
  labelDeg?: number;
}) {
  const baseR = big ? 13 : 9;
  const glowR = baseR * 2.2;
  const interactive = !!onClick && !faded;
  // Label position: push outward along the dot's radial vector so it doesn't sit on the dot.
  let labelX = cx;
  let labelY = cy - baseR - 6;
  if (label && labelDeg !== undefined) {
    const p = polar(cx, cy, baseR + 14, labelDeg);
    labelX = p.x;
    labelY = p.y;
  }
  return (
    <g
      onClick={interactive ? onClick : undefined}
      style={{
        cursor: interactive ? "pointer" : "default",
        transition: "transform 350ms ease, opacity 250ms ease",
        opacity: faded ? 0.18 : 1,
      }}
    >
      {/* outer soft glow */}
      <circle
        cx={cx}
        cy={cy}
        r={glowR}
        fill={hue}
        opacity={0.18}
        style={pulse ? { filter: "blur(2px)" } : undefined}
      />
      {/* mid glow */}
      <circle cx={cx} cy={cy} r={baseR * 1.4} fill={hue} opacity={0.35} />
      {/* core */}
      <circle
        cx={cx}
        cy={cy}
        r={baseR}
        fill={hue}
        stroke="white"
        strokeOpacity={0.7}
        strokeWidth={big ? 1.5 : 1}
      />
      {label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fontSize={big ? 22 : 16}
          fill="white"
          fillOpacity={0.85}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {label}
        </text>
      )}
      {/* hidden ARIA-ish title for hover */}
      <title>{`${card.rank}${SUIT_GLYPH[card.suit]}`}</title>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Seat label rendered just outside the wedge.

function SeatLabel({
  seat,
  local,
  nickname,
  isTurn,
  isPitcher,
  isDealer,
}: {
  seat: Seat;
  local: Seat;
  nickname: string;
  isTurn: boolean;
  isPitcher: boolean;
  isDealer: boolean;
}) {
  const wedgeCenter = WEDGE_CENTER_DEG[relPos(seat, local)];
  const p = polar(CX, CY, R_OUTER + 60, wedgeCenter);
  return (
    <g style={{ pointerEvents: "none" }}>
      <text
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={26}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight={600}
        fill={isTurn ? "#fbbf24" : "white"}
        fillOpacity={isTurn ? 1 : 0.85}
      >
        {nickname}
      </text>
      <text
        x={p.x}
        y={p.y + 26}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fill="white"
        fillOpacity={0.55}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {seat}
        {isDealer ? " · dealer" : ""}
        {isPitcher ? " · pitcher" : ""}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component

export default function SkinC({ state, localSeat, dispatch, devPhaseSwitcher }: SkinProps) {
  const { phase } = state;
  // Tracks an in-flight click so we can briefly pulse / animate the chosen dot.
  const [pendingPlay, setPendingPlay] = useState<CardT | null>(null);

  // Are we currently in a playing phase? Convenience.
  const playingPhase = phase.kind === "playing" ? phase : null;
  const trump: Suit | null =
    phase.kind === "playing"
      ? phase.trump
      : phase.kind === "scoring"
      ? phase.trump
      : null;

  // Which seat acts next? Used to highlight the turn wedge.
  const turnSeat: Seat | null = useMemo(() => {
    if (phase.kind === "bidding") return phase.turn;
    if (phase.kind === "playing") {
      const t = phase.trick;
      if (t.cards.length === 4) return null;
      // Next to act = leader + cards.length, going clockwise.
      const order: Seat[] = ["N", "E", "S", "W"];
      const idx = order.indexOf(t.leader);
      return order[(idx + t.cards.length) % 4];
    }
    return null;
  }, [phase]);

  // The cards we should HIDE from each seat's wedge because they've already been played
  // to the table this trick. We dim them rather than removing — keeps continuity. But for
  // the actual hand we read from state.hands which already excludes played cards (the
  // engine removes them on PLAY_CARD). To get the "they were just here" effect we'd need
  // history; for now we trust state.hands as the source of truth.
  const trickCards: PlayedCard[] = playingPhase ? playingPhase.trick.cards : [];

  const localHand = state.hands[localSeat] ?? [];
  const legalForLocal: CardT[] =
    playingPhase && turnSeat === localSeat
      ? legalPlays(localHand, trickCards, playingPhase.trump)
      : localHand;

  // Build the set of legal card keys for quick lookup.
  const legalKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const c of legalForLocal) s.add(`${c.suit}-${c.rank}`);
    return s;
  }, [legalForLocal]);

  function isLegal(card: CardT): boolean {
    return legalKeySet.has(`${card.suit}-${card.rank}`);
  }

  function onDotClick(seat: Seat, card: CardT) {
    if (seat !== localSeat) return;
    if (!playingPhase) return;
    if (turnSeat !== localSeat) return;
    if (!isLegal(card)) return;
    setPendingPlay(card);
    dispatch({ type: "PLAY_CARD", seat: localSeat, card });
    // Clear the pending pulse a beat later regardless of reducer outcome.
    window.setTimeout(() => setPendingPlay(null), 400);
  }

  // Helpers — render each seat's wedge contents.
  function renderSeatDots(seat: Seat) {
    const hand = state.hands[seat] ?? [];
    return hand.map((card, i) => {
      const pos = dotPosition(seat, localSeat, card);
      const hue = SUIT_HUE[card.suit];
      const isLocal = seat === localSeat;
      const myTurn = playingPhase && turnSeat === localSeat && isLocal;
      const faded = !!myTurn && !isLegal(card);
      const pulse = isLocal && pendingPlay
        ? pendingPlay.suit === card.suit && pendingPlay.rank === card.rank
        : false;
      return (
        <CardDot
          key={`${seat}-${card.suit}-${card.rank}-${i}`}
          card={card}
          cx={pos.x}
          cy={pos.y}
          hue={hue}
          big={isLocal}
          faded={faded}
          pulse={pulse}
          onClick={isLocal && playingPhase ? () => onDotClick(seat, card) : undefined}
          label={isLocal ? `${card.rank}${SUIT_GLYPH[card.suit]}` : undefined}
          labelDeg={pos.deg}
        />
      );
    });
  }

  // The trick constellation: each played card lands near the bullseye.
  function renderTrickConstellation() {
    if (!playingPhase) return null;
    return playingPhase.trick.cards.map((p, i) => {
      const dst = trickDotPosition(p.seat, localSeat);
      return (
        <CardDot
          key={`trick-${p.seat}-${i}`}
          card={p.card}
          cx={dst.x}
          cy={dst.y}
          hue={SUIT_HUE[p.card.suit]}
          big
          label={`${p.card.rank}${SUIT_GLYPH[p.card.suit]}`}
        />
      );
    });
  }

  // Trump perimeter arcs — one per wedge, sitting just outside the rim.
  function renderTrumpArcs() {
    if (!trump) return null;
    const hue = SUIT_HUE[trump];
    const seats: Seat[] = ["N", "E", "S", "W"];
    return seats.map((seat) => (
      <path
        key={`trump-${seat}`}
        d={trumpSubArcPath(seat, localSeat, trump)}
        stroke={hue}
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
        style={{ filter: `drop-shadow(0 0 6px ${hue})` }}
      />
    ));
  }

  // Backdrop wedges + dividers.
  function renderWedgeBackdrops() {
    const seats: Seat[] = ["N", "E", "S", "W"];
    return seats.map((seat) => {
      const isTurn = turnSeat === seat;
      const team = teamOf(seat);
      const teamHue = team === "NS" ? "#1e293b" : "#0f172a";
      return (
        <path
          key={`wedge-${seat}`}
          d={wedgePath(seat, localSeat)}
          fill={teamHue}
          stroke={isTurn ? "#fbbf24" : "#334155"}
          strokeWidth={isTurn ? 3 : 1}
          opacity={0.6}
          style={{ transition: "stroke 200ms ease, stroke-width 200ms ease" }}
        />
      );
    });
  }

  // Concentric rank rings (visual reference: rim = A, center = 2).
  function renderRankRings() {
    const rings = [0, 0.25, 0.5, 0.75, 1];
    return rings.map((t, i) => {
      const r = R_MIN_RANK + t * (R_MAX_RANK - R_MIN_RANK);
      return (
        <circle
          key={`ring-${i}`}
          cx={CX}
          cy={CY}
          r={r}
          fill="none"
          stroke="white"
          strokeOpacity={0.06}
          strokeWidth={1}
        />
      );
    });
  }

  function renderSeatLabels() {
    const seats: Seat[] = ["N", "E", "S", "W"];
    const pitcher =
      phase.kind === "playing" || phase.kind === "scoring"
        ? phase.pitcher
        : null;
    return seats.map((seat) => {
      const p = state.players[seat];
      return (
        <SeatLabel
          key={`label-${seat}`}
          seat={seat}
          local={localSeat}
          nickname={p?.nickname ?? "—"}
          isTurn={turnSeat === seat}
          isPitcher={pitcher === seat}
          isDealer={state.dealerSeat === seat}
        />
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Overlays per-phase.

  function LobbyOverlay() {
    if (phase.kind !== "lobby") return null;
    const seatedCount = (Object.values(state.players) as Array<{ uid: string } | null>).filter(Boolean).length;
    const canStart = seatedCount === 4;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-black/70 border border-white/10 rounded-xl px-8 py-6 text-white text-center shadow-2xl backdrop-blur">
          <div className="text-2xl font-light tracking-widest uppercase mb-2">Suit Radar</div>
          <div className="text-sm opacity-70 mb-4">Hi-Lo-Jack · {seatedCount}/4 seated</div>
          <button
            disabled={!canStart}
            onClick={() => dispatch({ type: "START_HAND" })}
            className={`px-4 py-2 rounded-md font-semibold ${
              canStart ? "bg-amber-400 text-slate-900 hover:bg-amber-300" : "bg-slate-700 text-slate-400"
            }`}
          >
            deal
          </button>
        </div>
      </div>
    );
  }

  function BiddingOverlay() {
    if (phase.kind !== "bidding") return null;
    return (
      <div className="absolute inset-x-0 bottom-8 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <BidPanel state={state} localSeat={localSeat} dispatch={dispatch} />
        </div>
      </div>
    );
  }

  // Banner shown before the pitcher's opening lead. The card they play sets trump.
  function OpeningLeadBanner() {
    if (phase.kind !== "playing" || phase.trump !== null) return null;
    const isMe = phase.pitcher === localSeat;
    return (
      <div className="absolute inset-x-0 top-16 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-black/70 border border-white/10 rounded-md px-4 py-2 text-white text-xs uppercase tracking-widest shadow-lg backdrop-blur">
          {isMe
            ? "Lead any card — its suit becomes trump"
            : `${phase.pitcher} is leading — sets trump`}
        </div>
      </div>
    );
  }

  function PlayingOverlay() {
    if (phase.kind !== "playing") return null;
    if (phase.trick.cards.length !== 4) return null;
    return (
      <div className="absolute inset-x-0 bottom-8 flex items-center justify-center pointer-events-none">
        <button
          onClick={() => dispatch({ type: "RESOLVE_TRICK" })}
          className="pointer-events-auto px-4 py-2 rounded-md bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 shadow-lg"
        >
          next trick →
        </button>
      </div>
    );
  }

  function ScoringOverlay() {
    if (phase.kind !== "scoring") return null;
    const { deltas, pitcherMadeBid, applied, pitcher, bid } = phase;
    const pitcherTeam = teamOf(pitcher);
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-black/80 border border-white/10 rounded-xl px-8 py-6 text-white shadow-2xl backdrop-blur text-center min-w-[280px]">
          <div className="text-xs uppercase tracking-widest opacity-70 mb-1">hand complete</div>
          <div className="text-sm mb-3">
            {pitcher} ({pitcherTeam}) bid {bid} — {pitcherMadeBid ? "made it" : "set"}
          </div>
          <div className="flex justify-around mb-4">
            <div>
              <div className="text-[10px] uppercase opacity-60">N–S</div>
              <div className={`text-2xl font-bold ${deltas.NS < 0 ? "text-rose-400" : "text-emerald-300"}`}>
                {deltas.NS > 0 ? "+" : ""}
                {deltas.NS}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase opacity-60">E–W</div>
              <div className={`text-2xl font-bold ${deltas.EW < 0 ? "text-rose-400" : "text-emerald-300"}`}>
                {deltas.EW > 0 ? "+" : ""}
                {deltas.EW}
              </div>
            </div>
          </div>
          <button
            onClick={() => dispatch({ type: applied ? "START_HAND" : "SCORE_HAND" })}
            className="px-4 py-2 rounded-md bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
          >
            {applied ? "next hand" : "apply score"}
          </button>
        </div>
      </div>
    );
  }

  function GameOverOverlay() {
    if (phase.kind !== "gameOver") return null;
    const localTeam = teamOf(localSeat);
    const won = phase.winner === localTeam;
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-black/90 border border-white/10 rounded-xl px-10 py-8 text-white shadow-2xl backdrop-blur text-center">
          <div className="text-xs uppercase tracking-widest opacity-70 mb-2">final</div>
          <div className="text-4xl font-light tracking-widest mb-2" style={{ color: won ? "#fbbf24" : "white" }}>
            {phase.winner} wins
          </div>
          <div className="text-sm opacity-70">
            {state.score.NS} — {state.score.EW}
          </div>
        </div>
      </div>
    );
  }

  // Suppress unused-variable lint for helper imports we expose for narrative clarity.
  void partnerOf;

  const radarDimmed = phase.kind === "gameOver" || phase.kind === "lobby";

  return (
    <div className="relative w-full min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* Soft starfield-ish background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.06) 0%, rgba(2,6,23,1) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Top-left ScoreBoard, top-right LastTrickButton */}
      <div className="absolute top-3 left-3 z-30">
        <ScoreBoard state={state} />
      </div>
      <div className="absolute top-3 right-3 z-30">
        <LastTrickButton state={state} />
      </div>

      {/* The radar itself fills the viewport. */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: radarDimmed ? 0.35 : 1, transition: "opacity 400ms ease" }}
      >
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="w-[min(100vmin,100vh)] h-[min(100vmin,100vh)]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Faint outer ring */}
          <circle
            cx={CX}
            cy={CY}
            r={R_OUTER + 2}
            fill="none"
            stroke="white"
            strokeOpacity={0.1}
            strokeWidth={2}
          />
          {renderWedgeBackdrops()}
          {renderRankRings()}
          {renderTrumpArcs()}

          {/* Bullseye — the trick lands here. */}
          <circle
            cx={CX}
            cy={CY}
            r={R_INNER}
            fill="black"
            stroke="white"
            strokeOpacity={0.15}
            strokeWidth={1}
          />

          {/* Hand dots (skip during scoring if hands have been emptied) */}
          {renderSeatDots("N")}
          {renderSeatDots("E")}
          {renderSeatDots("S")}
          {renderSeatDots("W")}

          {/* Center constellation for the current trick */}
          {renderTrickConstellation()}

          {renderSeatLabels()}

          {/* Trump legend */}
          {trump && (
            <text
              x={CX}
              y={VB - 12}
              textAnchor="middle"
              fontSize={16}
              fill={SUIT_HUE[trump]}
              fillOpacity={0.9}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              trump · {SUIT_GLYPH[trump]}
            </text>
          )}
        </svg>
      </div>

      {/* Phase-specific overlays */}
      <LobbyOverlay />
      <BiddingOverlay />
      <OpeningLeadBanner />
      <PlayingOverlay />
      <ScoringOverlay />
      <GameOverOverlay />

      {/* Dev affordance, if the host provided one */}
      {devPhaseSwitcher && (
        <div className="absolute bottom-3 left-3 z-40">{devPhaseSwitcher}</div>
      )}
    </div>
  );
}

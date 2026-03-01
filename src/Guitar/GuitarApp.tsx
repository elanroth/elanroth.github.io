import React, { useState, useRef, useCallback, useEffect } from "react";
import { SongIdeas } from "./SongIdeas";

// ─────────────────────────── MUSIC THEORY ───────────────────────────

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TUNING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];
const NUM_FRETS = 12;
const NUM_STRINGS = 6;
const POSITION_MARKERS = new Set([3, 5, 7, 9, 12]);

function midiToNoteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

type ChordQuality = "maj" | "min" | "7" | "maj7" | "min7" | "dim" | "aug" | "sus2" | "sus4" | "add9";

const CHORD_LABEL: Record<ChordQuality, string> = {
  maj: "", min: "m", "7": "7", maj7: "maj7", min7: "m7",
  dim: "°", aug: "+", sus2: "sus2", sus4: "sus4", add9: "add9",
};

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dim: [0, 3, 6],
  aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14],
};

type Voicing = { frets: number[]; name: string };

// frets: [E, A, D, G, B, e]  –1 = muted, 0 = open, N = fret
const CHORD_DB: Record<string, Voicing[]> = {
  C_maj:  [{ frets: [-1, 3, 2, 0, 1, 0], name: "Open C" }],
  D_maj:  [{ frets: [-1, -1, 0, 2, 3, 2], name: "Open D" }],
  E_maj:  [{ frets: [0, 2, 2, 1, 0, 0], name: "Open E" }],
  F_maj:  [{ frets: [1, 1, 2, 3, 3, 1], name: "F Barre (E-shape)" }, { frets: [-1, -1, 3, 2, 1, 1], name: "F (mini)" }],
  G_maj:  [{ frets: [3, 2, 0, 0, 0, 3], name: "Open G" }, { frets: [3, 2, 0, 0, 3, 3], name: "Open G (alt)" }],
  A_maj:  [{ frets: [-1, 0, 2, 2, 2, 0], name: "Open A" }],
  "A#_maj": [{ frets: [-1, 1, 3, 3, 3, 1], name: "A# Barre" }],
  B_maj:  [{ frets: [-1, 2, 4, 4, 4, 2], name: "B Barre (A-shape)" }],
  "C#_maj": [{ frets: [-1, 4, 6, 6, 6, 4], name: "C# Barre" }, { frets: [-1, -1, 3, 1, 2, 1], name: "C# mini" }],
  "D#_maj": [{ frets: [-1, -1, 1, 3, 4, 3], name: "D# shape" }, { frets: [6, 6, 8, 8, 8, 6], name: "D# Barre" }],
  "F#_maj": [{ frets: [2, 4, 4, 3, 2, 2], name: "F# Barre (E-shape)" }, { frets: [2, 2, 4, 4, 4, 2], name: "F# Barre (A-shape)" }],
  "G#_maj": [{ frets: [4, 6, 6, 5, 4, 4], name: "G# Barre (E-shape)" }],
  C_min:  [{ frets: [-1, 3, 5, 5, 4, 3], name: "Cm Barre" }],
  D_min:  [{ frets: [-1, -1, 0, 2, 3, 1], name: "Open Dm" }],
  E_min:  [{ frets: [0, 2, 2, 0, 0, 0], name: "Open Em" }],
  F_min:  [{ frets: [1, 3, 3, 1, 1, 1], name: "Fm Barre" }],
  G_min:  [{ frets: [3, 5, 5, 3, 3, 3], name: "Gm Barre" }],
  A_min:  [{ frets: [-1, 0, 2, 2, 1, 0], name: "Open Am" }],
  "A#_min": [{ frets: [-1, 1, 3, 3, 2, 1], name: "A#m Barre" }],
  B_min:  [{ frets: [-1, 2, 4, 4, 3, 2], name: "Bm Barre" }],
  "C#_min": [{ frets: [-1, 4, 6, 6, 5, 4], name: "C#m Barre" }],
  "D#_min": [{ frets: [-1, 6, 8, 8, 7, 6], name: "D#m Barre" }],
  "F#_min": [{ frets: [2, 4, 4, 2, 2, 2], name: "F#m Barre" }],
  "G#_min": [{ frets: [4, 6, 6, 4, 4, 4], name: "G#m Barre" }],
  C_7:    [{ frets: [-1, 3, 2, 3, 1, 0], name: "C7 Open" }],
  D_7:    [{ frets: [-1, -1, 0, 2, 1, 2], name: "Open D7" }],
  E_7:    [{ frets: [0, 2, 0, 1, 0, 0], name: "Open E7" }],
  F_7:    [{ frets: [1, 1, 2, 1, 1, 1], name: "F7 Barre" }],
  G_7:    [{ frets: [3, 2, 0, 0, 0, 1], name: "Open G7" }],
  A_7:    [{ frets: [-1, 0, 2, 0, 2, 0], name: "Open A7" }],
  B_7:    [{ frets: [-1, 2, 1, 2, 0, 2], name: "Open B7" }],
  "F#_7": [{ frets: [2, 2, 4, 2, 4, 2], name: "F#7 Barre" }],
  C_maj7: [{ frets: [-1, 3, 2, 0, 0, 0], name: "Cmaj7 Open" }],
  D_maj7: [{ frets: [-1, -1, 0, 2, 2, 2], name: "Dmaj7" }],
  E_maj7: [{ frets: [0, 2, 1, 1, 0, 0], name: "Emaj7 Open" }],
  G_maj7: [{ frets: [3, 2, 0, 0, 0, 2], name: "Gmaj7" }],
  A_maj7: [{ frets: [-1, 0, 2, 1, 2, 0], name: "Amaj7 Open" }],
  A_min7: [{ frets: [-1, 0, 2, 0, 1, 0], name: "Am7 Open" }],
  D_min7: [{ frets: [-1, -1, 0, 2, 1, 1], name: "Dm7 Open" }],
  E_min7: [{ frets: [0, 2, 2, 0, 3, 0], name: "Em7 Open" }],
  G_min7: [{ frets: [3, 5, 3, 3, 3, 3], name: "Gm7 Barre" }],
  D_sus2: [{ frets: [-1, -1, 0, 2, 3, 0], name: "Dsus2" }],
  A_sus2: [{ frets: [-1, 0, 2, 2, 0, 0], name: "Asus2" }],
  D_sus4: [{ frets: [-1, -1, 0, 2, 3, 3], name: "Dsus4" }],
  A_sus4: [{ frets: [-1, 0, 2, 2, 3, 0], name: "Asus4" }],
  G_sus4: [{ frets: [3, 3, 0, 0, 1, 3], name: "Gsus4" }],
  E_sus4: [{ frets: [0, 2, 2, 2, 0, 0], name: "Esus4" }],
  E_add9: [{ frets: [0, 2, 2, 1, 0, 2], name: "Eadd9" }],
  A_add9: [{ frets: [-1, 0, 2, 4, 2, 0], name: "Aadd9" }],
  C_dim:  [{ frets: [-1, -1, 1, 2, 1, 2], name: "Cdim" }],
  D_dim:  [{ frets: [-1, -1, 0, 1, 0, 1], name: "Ddim" }],
  E_aug:  [{ frets: [0, 3, 2, 1, 1, 0], name: "Eaug" }],
  A_aug:  [{ frets: [-1, 0, 3, 2, 2, 1], name: "Aaug" }],
};

function detectChord(soundingMidis: number[]): string {
  if (soundingMidis.length < 2) return "";
  const classes = [...new Set(soundingMidis.map((n) => ((n % 12) + 12) % 12))];
  // Exact match first
  for (const [qual, intervals] of Object.entries(CHORD_INTERVALS) as [ChordQuality, number[]][]) {
    for (let root = 0; root < 12; root++) {
      const chordSet = new Set(intervals.map((i) => (root + i) % 12));
      if (classes.length === chordSet.size && classes.every((c) => chordSet.has(c))) {
        return `${NOTE_NAMES[root]}${CHORD_LABEL[qual]}`;
      }
    }
  }
  // Subset match
  for (const [qual, intervals] of Object.entries(CHORD_INTERVALS) as [ChordQuality, number[]][]) {
    for (let root = 0; root < 12; root++) {
      const chordSet = new Set(intervals.map((i) => (root + i) % 12));
      if (classes.length >= 2 && classes.every((c) => chordSet.has(c))) {
        return `${NOTE_NAMES[root]}${CHORD_LABEL[qual]}`;
      }
    }
  }
  return "";
}

// ─────────────────────────── LAYOUT CONSTANTS (horizontal fretboard) ───────────────────────────

const H_S_GAP = 46;    // vertical spacing between strings
const H_F_GAP = 54;    // horizontal spacing between frets
const H_ML = 66;       // left margin (string labels + mute buttons inside SVG)
const H_MT = 26;       // top margin
const H_MB = 30;       // bottom margin (fret numbers)
const H_MR = 22;       // right margin
const H_NUT_W = 14;    // nut width
const SVG_W = H_ML + H_NUT_W + H_F_GAP * NUM_FRETS + H_MR;
const SVG_H = H_MT + H_S_GAP * (NUM_STRINGS - 1) + H_MB;

// String s → y-coordinate (string 0 = low E at bottom, string 5 = high e at top)
function sY(s: number) { return H_MT + (NUM_STRINGS - 1 - s) * H_S_GAP; }
// Fret f → x-coordinate of fret wire
function fX(f: number) { return H_ML + H_NUT_W + f * H_F_GAP; }
// Center of a fret slot:
function slotCX(f: number) { return H_ML + H_NUT_W + (f - 0.5) * H_F_GAP; }
function slotCY(s: number) { return sY(s); }

// ─────────────────────────── COLORS ───────────────────────────

const C = {
  bg: "#F1F5F9",
  panel: "#FFFFFF",
  panelBorder: "#E2E8F0",
  board: "#1E293B",
  boardSide: "#0F172A",
  fret: "#94A3B8",
  fretGlow: "#64748B",
  nutColor: "#E2E8F0",
  dot: "rgba(148,163,184,0.55)",
  dotDouble: "rgba(203,213,225,0.85)",
  str: (s: number) => (s < 3 ? "#F59E0B" : "#CBD5E1"), // wound = amber, plain = silver
  finger: "#4F46E5",
  fingerText: "#FFFFFF",
  fingerShadow: "rgba(79,70,229,0.45)",
  openNote: "#10B981",
  mutedColor: "#EF4444",
  capoBar: "#374151",
  capoBarBand: "#94A3B8",
  capoOnStand: "#4B5563",
  text: "#0F172A",
  textLight: "#64748B",
  accent: "#4F46E5",
  tag: "#EEF2FF",
  tagText: "#3730A3",
};

// ─────────────────────────── TYPES ───────────────────────────

interface Finger { stringIdx: number; fret: number }
interface CapoItem { id: number; fret: number | null }
interface DragInfo { capoId: number; currentX: number; currentY: number }

// ─────────────────────────── MINI CHORD DIAGRAM (for lookup) ───────────────────────────

function MiniChordDiagram({ voicing }: { voicing: Voicing }) {
  const showFrets = 5;
  const sm = 34; // string margin
  const fm = 28; // fret margin
  const width = sm + S_GAP * 0.8 * (NUM_STRINGS - 1) + sm;
  const height = fm + F_GAP * 0.8 * showFrets + fm;
  const sg = S_GAP * 0.8;
  const fg = F_GAP * 0.8;
  const sx = (s: number) => sm + s * sg;
  const topY = fm;

  // Compute display fret range
  const fretted = voicing.frets.filter((f) => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 1;
  const displayStart = Math.max(1, minFret - 1);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {/* Fretboard bg */}
      <rect x={sm - 8} y={topY - 4} width={sg * (NUM_STRINGS - 1) + 16} height={fg * showFrets + 8}
        rx={4} fill={C.board} />
      {/* Nut */}
      {displayStart === 1 && (
        <rect x={sm - 6} y={topY - 6} width={sg * (NUM_STRINGS - 1) + 12} height={8} rx={3} fill={C.nutColor} />
      )}
      {/* Fret number label if not starting at 1 */}
      {displayStart > 1 && (
        <text x={sm - 14} y={topY + fg * 0.5} textAnchor="end" fontSize="11" fill={C.textLight}>{displayStart}</text>
      )}
      {/* Fret wires */}
      {Array.from({ length: showFrets + 1 }, (_, i) => (
        <line key={i} x1={sm - 4} x2={sm + sg * (NUM_STRINGS - 1) + 4}
          y1={topY + i * fg} y2={topY + i * fg} stroke={C.fret} strokeWidth={i === 0 && displayStart > 1 ? 1.5 : 1.5} opacity={0.85} />
      ))}
      {/* Strings */}
      {Array.from({ length: NUM_STRINGS }, (_, s) => (
        <line key={s} x1={sx(s)} x2={sx(s)} y1={topY} y2={topY + fg * showFrets}
          stroke={C.str(s)} strokeWidth={s < 3 ? 1.6 : 1.1} opacity={0.9} />
      ))}
      {/* Open / muted indicators */}
      {voicing.frets.map((f, s) => {
        if (f === 0) {
          return <circle key={s} cx={sx(s)} cy={topY - 16} r={7} fill="none" stroke={C.openNote} strokeWidth={2} />;
        }
        if (f === -1) {
          return (
            <g key={s}>
              <line x1={sx(s) - 6} y1={topY - 22} x2={sx(s) + 6} y2={topY - 10} stroke={C.mutedColor} strokeWidth={2} />
              <line x1={sx(s) + 6} y1={topY - 22} x2={sx(s) - 6} y2={topY - 10} stroke={C.mutedColor} strokeWidth={2} />
            </g>
          );
        }
        return null;
      })}
      {/* Finger dots */}
      {voicing.frets.map((f, s) => {
        if (f <= 0) return null;
        const relFret = f - displayStart + 1;
        if (relFret < 1 || relFret > showFrets) return null;
        const cy = topY + (relFret - 0.5) * fg;
        return (
          <circle key={s} cx={sx(s)} cy={cy} r={10} fill={C.finger} filter="url(#fingerGlow)" />
        );
      })}
      <defs>
        <filter id="fingerGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#600" floodOpacity="0.45" />
        </filter>
      </defs>
      {/* String labels bottom */}
      {STRING_LABELS.map((lbl, s) => (
        <text key={s} x={sx(s)} y={height - 4} textAnchor="middle" fontSize="10" fill={C.textLight} fontWeight="600">{lbl}</text>
      ))}
    </svg>
  );
}

// ─────────────────────────── GUITAR APP ───────────────────────────

export function GuitarApp() {
  const [mode, setMode] = useState<"play" | "lookup" | "ideas">("play");
  const [fingers, setFingers] = useState<Finger[]>([]);
  const [mutedStrings, setMutedStrings] = useState<Set<number>>(new Set());
  const [capos, setCapos] = useState<CapoItem[]>([
    { id: 0, fret: null },
    { id: 1, fret: null },
    { id: 2, fret: null },
  ]);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ s: number; f: number } | null>(null);
  const [hoveredMute, setHoveredMute] = useState<number | null>(null);

  // Lookup state
  const [lookupRoot, setLookupRoot] = useState("E");
  const [lookupQuality, setLookupQuality] = useState<ChordQuality>("maj");
  const [lookupVoicingIdx, setLookupVoicingIdx] = useState(0);

  const fretboardRef = useRef<SVGSVGElement>(null);
  const standRef = useRef<HTMLDivElement>(null);

  // ── Capo logic ──
  const effectiveCapoFret = useCallback((): number => {
    const placed = capos.filter((c) => c.fret !== null).map((c) => c.fret!);
    return placed.length > 0 ? Math.min(...placed) : 0;
  }, [capos]);

  const getCapoAtFret = useCallback(
    (fret: number): CapoItem | null => capos.find((c) => c.fret === fret) ?? null,
    [capos]
  );

  // ── Sounding notes ──
  const soundingMidis = useCallback((): number[] => {
    const capoF = effectiveCapoFret();
    const result: number[] = [];
    for (let s = 0; s < NUM_STRINGS; s++) {
      if (mutedStrings.has(s)) continue;
      const finger = fingers.find((f) => f.stringIdx === s);
      const fret = finger ? finger.fret : capoF;
      if (finger && finger.fret < capoF) continue;
      result.push(TUNING_MIDI[s] + fret);
    }
    return result;
  }, [fingers, mutedStrings, effectiveCapoFret]);

  // ── Finger placement ──
  const handleSlotClick = useCallback(
    (stringIdx: number, fret: number) => {
      setFingers((prev) => {
        const exists = prev.find((f) => f.stringIdx === stringIdx && f.fret === fret);
        if (exists) return prev.filter((f) => !(f.stringIdx === stringIdx && f.fret === fret));
        return [...prev.filter((f) => f.stringIdx !== stringIdx), { stringIdx, fret }];
      });
      setMutedStrings((prev) => {
        const next = new Set(prev);
        next.delete(stringIdx);
        return next;
      });
    },
    []
  );

  const handleMuteClick = useCallback((stringIdx: number) => {
    setMutedStrings((prev) => {
      const next = new Set(prev);
      if (next.has(stringIdx)) {
        next.delete(stringIdx);
      } else {
        next.add(stringIdx);
        setFingers((f) => f.filter((fi) => fi.stringIdx !== stringIdx));
      }
      return next;
    });
  }, []);

  // ── Capo drag handling ──
  const startCapoDrag = useCallback((capoId: number, e: React.MouseEvent) => {
    e.preventDefault();
    setCapos((prev) => prev.map((c) => (c.id === capoId ? { ...c, fret: null } : c)));
    setDrag({ capoId, currentX: e.clientX, currentY: e.clientY });
  }, [capos]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: MouseEvent) => {
      setDrag((d) => d ? { ...d, currentX: e.clientX, currentY: e.clientY } : null);
    };
    const handleUp = (e: MouseEvent) => {
      if (fretboardRef.current) {
        const rect = fretboardRef.current.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        // Horizontal fretboard: fret determined by X, string range checked by Y
        const scaleX = SVG_W / rect.width;
        const scaleY = SVG_H / rect.height;
        const svgX = relX * scaleX;
        const svgY = relY * scaleY;
        if (svgY >= H_MT - 20 && svgY <= H_MT + H_S_GAP * (NUM_STRINGS - 1) + 20) {
          const rawFret = Math.round((svgX - (H_ML + H_NUT_W) + H_F_GAP * 0.5) / H_F_GAP);
          if (rawFret >= 1 && rawFret <= NUM_FRETS) {
            // Check no other capo is at this fret
            if (!capos.some((c) => c.fret === rawFret)) {
              setCapos((prev) => prev.map((c) => (c.id === drag.capoId ? { ...c, fret: rawFret } : c)));
              setDrag(null);
              return;
            }
          }
        }
      }
      // Return to stand
      setDrag(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [drag, capos]);

  const capFret = effectiveCapoFret();
  const midis = soundingMidis();
  const chordName = detectChord(midis);

  // Determine lookup voicings
  const lookupKey = `${lookupRoot}_${lookupQuality}`;
  const lookupVoicings = CHORD_DB[lookupKey] ?? [];
  const curVoicing = lookupVoicings[lookupVoicingIdx < lookupVoicings.length ? lookupVoicingIdx : 0];

  // Apply lookup voicing to play mode
  const applyVoicing = useCallback((v: Voicing) => {
    const newFingers: Finger[] = [];
    const newMuted = new Set<number>();
    v.frets.forEach((f, s) => {
      if (f === -1) newMuted.add(s);
      else if (f > 0) newFingers.push({ stringIdx: s, fret: f });
    });
    setFingers(newFingers);
    setMutedStrings(newMuted);
    setCapos([{ id: 0, fret: null }, { id: 1, fret: null }, { id: 2, fret: null }]);
    setMode("play");
  }, []);

  // ── Capo stand ──
  const standCapos = capos.filter((c) => c.fret === null);
  const placedCapos = capos.filter((c) => c.fret !== null);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #F1F5F9 0%, #E2E8F0 100%)",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      color: C.text,
      paddingBottom: 60,
    }}>
      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #334155 100%)",
        padding: "22px 32px 18px",
        boxShadow: "0 4px 18px rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 38, lineHeight: 1 }}>🎸</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#F8EDD4", letterSpacing: 1, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
              Guitar Explorer
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#D4B87A", letterSpacing: 0.5 }}>
              Strum, find notes, discover chords
            </p>
          </div>
        </div>
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 6, background: "rgba(0,0,0,0.25)", padding: "4px", borderRadius: 10, flexWrap: "wrap" }}>
          {([
            { id: "play", label: "🎵 Play" },
            { id: "lookup", label: "📖 Chord Lookup" },
            { id: "ideas", label: "🎼 Song Ideas" },
          ] as const).map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: mode === m.id ? "#6366F1" : "transparent",
              color: mode === m.id ? "#FFFFFF" : "#CBD5E1",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: 0.5,
              transition: "all 0.18s",
              boxShadow: mode === m.id ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      {mode === "play" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "24px 24px", alignItems: "center" }}>

          {/* ── Capo Stand ── */}
          <div ref={standRef} style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 14,
            padding: "12px 16px",
            width: "100%",
            maxWidth: SVG_W,
            boxShadow: "0 2px 10px rgba(15,23,42,0.08)",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase", textAlign: "center", whiteSpace: "nowrap" }}>
              Capo Stand
            </div>
            {/* Horizontal rail to hang capos */}
            <div style={{ position: "relative", height: 12, flex: 1, background: "linear-gradient(to bottom, #94A3B8, #CBD5E1, #94A3B8)", borderRadius: 6, margin: "0 8px" }}>
              {standCapos.map((capo, idx) => (
                <CapoShape
                  key={capo.id}
                  onStand
                  style={{ position: "absolute", top: "50%", left: idx * 56 + 14, transform: "translateY(-50%) rotate(90deg)", transformOrigin: "center center" }}
                  onMouseDown={(e) => startCapoDrag(capo.id, e)}
                />
              ))}
            </div>

            {standCapos.length === 0 && (
              <div style={{ textAlign: "center", color: C.textLight, fontSize: 11, fontStyle: "italic", whiteSpace: "nowrap" }}>
                All capos placed!
              </div>
            )}

            <div style={{ fontSize: 11, color: C.textLight, textAlign: "center", lineHeight: 1.5, whiteSpace: "nowrap" }}>
              Drag to fretboard
            </div>

            {/* Return buttons for placed capos */}
            {placedCapos.length > 0 && (
              <div style={{ width: "100%", borderTop: "1px solid #E2E8F0", paddingTop: 10, marginTop: 4 }}>
                <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, textAlign: "center", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Placed</div>
                {placedCapos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCapos((prev) => prev.map((x) => x.id === c.id ? { ...x, fret: null } : x))}
                    style={{
                      display: "block", width: "100%", marginBottom: 6,
                      padding: "5px 8px", borderRadius: 8, border: "1px solid #E2E8F0",
                      background: "#4F46E5", color: "#FFFFFF", fontSize: 11,
                      cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    }}
                    title="Return capo to stand"
                  >
                    Fret {c.fret} ✕
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Fretboard ── */}
          <div style={{ position: "relative", width: "100%", maxWidth: SVG_W, overflowX: "auto" }}>
            {/* Dragging capo overlay */}
            {drag && (
              <div style={{
                position: "fixed",
                left: drag.currentX - 44,
                top: drag.currentY - 14,
                pointerEvents: "none",
                zIndex: 999,
                opacity: 0.92,
                filter: "drop-shadow(0 4px 14px rgba(15,23,42,0.35))",
              }}>
                <CapoShape dragging />
              </div>
            )}

            <svg
              ref={fretboardRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{ display: "block", borderRadius: 12, boxShadow: "0 6px 28px rgba(15,23,42,0.38), 0 2px 8px rgba(15,23,42,0.18)", cursor: "default", width: SVG_W, height: SVG_H }}
            >
              <defs>
                <linearGradient id="boardGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F172A" />
                  <stop offset="8%" stopColor="#1E293B" />
                  <stop offset="92%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
                <filter id="fretGlow">
                  <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#94A3B8" floodOpacity="0.5" />
                </filter>
                <filter id="dotGlow">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#CBD5E1" floodOpacity="0.5" />
                </filter>
                <filter id="fingerShadow">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1E1B4B" floodOpacity="0.6" />
                </filter>
                <filter id="capoShadow">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.4" />
                </filter>
                <radialGradient id="fingerGrad" cx="38%" cy="32%">
                  <stop offset="0%" stopColor="#A5B4FC" />
                  <stop offset="100%" stopColor="#4338CA" />
                </radialGradient>
              </defs>

              {/* Fretboard background */}
              <rect x={H_ML} y={H_MT - 6}
                width={H_NUT_W + H_F_GAP * NUM_FRETS + H_MR - 12}
                height={H_S_GAP * (NUM_STRINGS - 1) + 12}
                rx={6} fill="url(#boardGrad)" />

              {/* Position markers (horizontal layout: dots between strings at fret slots) */}
              {Array.from({ length: NUM_FRETS }, (_, i) => {
                const f = i + 1;
                if (!POSITION_MARKERS.has(f)) return null;
                const cx = slotCX(f);
                const midY = (sY(2) + sY(3)) / 2;
                if (f === 12) {
                  return (
                    <g key={`marker${f}`}>
                      <circle cx={cx} cy={(sY(0) + sY(1)) / 2} r={7} fill={C.dotDouble} filter="url(#dotGlow)" />
                      <circle cx={cx} cy={(sY(4) + sY(5)) / 2} r={7} fill={C.dotDouble} filter="url(#dotGlow)" />
                    </g>
                  );
                }
                return <circle key={`marker${f}`} cx={cx} cy={midY} r={7} fill={C.dot} filter="url(#dotGlow)" />;
              })}

              {/* Fret numbers (bottom) */}
              {Array.from({ length: NUM_FRETS }, (_, i) => {
                const f = i + 1;
                return (
                  <text key={`fnum${f}`} x={slotCX(f)} y={H_MT + H_S_GAP * (NUM_STRINGS - 1) + H_MB - 4}
                    textAnchor="middle" fontSize="11" fill={C.fretGlow} fontWeight="600">
                    {f}
                  </text>
                );
              })}

              {/* Fret wires (vertical lines) */}
              {Array.from({ length: NUM_FRETS + 1 }, (_, i) => {
                const x = fX(i);
                return (
                  <g key={`fret${i}`}>
                    <line x1={x} x2={x}
                      y1={H_MT - 5} y2={H_MT + H_S_GAP * (NUM_STRINGS - 1) + 5}
                      stroke={C.fretGlow} strokeWidth={i === 0 ? 1.5 : 2}
                      filter="url(#fretGlow)" />
                  </g>
                );
              })}

              {/* Nut (vertical bar on left) */}
              <rect x={H_ML} y={H_MT - 6}
                width={H_NUT_W} height={H_S_GAP * (NUM_STRINGS - 1) + 12}
                rx={3} fill={C.nutColor}
                style={{ filter: "drop-shadow(2px 0 4px rgba(0,0,0,0.35))" }} />

              {/* Strings (horizontal lines) */}
              {Array.from({ length: NUM_STRINGS }, (_, s) => (
                <g key={`str${s}`}>
                  <line x1={H_ML + H_NUT_W} x2={fX(NUM_FRETS)}
                    y1={sY(s)} y2={sY(s)}
                    stroke={C.str(s)}
                    strokeWidth={s === 0 ? 3.2 : s === 1 ? 2.7 : s === 2 ? 2.2 : s === 3 ? 1.8 : s === 4 ? 1.4 : 1.1}
                    opacity={0.9} />
                </g>
              ))}

              {/* String labels + mute buttons (left side) */}
              {Array.from({ length: NUM_STRINGS }, (_, s) => {
                const y = sY(s);
                const isMuted = mutedStrings.has(s);
                return (
                  <g key={`head${s}`}>
                    <circle cx={H_ML - 28} cy={y} r={13}
                      fill={hoveredMute === s ? (isMuted ? "#DC2626" : "rgba(99,102,241,0.3)") : (isMuted ? C.mutedColor : "rgba(99,102,241,0.15)")}
                      stroke={isMuted ? C.mutedColor : C.accent}
                      strokeWidth={1.5}
                      style={{ cursor: "pointer", transition: "fill 0.15s" }}
                      onClick={() => handleMuteClick(s)}
                      onMouseEnter={() => setHoveredMute(s)}
                      onMouseLeave={() => setHoveredMute(null)}
                    />
                    {isMuted ? (
                      <g style={{ pointerEvents: "none" }}>
                        <line x1={H_ML - 34} y1={y - 6} x2={H_ML - 22} y2={y + 6} stroke={C.mutedColor} strokeWidth={2.5} strokeLinecap="round" />
                        <line x1={H_ML - 22} y1={y - 6} x2={H_ML - 34} y2={y + 6} stroke={C.mutedColor} strokeWidth={2.5} strokeLinecap="round" />
                      </g>
                    ) : (
                      <text x={H_ML - 28} y={y + 4} textAnchor="middle" fontSize="11" fill="#FFFFFF" fontWeight="800" style={{ pointerEvents: "none" }}>
                        {STRING_LABELS[s]}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Invisible clickable slots */}
              {Array.from({ length: NUM_STRINGS }, (_, s) =>
                Array.from({ length: NUM_FRETS }, (_, fi) => {
                  const f = fi + 1;
                  const cx = slotCX(f);
                  const cy = slotCY(s);
                  const isHovered = hoveredSlot?.s === s && hoveredSlot?.f === f;
                  const hasCapoHere = capos.some((c) => c.fret === f);
                  const isDisabled = f < capFret;
                  return (
                    <circle key={`slot${s}-${f}`}
                      cx={cx} cy={cy} r={20}
                      fill={isHovered && !isDisabled ? "rgba(99,102,241,0.18)" : "transparent"}
                      style={{ cursor: isDisabled || hasCapoHere ? "not-allowed" : "pointer" }}
                      onClick={() => !isDisabled && !hasCapoHere && handleSlotClick(s, f)}
                      onMouseEnter={() => !isDisabled && !hasCapoHere && setHoveredSlot({ s, f })}
                      onMouseLeave={() => setHoveredSlot(null)}
                    />
                  );
                })
              )}

              {/* Capos on fretboard (vertical bars in horizontal layout) */}
              {placedCapos.map((c) => {
                if (c.fret === null) return null;
                const x = slotCX(c.fret);
                const y1 = sY(NUM_STRINGS - 1) - 16;
                const y2 = sY(0) + 16;
                const midY = (y1 + y2) / 2;
                return (
                  <g key={`capo${c.id}`} style={{ cursor: "grab" }}
                    onMouseDown={(e) => startCapoDrag(c.id, e as unknown as React.MouseEvent)}
                    filter="url(#capoShadow)">
                    <defs>
                      <linearGradient id={`capoBodyGrad${c.id}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#475569" />
                        <stop offset="50%" stopColor="#334155" />
                        <stop offset="100%" stopColor="#475569" />
                      </linearGradient>
                    </defs>
                    {/* Capo body */}
                    <rect x={x - 14} y={y1} width={28} height={y2 - y1} rx={10}
                      fill={`url(#capoBodyGrad${c.id})`} stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} />
                    {/* Metal band */}
                    <rect x={x - 6} y={y1 - 4} width={12} height={y2 - y1 + 8} rx={6}
                      fill={C.capoBar} stroke={C.capoBarBand} strokeWidth={2} />
                    {/* Fret label */}
                    <text x={x} y={midY + 4} textAnchor="middle"
                      fontSize="10" fill="#F1F5F9" fontWeight="800"
                      style={{ pointerEvents: "none", letterSpacing: 0.5 }}>
                      {c.fret}
                    </text>
                    {/* Bolts */}
                    <circle cx={x} cy={y1 + 10} r={5} fill="#94A3B8" stroke="#64748B" strokeWidth={1.5} />
                    <circle cx={x} cy={y2 - 10} r={5} fill="#94A3B8" stroke="#64748B" strokeWidth={1.5} />
                  </g>
                );
              })}

              {/* Finger dots */}
              {fingers.map((f) => {
                const cx = slotCX(f.fret);
                const cy = slotCY(f.stringIdx);
                const midi = TUNING_MIDI[f.stringIdx] + f.fret;
                const noteName = midiToNoteName(midi);
                return (
                  <g key={`finger-${f.stringIdx}-${f.fret}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSlotClick(f.stringIdx, f.fret)}>
                    <circle cx={cx} cy={cy} r={19} fill="url(#fingerGrad)" filter="url(#fingerShadow)" />
                    <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                      fontSize="12" fontWeight="800" fill={C.fingerText}
                      style={{ pointerEvents: "none", letterSpacing: 0.2 }}>
                      {noteName}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* ── Info Panel (horizontal row below fretboard) ── */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", width: "100%", maxWidth: SVG_W, alignItems: "flex-start" }}>

            {/* Chord / Notes display */}
            <div style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 14,
              padding: "16px 18px",
              boxShadow: "0 2px 10px rgba(15,23,42,0.08)",
              minWidth: 150,
            }}>
              {chordName ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Chord</div>
                  <div style={{ fontSize: 34, fontWeight: 900, color: C.accent, letterSpacing: 1, lineHeight: 1, marginBottom: 4 }}>
                    {chordName}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.textLight, fontStyle: "italic", textAlign: "center", padding: "6px 0" }}>
                  {midis.length === 0 ? "No strings playing" : "Notes not in library"}
                </div>
              )}
              {midis.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {midis.map((m, i) => (
                    <span key={i} style={{
                      padding: "2px 8px", borderRadius: 999,
                      background: C.finger, color: C.fingerText,
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {midiToNoteName(m)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Capo info */}
            {capFret > 0 && (
              <div style={{
                background: "#EEF2FF",
                border: "1px solid #C7D2FE",
                borderRadius: 12,
                padding: "12px 16px",
                fontSize: 13,
                color: C.accent,
                fontWeight: 700,
              }}>
                🎚️ Capo at fret {capFret}
                <div style={{ fontWeight: 400, fontSize: 11, color: C.textLight, marginTop: 3 }}>
                  +{capFret} semitone{capFret !== 1 ? "s" : ""}
                </div>
              </div>
            )}

            {/* Per-string notes */}
            <div style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 14,
              padding: "14px 16px",
              boxShadow: "0 2px 10px rgba(15,23,42,0.08)",
              flex: 1,
              minWidth: 220,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Strings</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Array.from({ length: NUM_STRINGS }, (_, s) => {
                  const isMuted = mutedStrings.has(s);
                  const finger = fingers.find((f) => f.stringIdx === s);
                  const fret = finger ? finger.fret : capFret;
                  const belowCapo = finger && finger.fret < capFret;
                  const midi = TUNING_MIDI[s] + fret;
                  const noteName = midiToNoteName(midi);
                  return (
                    <div key={s} style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      opacity: isMuted || belowCapo ? 0.35 : 1,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.textLight }}>{STRING_LABELS[s]}</span>
                      <span style={{
                        fontSize: 10, color: C.textLight,
                        background: "#F1F5F9", borderRadius: 4, padding: "1px 5px",
                        minWidth: 22, textAlign: "center",
                      }}>
                        {finger ? `${finger.fret}` : capFret > 0 ? `${capFret}` : "0"}
                      </span>
                      {isMuted || belowCapo ? (
                        <span style={{ fontSize: 12, color: C.mutedColor }}>✕</span>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.finger, minWidth: 20, textAlign: "center" }}>{noteName}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clear button */}
            <button onClick={() => { setFingers([]); setMutedStrings(new Set()); }} style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              background: "#FFFFFF",
              color: C.textLight,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              alignSelf: "flex-start",
              transition: "all 0.15s",
            }}
              onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.accent; (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FFFFFF"; (e.currentTarget as HTMLButtonElement).style.color = C.textLight; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0"; }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {mode === "lookup" && (
        /* ─────── LOOKUP MODE ─────── */
        <div style={{ padding: "28px 24px", maxWidth: 840, margin: "0 auto" }}>

          {/* Selectors */}
          <div style={{
            display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center",
            background: "#FFFFFF",
            border: "1px solid #E2E8F0", borderRadius: 14, padding: "20px 24px",
            marginBottom: 28,
            boxShadow: "0 2px 10px rgba(15,23,42,0.07)",
          }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Root Note</label>
              <select value={lookupRoot} onChange={(e) => { setLookupRoot(e.target.value); setLookupVoicingIdx(0); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: C.text, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                {NOTE_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Quality</label>
              <select value={lookupQuality} onChange={(e) => { setLookupQuality(e.target.value as ChordQuality); setLookupVoicingIdx(0); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: C.text, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                {(Object.keys(CHORD_INTERVALS) as ChordQuality[]).map((q) => (
                  <option key={q} value={q}>{q === "maj" ? "Major" : q === "min" ? "Minor" : q === "7" ? "Dominant 7" : q === "maj7" ? "Major 7" : q === "min7" ? "Minor 7" : q === "dim" ? "Diminished" : q === "aug" ? "Augmented" : q === "sus2" ? "Sus 2" : q === "sus4" ? "Sus 4" : "Add 9"}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase" }}>Chord Tones</div>
              <div style={{ display: "flex", gap: 6 }}>
                {CHORD_INTERVALS[lookupQuality].map((interval) => {
                  const rootIdx = NOTE_NAMES.indexOf(lookupRoot);
                  const noteIdx = (rootIdx + interval) % 12;
                  return (
                    <span key={interval} style={{
                      padding: "4px 10px", borderRadius: 999,
                      background: C.finger, color: "#FFFFFF",
                      fontSize: 13, fontWeight: 700,
                    }}>
                      {NOTE_NAMES[noteIdx]}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Voicings */}
          {lookupVoicings.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 20px",
              background: "#FFFFFF",
              border: "1px solid #E2E8F0", borderRadius: 14,
              color: C.textLight, fontSize: 16, fontStyle: "italic",
            }}>
              No voicings stored for {lookupRoot}{CHORD_LABEL[lookupQuality]} yet.
              <br />
              <span style={{ fontSize: 13, marginTop: 8, display: "block" }}>Switch to Play mode and explore it manually!</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
              {lookupVoicings.map((v, idx) => (
                <div key={idx} style={{
                  background: "#FFFFFF",
                  border: `2px solid ${idx === lookupVoicingIdx ? C.accent : "#E2E8F0"}`,
                  borderRadius: 16,
                  padding: "20px 18px",
                  boxShadow: idx === lookupVoicingIdx ? `0 4px 18px rgba(79,70,229,0.2)` : "0 2px 10px rgba(15,23,42,0.07)",
                  cursor: "pointer",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  minWidth: 200,
                }}
                  onClick={() => setLookupVoicingIdx(idx)}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: C.text }}>
                    {lookupRoot}{CHORD_LABEL[lookupQuality]}
                    <span style={{ fontSize: 12, fontWeight: 400, color: C.textLight, marginLeft: 8 }}>{v.name}</span>
                  </div>

                  {/* Mini diagram */}
                  <MiniChordDiagram voicing={v} />

                  {/* Fret notation */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                    {v.frets.map((f, s) => (
                      <div key={s} style={{ textAlign: "center" }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 8,
                          background: f === -1 ? "#9B2020" : f === 0 ? C.openNote : C.finger,
                          color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
                        }}>
                          {f === -1 ? "✕" : f === 0 ? "○" : f}
                        </div>
                        <div style={{ fontSize: 9, color: C.textLight, marginTop: 2 }}>{STRING_LABELS[s]}</div>
                      </div>
                    ))}
                  </div>

                  <button onClick={(e) => { e.stopPropagation(); applyVoicing(v); }} style={{
                    padding: "8px 18px", borderRadius: 10, border: "none",
                    background: C.finger, color: "#FFFFFF",
                    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 2px 8px rgba(79,70,229,0.3)",
                    letterSpacing: 0.5,
                  }}>
                    Play this shape →
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tips */}
          <div style={{
            marginTop: 28, padding: "16px 20px",
            background: "#EEF2FF", border: "1px solid #C7D2FE",
            borderRadius: 12, fontSize: 13, color: C.textLight, lineHeight: 1.7,
          }}>
            <strong style={{ color: C.accent }}>💡 Tips:</strong> Click <em>"Play this shape →"</em> to switch to Play mode with the fingering applied.
            Use capos on the Play tab to transpose any chord shape.
            The {" "}<span style={{ fontWeight: 700, color: C.finger }}>indigo dots</span> show finger placement, {" "}
            <span style={{ fontWeight: 700, color: C.openNote }}>○</span> means open string, and{" "}
            <span style={{ fontWeight: 700, color: C.mutedColor }}>✕</span> means muted.
          </div>
        </div>
      )}

      {/* ── Song Ideas Mode ── */}
      {mode === "ideas" && <SongIdeas />}

      {/* ── Footer tip ── */}
      {mode === "play" && (
        <div style={{ textAlign: "center", padding: "0 24px 0", fontSize: 12, color: C.textLight, fontStyle: "italic" }}>
          Click strings to place fingers · Click heads to mute/unmute · Drag capos from the stand · Click a placed finger to remove it
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── CAPO SHAPE SVG ───────────────────────────

function CapoShape({
  onStand = false,
  dragging = false,
  style = {},
  onMouseDown,
}: {
  onStand?: boolean;
  dragging?: boolean;
  style?: React.CSSProperties;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  const w = 88, h = 28;
  return (
    <div
      style={{
        width: w, height: h,
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
        ...style,
      }}
      onMouseDown={onMouseDown}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={`capoStandGrad${onStand ? "s" : "d"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="40%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
        </defs>
        {/* Body */}
        <rect x={2} y={2} width={w - 4} height={h - 4} rx={10} fill={`url(#capoStandGrad${onStand ? "s" : "d"})`} stroke="rgba(0,0,0,0.25)" strokeWidth={1.5} />
        {/* Metal band */}
        <rect x={0} y={8} width={w} height={12} rx={6} fill="#334155" stroke="#94A3B8" strokeWidth={2} />
        {/* Bolt left */}
        <circle cx={12} cy={14} r={4} fill="#94A3B8" stroke="#64748B" strokeWidth={1.5} />
        {/* Bolt right */}
        <circle cx={w - 12} cy={14} r={4} fill="#94A3B8" stroke="#64748B" strokeWidth={1.5} />
        {/* Label */}
        <text x={w / 2} y={17} textAnchor="middle" fontSize="9" fill="#F8FAFC" fontWeight="800" letterSpacing="0.5">
          CAPO
        </text>
      </svg>
    </div>
  );
}

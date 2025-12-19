// path: src/Banagrams/engine_2/Game.tsx
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DISTRIBUTION } from "./_distribution"; // uses your provided file
import { reducer } from "./reducer";
import { useBoardSync } from "./hooks/useBoardSync";
import type { GameState, TileId, TileState, TilesById } from "./types";

// ---------- Utilities ----------
function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createBag(): string[] {
  const bag: string[] = [];
  for (const [letter, count] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  return shuffleArray(bag);
}

function initialState(): GameState {
  return {
    selfId: "local",
    tiles: {} as TilesById,
    rack: [],
    selection: {},
    drag: { kind: "none" },
    bag: createBag(),
    dictionary: { status: "unloaded", words: null },
    requests: {},
    remoteBoards: {},
  };
}

// ---------- Styling helpers ----------
function rackTileStyle(tileSize: number): React.CSSProperties {
  return {
    width: tileSize,
    height: tileSize,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    borderRadius: 10,
    background: "linear-gradient(180deg,#fff6d6,#ffe88a)",
    boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)",
    color: "#2b2b2b",
    userSelect: "none",
    flex: "0 0 auto",
  };
}

function boardTileStyle(tileSize: number): React.CSSProperties {
  return {
    width: tileSize,
    height: tileSize,
    borderRadius: 10,
    background: "linear-gradient(180deg,#fff6d6,#ffe88a)",
    boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)",
    fontWeight: 900,
    color: "#2b2b2b",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    userSelect: "none",
  };
}

// ---------- Component ----------
export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const [dictStatus, setDictStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // derive ids once from URL; persist user for convenience
  const [ids] = useState(() => {
    const qs = new URLSearchParams(window.location.search);
    const gameId = qs.get("game") || "demo-game-1";
    const urlUser = (qs.get("user") || "").trim();
    const persisted = localStorage.getItem("banagrams_userId") || "";
    const chosenUser = urlUser || persisted || `guest-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem("banagrams_userId", chosenUser);
    return { gameId, chosenUser };
  });

  // ensure state.selfId matches chosenUser (effect, not render)
  useEffect(() => {
    if (state.selfId !== ids.chosenUser) {
      dispatch({ type: "STATE_REPLACE", next: { ...state, selfId: ids.chosenUser } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.chosenUser]);

  // IMPORTANT: write to RTDB using the stable URL-derived userId
  useBoardSync(ids.gameId, ids.chosenUser, state, dispatch);

  // draw initial 10 AFTER userId is known to avoid writing under "local"
  useEffect(() => {
    if (state.rack.length === 0 && state.bag.length > 0) {
      dispatch({ type: "DRAW", count: 10 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.chosenUser]);

  // Load dictionary from English Words.txt once
  useEffect(() => {
    if (dictStatus === "loading" || dictStatus === "ready") return;
    setDictStatus("loading");
    (async () => {
      try {
        const url = new URL("../dictionary.txt", import.meta.url).toString();
        const txt = await (await fetch(url)).text();
        const words = new Set<string>();
        txt.split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((w) => {
            const cleaned = w.replace(/[^A-Za-z]/g, "").toUpperCase();
            if (cleaned.length >= 2) words.add(cleaned);
          });
        setDictionary(words);
        setDictStatus("ready");
      } catch (err) {
        console.warn("Failed to load dictionary", err);
        setDictStatus("error");
      }
    })();
  }, [dictStatus]);


  // Layout constants...
  const HEADER_H = 72;
  const RACK_MIN_H = 120;
  const RACK_MAX_H = 240;

  const GAP = 6;
  const [tileSize, setTileSize] = useState(52);
  const cell = tileSize + GAP;
  // ...

  // Board measurement
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBoardSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setBoardSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // Responsive tile size
  useEffect(() => {
    function compute() {
      const availableW = window.innerWidth - 24;
      const availableH = window.innerHeight - HEADER_H - RACK_MIN_H - 24;
      const sizeByW = Math.floor(availableW / 14);
      const sizeByH = Math.floor(availableH / 12);
      setTileSize(Math.max(30, Math.min(68, Math.min(sizeByW, sizeByH))));
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Derived sets
  const boardTiles = useMemo(
    () => Object.values(state.tiles).filter((t) => t.location === "board"),
    [state.tiles]
  );
  const rackTiles = useMemo(
    () => state.rack.map((id) => state.tiles[id]).filter(Boolean) as TileState[],
    [state.rack, state.tiles]
  );

  // Determine valid/invalid tiles (horizontal and vertical contiguous runs, length>=2) when dictionary is ready
  const validity = useMemo(() => {
    if (!dictionary) return null;
    const boardOnly = boardTiles.filter((t) => Number.isInteger(t.pos.x) && Number.isInteger(t.pos.y));
    if (boardOnly.length === 0) return { valid: new Set<TileId>(), invalid: new Set<TileId>() };

    const byRow: Record<number, TileState[]> = {};
    const byCol: Record<number, TileState[]> = {};
    for (const t of boardOnly) {
      (byRow[t.pos.y] ||= []).push(t);
      (byCol[t.pos.x] ||= []).push(t);
    }

    const valid = new Set<TileId>();
    const invalid = new Set<TileId>();
    const singletons: TileState[] = [];

    function process(group: TileState[], axis: "row" | "col") {
      if (!dictionary) return
      const sorted = group.slice().sort((a, b) => (axis === "row" ? a.pos.x - b.pos.x : a.pos.y - b.pos.y));
      let run: TileState[] = [];
      for (let i = 0; i <= sorted.length; i++) {
        const curr = sorted[i];
        const prev = sorted[i - 1];
        const isBreak =
          i === sorted.length ||
          (prev && curr && (axis === "row" ? curr.pos.x - prev.pos.x > 1 : curr.pos.y - prev.pos.y > 1));
        if (isBreak) {
          if (run.length === 1) {
            singletons.push(run[0]);
          } else if (run.length >= 2) {
            const word = run.map((t) => t.letter).join("").toUpperCase();
            const isValid = dictionary.has(word);
            for (const t of run) (isValid ? valid : invalid).add(t.id);
          }
          run = [];
        }
        if (i < sorted.length) run.push(curr!);
      }
    }

    Object.values(byRow).forEach((row) => process(row, "row"));
    Object.values(byCol).forEach((col) => process(col, "col"));

    for (const t of singletons) {
      if (!valid.has(t.id)) invalid.add(t.id);
    }

    for (const t of boardOnly) {
      if (!valid.has(t.id) && !invalid.has(t.id)) invalid.add(t.id);
    }

    return { valid, invalid };
  }, [boardTiles, dictionary]);

  // Grid background aligned so origin is board center
  const gridBg = useMemo(() => {
    const line = "rgba(0,0,0,0.12)";
    const bg = "#f6e1b3";
    const cx = Math.round(boardSize.w / 2);
    const cy = Math.round(boardSize.h / 2);
    return {
      backgroundColor: bg,
      backgroundImage: `
        linear-gradient(to right, ${line} 1px, transparent 1px),
        linear-gradient(to bottom, ${line} 1px, transparent 1px)
      `,
      backgroundSize: `${cell}px ${cell}px`,
      backgroundPosition: `${cx}px ${cy}px`,
    } as React.CSSProperties;
  }, [cell, boardSize.w, boardSize.h]);

  // world -> px (tile centers on cell centers)
  function worldToPx(pos: { x: number; y: number }) {
    const cx = boardSize.w / 2;
    const cy = boardSize.h / 2;
    return {
      left: cx + (pos.x + 0.5) * cell - tileSize / 2,
      top: cy + (pos.y + 0.5) * cell - tileSize / 2,
    };
  }

  // Pointer drop -> world coords (snap to square under cursor)
  function dropEventToWorld(e: React.DragEvent<HTMLDivElement>) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const wx = Math.floor((xPx - cx) / cell);
    const wy = Math.floor((yPx - cy) / cell);
    return { x: wx, y: wy };
  }

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: "'Fredoka', system-ui, sans-serif",
        background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "sticky",
          top: 0,
          zIndex: 50,
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => dispatch({ type: "DRAW", count: 1 })}
            disabled={state.bag.length === 0}
            style={{
              padding: "10px 14px",
              background: "#ffd54f",
              borderRadius: 12,
              border: "none",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              fontWeight: 800,
            }}
          >
            Peel
          </button>

          <button
            onClick={() => dispatch({ type: "CENTER_BOARD" })}
            style={{
              padding: "10px 14px",
              background: "rgba(255,255,255,0.92)",
              borderRadius: 12,
              border: "none",
              boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
              fontWeight: 700,
            }}
          >
            Center Board
          </button>
        </div>
      </header>

      {/* Board */}
      <div
        ref={boardRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          ...gridBg,
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("application/tile-id") as TileId;
          if (!id) return;
          const from = e.dataTransfer.getData("application/from");
          const pos = dropEventToWorld(e);
          if (!pos) return;
          if (from === "board") {
            dispatch({ type: "MOVE_TILE", tileId: id, pos });
          } else {
            dispatch({ type: "PLACE_TILE", tileId: id, pos });
          }
        }}
      >
        {boardTiles.map((t) => {
          const { left, top } = worldToPx(t.pos);
          const color = validity && dictionary
            ? validity.invalid.has(t.id)
              ? "#b3261e" // any invalid run takes precedence
              : validity.valid.has(t.id)
                ? "#1a7f37" // only valid, no invalid overlap
                : "#b3261e" // unclassified defaults to red
            : "#2b2b2b";
          return (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/tile-id", t.id);
                e.dataTransfer.setData("application/from", "board");
                try {
                  e.dataTransfer.effectAllowed = "move";
                } catch {}
              }}
              style={{
                position: "absolute",
                left,
                top,
                ...boardTileStyle(tileSize),
                paddingBottom: Math.max(6, tileSize * 0.32),
                color,
              }}
            >
              <span style={{ fontSize: Math.max(18, tileSize * 0.5), lineHeight: 1 }}>
                {t.letter}
              </span>
            </div>
          );
        })}
      </div>

      {/* Rack */}
      <div
        className="border-t border-gray-200 bg-slate-100/80 dark:bg-slate-800/80"
        style={{
          backdropFilter: "blur(4px)",
          minHeight: RACK_MIN_H,
          maxHeight: RACK_MAX_H,
          zIndex: 60,
          overflow: "hidden",
        }}
      >
        <div
          className="w-full max-w-6xl mx-auto"
          style={{
            height: "100%",
            padding: 12,
            display: "flex",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {/* tiles */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start" }}>
              {rackTiles.length === 0 ? (
                <div className="text-muted-foreground">No tiles.</div>
              ) : (
                rackTiles.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/tile-id", t.id);
                      e.dataTransfer.setData("application/from", "rack");
                      try {
                        e.dataTransfer.effectAllowed = "move";
                      } catch {}
                    }}
                    style={rackTileStyle(tileSize)}
                    title={t.letter}
                  >
                    <span style={{ fontSize: Math.max(18, tileSize * 0.5), lineHeight: 1 }}>
                      {t.letter}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* right controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <div className="text-sm text-muted-foreground">Bag: {state.bag.length}</div>

            <div
              className="w-35 h-20 bg-red-200 border border-red-400 rounded flex items-center justify-center text-sm"
              style={{ minWidth: 80 }}
              title="Drop a rack tile here to dump it and draw replacement(s)"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("application/tile-id") as TileId;
                const from = e.dataTransfer.getData("application/from");
                if (!id || from !== "rack") return;
                dispatch({ type: "DUMP_TILE", tileId: id });
              }}
            >
              Dumperooni
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

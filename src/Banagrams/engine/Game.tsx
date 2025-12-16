import React, { useEffect, useMemo, useReducer, useState } from "react";
import { DISTRIBUTION } from "../_distribution";
import { reducer } from "./reducer";
import type { GameState, TileState } from "./types";

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
    tiles: {},
    rack: [],
    selection: {},
    drag: { kind: "none" },
    bag: createBag(),
    dictionary: { status: "unloaded", words: null },
    requests: {},
    remoteBoards: {},
  };
}

function rackTileStyle(tileSize: number, gap: number): React.CSSProperties {
  return {
    width: tileSize,
    height: tileSize,
    marginRight: gap,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    borderRadius: 8,
    background: "linear-gradient(180deg,#fff6d6,#ffe88a)",
    boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)",
    color: "#2b2b2b",
  };
}

// ---------- UI Component ----------
export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // draw initial 10 tiles
  useEffect(() => {
    dispatch({ type: "DRAW", count: 10 });
  }, []);

  const GRID_SIZE = 13;
  const gap = 6;
  const RACK_HEIGHT_PX = 20;
  const [tileSize, setTileSize] = useState(48);

  useEffect(() => {
    function compute() {
      const top = 72;
      const bottom = 140;
      const availableW = window.innerWidth - 40;
      const availableH = window.innerHeight - top - bottom - 40;
      const sizeByW = Math.floor((availableW - gap * (GRID_SIZE - 1)) / GRID_SIZE);
      const sizeByH = Math.floor((availableH - gap * (GRID_SIZE - 1)) / GRID_SIZE);
      const size = Math.max(28, Math.min(64, Math.min(sizeByW, sizeByH)));
      setTileSize(size);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const boardTiles = useMemo(
    () => Object.values(state.tiles).filter((t) => t.location === "board"),
    [state.tiles]
  );

  const rackTiles = useMemo(
    () => state.rack.map((id) => state.tiles[id]).filter(Boolean) as TileState[],
    [state.rack, state.tiles]
  );

  return (
    <div
      className="min-h-screen relative"
      style={{ fontFamily: "'Fredoka', system-ui, sans-serif", background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)" }}
    >
      {/* Top controls */}
      <header style={{ position: "fixed", left: 0, right: 0, top: 16, display: "flex", justifyContent: "center", zIndex: 60 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => dispatch({ type: "DRAW", count: 1 })}
            disabled={state.bag.length === 0}
            style={{ padding: "10px 14px", background: "#ffd54f", borderRadius: 12, border: "none", boxShadow: "0 6px 18px rgba(0,0,0,0.08)", fontWeight: 700 }}
          >
            Peel
          </button>
          <button
            onClick={() => dispatch({ type: "CENTER_BOARD" })}
            style={{ padding: "10px 14px", background: "rgba(255,255,255,0.9)", borderRadius: 10, border: "none", boxShadow: "0 4px 10px rgba(0,0,0,0.06)" }}
          >
            Center Board
          </button>
        </div>
      </header>

      {/* Board area */}
      <div className="w-full h-screen" style={{ position: "absolute", inset: 0, padding: 0 }}>
        <div
          style={{ width: GRID_SIZE * (tileSize + gap) + 4 * gap, height: GRID_SIZE * (tileSize + gap) + 4 * gap, borderRadius: 18, background: "linear-gradient(180deg,#7b5a2b 0%, #a6783a 100%)", boxShadow: "0 18px 60px rgba(33,30,29,0.18)", padding: 14, margin: "auto", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 30 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${GRID_SIZE}, ${tileSize}px)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, ${tileSize}px)`,
              gap: `${gap}px`,
              background: "linear-gradient(180deg,#edd6a1,#f6e1b3)",
              padding: 0,
              borderRadius: 6,
            }}
          >
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
              const x = idx % GRID_SIZE;
              const y = Math.floor(idx / GRID_SIZE);
              const tile = boardTiles.find((t) => Math.round(t.pos.x) === x && Math.round(t.pos.y) === y);
              return (
                <div
                  key={`${x},${y}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("application/tile-id");
                    if (!id) return;
                    const isBoard = e.dataTransfer.getData("application/from") === "board";
                    if (isBoard) {
                      dispatch({ type: "MOVE_TILE", tileId: id, pos: { x, y } });
                    } else {
                      dispatch({ type: "PLACE_TILE", tileId: id, pos: { x, y } });
                    }
                  }}
                  style={{ minWidth: tileSize, minHeight: tileSize, border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {tile ? (
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/tile-id", tile.id);
                        e.dataTransfer.setData("application/from", "board");
                        try { e.dataTransfer.effectAllowed = "move"; } catch {}
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: 8,
                        background: "linear-gradient(180deg,#fff6d6,#ffe88a)",
                        boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)",
                        fontWeight: 800,
                        color: "#2b2b2b",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        paddingBottom: Math.max(4, tileSize * 0.35),
                      }}
                    >
                      <span style={{ fontSize: Math.max(14, tileSize * 0.36), lineHeight: 1 }}>{tile.letter}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom rack and dump */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-100/80 dark:bg-slate-800/80 border-t border-gray-200 p-3" style={{ zIndex: 10, backdropFilter: "blur(4px)" }}>
        <div className="max-w-6xl mx-auto flex items-center" style={{ height: "100%" }}>
          <div className="flex overflow-x-auto space-x-2 py-1" style={{ flex: 1 }}>
            {rackTiles.length === 0 ? (
              <div className="text-muted-foreground">No tiles.</div>
            ) : (
              rackTiles.map((t, idx) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/tile-id", t.id);
                    e.dataTransfer.setData("application/from", "rack");
                    try { e.dataTransfer.effectAllowed = "move"; } catch {}
                  }}
                  style={rackTileStyle(tileSize, gap)}
                  title={t.letter}
                >
                  {t.letter}
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 12 }}>
            <div className="text-sm text-muted-foreground">Bag: {state.bag.length}</div>
            <div
              className="w-20 h-20 bg-red-200 border border-red-400 rounded flex items-center justify-center text-sm"
              style={{ minWidth: 80 }}
              title="Drop here to dump and draw 3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("application/tile-id");
                if (!id) return;
                // TODO: dispatch dump action; for now just return tile to rack if it was on board
                if (e.dataTransfer.getData("application/from") === "board") {
                  dispatch({ type: "MOVE_TILE", tileId: id, pos: { x: 0, y: 0 } });
                }
              }}
            >
              Dump
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
// import { DISTRIBUTION } from "../_distribution";
// import { reducer } from "./reducer";
// import type { GameState, TileId, TileState } from "./types";

// // ---------- Utilities ----------
// function shuffleArray<T>(arr: T[]): T[] {
//   const a = arr.slice();
//   for (let i = a.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [a[i], a[j]] = [a[j], a[i]];
//   }
//   return a;
// }

// function createBag(): string[] {
//   const bag: string[] = [];
//   for (const [letter, count] of Object.entries(DISTRIBUTION)) {
//     for (let i = 0; i < count; i++) bag.push(letter);
//   }
//   return shuffleArray(bag);
// }

// function initialState(): GameState {
//   return {
//     selfId: "local",
//     tiles: {},
//     rack: [],
//     selection: {},
//     drag: { kind: "none" },
//     bag: createBag(),
//     dictionary: { status: "unloaded", words: null },
//     requests: {},
//     remoteBoards: {},
//   };
// }

// function rackTileStyle(tileSize: number, gap: number): React.CSSProperties {
//   return {
//     width: tileSize,
//     height: tileSize,
//     marginRight: gap,
//     display: "inline-flex",
//     alignItems: "center",
//     justifyContent: "center",
//     fontWeight: 800,
//     borderRadius: 8,
//     background: "linear-gradient(180deg,#fff6d6,#ffe88a)",
//     boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)",
//     color: "#2b2b2b",
//     userSelect: "none",
//   };
// }

// function boardTileStyle(tileSize: number): React.CSSProperties {
//   return {
//     width: tileSize,
//     height: tileSize,
//     borderRadius: 8,
//     background: "linear-gradient(180deg,#fff6d6,#ffe88a)",
//     boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)",
//     fontWeight: 800,
//     color: "#2b2b2b",
//     display: "flex",
//     alignItems: "flex-end",
//     justifyContent: "center",
//     userSelect: "none",
//   };
// }

// // ---------- UI Component ----------
// export default function Game() {
//   const [state, dispatch] = useReducer(reducer, undefined, initialState);

//   // draw initial 10 tiles
//   useEffect(() => {
//     dispatch({ type: "DRAW", count: 10 });
//   }, []);

//   const gap = 6;
//   const RACK_HEIGHT_PX = 140; // real rack height now
//   const HEADER_HEIGHT_PX = 72;

//   const [tileSize, setTileSize] = useState(48);
//   const boardRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     function compute() {
//       const availableW = window.innerWidth - 24;
//       const availableH = window.innerHeight - HEADER_HEIGHT_PX - RACK_HEIGHT_PX - 24;

//       // Pick a size that feels good; clamp so it never gets silly.
//       const sizeByW = Math.floor(availableW / 14);
//       const sizeByH = Math.floor(availableH / 12);
//       const size = Math.max(28, Math.min(64, Math.min(sizeByW, sizeByH)));

//       setTileSize(size);
//     }
//     compute();
//     window.addEventListener("resize", compute);
//     return () => window.removeEventListener("resize", compute);
//   }, []);

//   const cell = tileSize + gap;

//   const boardTiles = useMemo(
//     () => Object.values(state.tiles).filter((t) => t.location === "board"),
//     [state.tiles]
//   );

//   const rackTiles = useMemo(
//     () => state.rack.map((id) => state.tiles[id]).filter(Boolean) as TileState[],
//     [state.rack, state.tiles]
//   );

//   // Faster lookup + stable render
//   const boardByCoord = useMemo(() => {
//     const m = new Map<string, TileState>();
//     for (const t of boardTiles) {
//       m.set(`${Math.round(t.pos.x)},${Math.round(t.pos.y)}`, t);
//     }
//     return m;
//   }, [boardTiles]);

//   // We keep world coords (tile units) in state.
//   // UI converts world coord -> px centered on the viewport.
//   function worldToPx(pos: { x: number; y: number }, boardRect: DOMRect) {
//     const cx = boardRect.width / 2;
//     const cy = boardRect.height / 2;
//     return {
//         left: cx + (pos.x + 0.5) * cell - tileSize / 2,
//         top:  cy + (pos.y + 0.5) * cell - tileSize / 2,
//     };
//   }

//   function dropEventToWorld(e: React.DragEvent<HTMLDivElement>) {
//     const el = boardRef.current;
//     if (!el) return null;
//     const rect = el.getBoundingClientRect();

//     const cx = rect.width / 2;
//     const cy = rect.height / 2;

//     const xPx = e.clientX - rect.left;
//     const yPx = e.clientY - rect.top;

//     // Convert px -> world tile coords, snap to integer
//     // const wx = Math.round((xPx - cx) / cell);
//     // const wy = Math.round((yPx - cy) / cell);
//     const wx = Math.floor(((xPx - cx) + cell / 2) / cell);
//     const wy = Math.floor(((yPx - cy) + cell / 2) / cell);

//     return { x: wx, y: wy };
//   }

//   function toggleSelection(id: TileId) {
//     const nextIds = new Set(Object.keys(state.selection));
//     if (nextIds.has(id)) nextIds.delete(id);
//     else nextIds.add(id);
//     dispatch({ type: "SELECT_SET", tileIds: Array.from(nextIds) });
//   }

//   // ----- Board "infinite grid" background -----
//   const gridBg = useMemo(() => {
//     // Two repeating gradients = grid lines
//     const line = "rgba(0,0,0,0.08)";
//     const bg = "#f6e1b3";

//     return {
//       backgroundColor: bg,
//       backgroundImage: `
//         linear-gradient(to right, ${line} 1px, transparent 1px),
//         linear-gradient(to bottom, ${line} 1px, transparent 1px)
//       `,
//       backgroundSize: `${cell}px ${cell}px`,
//     } as React.CSSProperties;
//   }, [cell]);

//   return (
//     <div
//       className="min-h-screen"
//       style={{
//         fontFamily: "'Fredoka', system-ui, sans-serif",
//         background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)",
//         height: "100vh",
//         display: "flex",
//         flexDirection: "column",
//       }}
//     >
//       {/* Top controls */}
//       <header
//         style={{
//           height: HEADER_HEIGHT_PX,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "center",
//           position: "sticky",
//           top: 0,
//           zIndex: 60,
//           paddingTop: 12,
//           paddingBottom: 12,
//         }}
//       >
//         <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
//           <button
//             onClick={() => dispatch({ type: "DRAW", count: 1 })}
//             disabled={state.bag.length === 0}
//             style={{
//               padding: "10px 14px",
//               background: "#ffd54f",
//               borderRadius: 12,
//               border: "none",
//               boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
//               fontWeight: 700,
//             }}
//           >
//             Peel
//           </button>

//           <button
//             onClick={() => dispatch({ type: "CENTER_BOARD" })}
//             style={{
//               padding: "10px 14px",
//               background: "rgba(255,255,255,0.9)",
//               borderRadius: 10,
//               border: "none",
//               boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
//             }}
//           >
//             Center Board
//           </button>

//           <button
//             onClick={() => dispatch({ type: "SELECT_CLEAR" })}
//             style={{
//               padding: "10px 14px",
//               background: "rgba(255,255,255,0.7)",
//               borderRadius: 10,
//               border: "none",
//               boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
//             }}
//             title="Clear selected rack tiles"
//           >
//             Clear Selection
//           </button>
//         </div>
//       </header>

//       {/* Board: fills all remaining space, grid to the edges, no border container */}
//       <div
//         ref={boardRef}
//         style={{
//           position: "relative",
//           flex: 1,
//           overflow: "hidden",
//           ...gridBg,
//         }}
//         onDragOver={(e) => e.preventDefault()}
//         onDrop={(e) => {
//           const id = e.dataTransfer.getData("application/tile-id");
//           if (!id) return;

//           const from = e.dataTransfer.getData("application/from");
//           const world = dropEventToWorld(e);
//           if (!world) return;

//           if (from === "board") {
//             dispatch({ type: "MOVE_TILE", tileId: id, pos: world });
//           } else {
//             dispatch({ type: "PLACE_TILE", tileId: id, pos: world });
//           }
//         }}
//         onClick={() => {
//           // clicking empty board clears rack selection (nice UX; doesn’t break anything)
//           if (Object.keys(state.selection).length > 0) dispatch({ type: "SELECT_CLEAR" });
//         }}
//       >
//         {/* Render tiles absolutely over the infinite grid */}
//         {boardRef.current
//           ? boardTiles.map((t) => {
//               const rect = boardRef.current!.getBoundingClientRect();
//               const { left, top } = worldToPx(t.pos, rect);

//               return (
//                 <div
//                   key={t.id}
//                   draggable
//                   onDragStart={(e) => {
//                     e.dataTransfer.setData("application/tile-id", t.id);
//                     e.dataTransfer.setData("application/from", "board");
//                     try {
//                       e.dataTransfer.effectAllowed = "move";
//                     } catch {}
//                   }}
//                   style={{
//                     position: "absolute",
//                     left,
//                     top,
//                     ...boardTileStyle(tileSize),
//                     paddingBottom: Math.max(4, tileSize * 0.35),
//                   }}
//                 >
//                   <span style={{ fontSize: Math.max(16, tileSize * 0.44), lineHeight: 1 }}>{t.letter}</span>
//                 </div>
//               );
//             })
//           : null}
//       </div>

//       {/* Bottom rack and dump (fixed-height, always visible at bottom) */}
//       <div
//         className="border-t border-gray-200 bg-slate-100/80 dark:bg-slate-800/80"
//         style={{
//           minHeight: 120, 
//           maxHeight: 220,
//           backdropFilter: "blur(4px)",
//           zIndex: 70,
//           display: "flex",
//           alignItems: "center",
//         }}
//       >
//         <div className="w-full max-w-6xl mx-auto flex items-center px-3" style={{ height: "100%" }}>
//           <div
//             className="flex flex-wrap gap-2 py-1"
//             style={{ flex: 1, alignContent: "flex-start", overflowY: "auto", maxHeight: RACK_HEIGHT_PX }}
//             >

//             {rackTiles.length === 0 ? (
//               <div className="text-muted-foreground">No tiles.</div>
//             ) : (
//               rackTiles.map((t) => {
//                 const selected = !!state.selection[t.id];
//                 return (
//                   <div
//                     key={t.id}
//                     draggable
//                     onDragStart={(e) => {
//                       e.dataTransfer.setData("application/tile-id", t.id);
//                       e.dataTransfer.setData("application/from", "rack");
//                       try {
//                         e.dataTransfer.effectAllowed = "move";
//                       } catch {}
//                     }}
//                     onClick={(e) => {
//                       e.stopPropagation();
//                       toggleSelection(t.id);
//                     }}
//                     style={{
//                       ...rackTileStyle(tileSize, gap),
//                       outline: selected ? "3px solid rgba(99,102,241,0.8)" : "none",
//                       transform: selected ? "translateY(-2px)" : "none",
//                       cursor: "pointer",
//                     }}
//                     title={selected ? `${t.letter} (selected)` : t.letter}
//                   >
//                     {t.letter}
//                   </div>
//                 );
//               })
//             )}
//           </div>

//           <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 12 }}>
//             <div className="text-sm text-muted-foreground">Bag: {state.bag.length}</div>

//             <div
//               className="w-20 h-20 bg-red-200 border border-red-400 rounded flex items-center justify-center text-sm"
//               style={{ minWidth: 80 }}
//               title="Drop a rack tile here to dump it and draw a replacement (uses DUMP_SELECTED)"
//               onDragOver={(e) => e.preventDefault()}
//               onDrop={(e) => {
//                 const id = e.dataTransfer.getData("application/tile-id");
//                 const from = e.dataTransfer.getData("application/from");
//                 if (!id || from !== "rack") return;

//                 // Your reducer’s dump requires tiles to be selected + in rack.
//                 dispatch({ type: "SELECT_SET", tileIds: [id] });
//                 dispatch({ type: "DUMP_SELECTED" });
//               }}
//               onClick={() => {
//                 // optional: click dump to dump currently selected rack tiles
//                 dispatch({ type: "DUMP_SELECTED" });
//               }}
//             >
//               Dump
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
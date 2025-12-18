import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createBag, shuffleArray, drawFromBag } from './engine_2/utils';
import type { TileState as TileType, Coord } from './engine_2/types';
import { db } from "./engine_2/firebase/firebase"; // adjust relative path

function uid(letter: string) {
  return `${letter}_${Math.random().toString(36).slice(2, 9)}`;
}


export default function Banagrams() {
  // Create and shuffle bag once
  const initialBag = useMemo(() => shuffleArray(createBag()), []);
  const [bag, setBag] = useState<string[]>(initialBag);

  // Board is a map keyed by "x,y" -> Tile
  const [board, setBoard] = useState<Record<string, TileType | null>>({});

  // Tiles currently available to place (appear in holder at bottom)
  const [queue, setQueue] = useState<TileType[]>([]);

  // Simple grid size for visual board (fixed centered grid)
  const GRID_SIZE = 13;

  // UI refs and dynamic sizing
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [tileSize, setTileSize] = useState(48); // px, will be computed to avoid scrolling
  const [gap] = useState(6); // px
  const cellFull = tileSize + gap;
  const TOP_CONTROLS_PX = 72;
  // reserve vertical space for the bottom rack so it sits below the board
  const RACK_HEIGHT_PX = 20;

  // word dictionary / validation state
  const [wordSet, setWordSet] = useState<Set<string> | null>(null);
  const [validCoords, setValidCoords] = useState<Set<string>>(new Set());

  // Selection state
  const [selecting, setSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [committed, setCommitted] = useState(false);

  // single-tile draw is handled by drawTiles(1) (Peel)
  function drawTiles(n: number) {
    if (bag.length === 0) return;
    const { tiles, bag: remaining } = drawFromBag(bag, n);
    const ts = tiles.map((letter) => ({ id: uid(letter), letter }));
    // setQueue((q) => [...ts, ...q]);
    setBag(remaining);
  }

  // initial hand: draw 10 tiles on first mount
  useEffect(() => {
    // only draw on first mount
    drawTiles(10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load word list once (English Words.txt in same folder)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const url = new URL('./English Words.txt', import.meta.url).toString();
        const txt = await (await fetch(url)).text();
        // split, normalize to uppercase, include only alphabetic words
        const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const set = new Set<string>();
        for (const l of lines) {
          const cleaned = l.replace(/[^A-Za-z]/g, '').toUpperCase();
          if (cleaned.length >= 2) set.add(cleaned);
        }
        if (mounted) setWordSet(set);
      } catch (err) {
        console.warn('Could not load word list for validation', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // auto-commit words when the game ends (bag empty and player has no tiles)
  useEffect(() => {
    if (!committed && bag.length === 0 && queue.length === 0) {
      commitWords();
      setCommitted(true);
    }
  }, [bag.length, queue.length, committed]);

  // compute tileSize so that the grid fits inside the viewport without scrolling
  useEffect(() => {
    function compute() {
      const topControls = 72; // approximate reserved top controls height
      const bottomHolder = RACK_HEIGHT_PX; // reserve space at bottom for the rack
      const availableW = window.innerWidth - 40; // margins
      const availableH = window.innerHeight - topControls - bottomHolder - 40;
      const sizeByW = Math.floor((availableW - gap * (GRID_SIZE - 1)) / GRID_SIZE);
      const sizeByH = Math.floor((availableH - gap * (GRID_SIZE - 1)) / GRID_SIZE);
      const size = Math.max(28, Math.min(64, Math.min(sizeByW, sizeByH)));
      setTileSize(size);
    }
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [GRID_SIZE, gap]);

  // validate board runs whenever board or wordSet updates
  useEffect(() => {
    if (!wordSet) {
      setValidCoords(new Set());
      return;
    }
    const val = new Set<string>();
    // horizontal
    for (let y = 0; y < GRID_SIZE; y++) {
      let runCoords: string[] = [];
      let runLetters: string[] = [];
      for (let x = 0; x <= GRID_SIZE; x++) {
        const key = `${x},${y}`;
        const t = board[key];
        if (t) {
          runCoords.push(key);
          runLetters.push(t.letter);
        } else {
          if (runLetters.length >= 2) {
            const w = runLetters.join('').toUpperCase();
            if (wordSet.has(w)) runCoords.forEach((c) => val.add(c));
          }
          runCoords = [];
          runLetters = [];
        }
      }
    }
    // vertical
    for (let x = 0; x < GRID_SIZE; x++) {
      let runCoords: string[] = [];
      let runLetters: string[] = [];
      for (let y = 0; y <= GRID_SIZE; y++) {
        const key = `${x},${y}`;
        const t = board[key];
        if (t) {
          runCoords.push(key);
          runLetters.push(t.letter);
        } else {
          if (runLetters.length >= 2) {
            const w = runLetters.join('').toUpperCase();
            if (wordSet.has(w)) runCoords.forEach((c) => val.add(c));
          }
          runCoords = [];
          runLetters = [];
        }
      }
    }
    setValidCoords(val);
  }, [board, wordSet, GRID_SIZE]);

  function placeTileAt(id: string, coord: Coord) {
    // place tile from queue at coord
    const tile = queue.find((t) => t.id === id);
    if (!tile) return;

    const key = `${coord.x},${coord.y}`;
    setBoard((prev) => ({ ...prev, [key]: tile }));
    setQueue((q) => q.filter((t) => t.id !== id));
  }

  function movePlacedTiles(tileIds: string[], deltaX: number, deltaY: number) {
    // compute original positions
    const positions: Record<string, { x: number; y: number }> = {};
    for (const key of Object.keys(board)) {
      const t = board[key];
      if (t && tileIds.includes(t.id)) {
        const [x, y] = key.split(',').map(Number);
        positions[t.id] = { x, y };
      }
    }

    // compute bounding and new positions
    const updates: Record<string, TileType> = {};
    for (const id of tileIds) {
      const pos = positions[id];
      if (!pos) return; // abort if missing
      const nx = pos.x + deltaX;
      const ny = pos.y + deltaY;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) return; // out of bounds
      updates[`${nx},${ny}`] = board[`${pos.x},${pos.y}`] as TileType;
    }

    // check collisions with non-selected tiles
    for (const key of Object.keys(updates)) {
      const existing = board[key];
      if (existing && !tileIds.includes(existing.id)) return; // collision
    }

    // apply: remove originals then add new
    setBoard((prev) => {
      const next: Record<string, TileType | null> = { ...prev };
      for (const id of tileIds) {
        const p = positions[id];
        delete next[`${p.x},${p.y}`];
      }
      for (const [k, v] of Object.entries(updates)) next[k] = v;
      return next;
    });
    setSelectedIds([]);
  }

  function removeTileFromBoard(coord: Coord) {
    const key = `${coord.x},${coord.y}`;
    setBoard((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function placeTileBackOnRack(coord: Coord) {
    const key = `${coord.x},${coord.y}`;
    const t = board[key];
    if (t) {
      queue.push(t)
      removeTileFromBoard(coord)
    }
  }

  // Commit found words on board to local usage dictionary
  function commitWords() {
    const found = new Map<string, number>();
    // horizontal
    for (let y = 0; y < GRID_SIZE; y++) {
      let run: string[] = [];
      for (let x = 0; x <= GRID_SIZE; x++) {
        const key = `${x},${y}`;
        const t = board[key];
        if (t) run.push(t.letter);
        else {
          if (run.length >= 2) {
            const w = run.join('').toUpperCase();
            // only count if present in dictionary (if loaded)
            if (!wordSet || wordSet.has(w)) found.set(w, (found.get(w) || 0) + 1);
          }
          run = [];
        }
      }
    }
    // vertical
    for (let x = 0; x < GRID_SIZE; x++) {
      let run: string[] = [];
      for (let y = 0; y <= GRID_SIZE; y++) {
        const key = `${x},${y}`;
        const t = board[key];
        if (t) run.push(t.letter);
        else {
          if (run.length >= 2) {
            const w = run.join('').toUpperCase();
            if (!wordSet || wordSet.has(w)) found.set(w, (found.get(w) || 0) + 1);
          }
          run = [];
        }
      }
    }

    // merge into localStorage map
    const storeKey = 'banagrams_word_usage';
    const raw = localStorage.getItem(storeKey);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    for (const [w, c] of found.entries()) {
      map[w] = (map[w] || 0) + c;
    }
    localStorage.setItem(storeKey, JSON.stringify(map));
    if (!wordSet) {
      alert(`Committed ${found.size} words (dictionary not loaded).`);
    } else {
      alert(`Committed ${found.size} valid words to local usage store.`);
    }
  }

  // Inject a fun web font (Fredoka) for a playful look
  useEffect(() => {
    const id = 'bananagrams-font';
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;700&display=swap';
      document.head.appendChild(l);
    }
  }, []);

  // ---- UI ----
  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Fredoka', system-ui, sans-serif", background: 'linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)' }}>
      {/* Top controls */}
      <header style={{ position: 'fixed', left: 0, right: 0, top: 16, display: 'flex', justifyContent: 'center', zIndex: 60 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>


          <button
            onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.9)', borderRadius: 10, border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
          >
            Center Board
          </button>

          <button
            onClick={() => alert('View other players (placeholder)')}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.9)', borderRadius: 10, border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
          >
            View Boards
          </button>
        </div>
      </header>

      {/* Dump area will appear next to the bottom holder (see bottom holder) */}

      {/* Grid container: wooden board centered on page */}
      <div ref={gridRef} className="w-full h-screen" style={{ position: 'absolute', inset: 0, padding: 0 }}>
        <div
          style={{ width: GRID_SIZE * cellFull - gap, height: GRID_SIZE * cellFull + 4 * gap, borderRadius: 18, background: 'linear-gradient(180deg,#7b5a2b 0%, #a6783a 100%)', boxShadow: '0 18px 60px rgba(33,30,29,0.18)', padding: 14, margin: 'auto', position: 'absolute', left: 0, right: 0, top: 0, bottom: RACK_HEIGHT_PX, zIndex: 30 }}
          onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
            // start selection if click not on a tile
            const target = e.target as HTMLElement;
            if (target.closest('.tile') || target.closest('.placed-tile')) return;
            setSelecting(true);
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setSelectionRect({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 });
          }}
          onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => {
            if (!selecting || !selectionRect) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const nx = Math.min(selectionRect.x, e.clientX - rect.left);
            const ny = Math.min(selectionRect.y, e.clientY - rect.top);
            const nw = Math.abs(e.clientX - rect.left - selectionRect.x);
            const nh = Math.abs(e.clientY - rect.top - selectionRect.y);
            setSelectionRect({ x: nx, y: ny, w: nw, h: nh });
          }}
          onPointerUp={(e: React.PointerEvent<HTMLDivElement>) => {
            if (!selecting || !selectionRect) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            // compute selected cell coords
            const sx = Math.floor(selectionRect.x / cellFull);
            const sy = Math.floor(selectionRect.y / cellFull);
            const ex = Math.floor((selectionRect.x + selectionRect.w) / cellFull);
            const ey = Math.floor((selectionRect.y + selectionRect.h) / cellFull);
            const ids: string[] = [];
            for (let y = sy; y <= ey; y++) {
              for (let x = sx; x <= ex; x++) {
                const key = `${x},${y}`;
                const t = board[key];
                if (t) ids.push(t.id);
              }
            }
            setSelectedIds(ids);
            setSelecting(false);
            setSelectionRect(null);
          }}
        >
          {/* Cells */}
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_SIZE}, ${tileSize}px)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, ${tileSize}px)`,
              gap: `${gap}px`,
              background: 'linear-gradient(180deg,#edd6a1,#f6e1b3)',
              padding: 0,
              borderRadius: 6,
            }}
          >
            {Array.from({ length: GRID_SIZE }).map((_, y) =>
              Array.from({ length: GRID_SIZE }).map((_, x) => {
                const key = `${x},${y}`;
                const placed = board[key];
                return (
                  <div
                    key={key}
                    onDragOver={(e) => { e.preventDefault(); try { (e.dataTransfer as DataTransfer).dropEffect = 'move'; } catch {} }}
                    onDrop={(e) => {
                      const raw = e.dataTransfer.getData('application/json');
                      if (!raw) return;
                      try {
                        const payload = JSON.parse(raw);
                        const ids: string[] = payload.ids || [];
                        if (payload.source === 'queue') {
                          // place first id from queue
                          placeTileAt(ids[0], { x, y });
                        } else {
                          // moving placed tiles (group)
                          // compute min pos of selection
                          const positions: Record<string, { x: number; y: number }> = {};
                          for (const k of Object.keys(board)) {
                            const t = board[k];
                            if (t && ids.includes(t.id)) {
                              const [ox, oy] = k.split(',').map(Number);
                              positions[t.id] = { x: ox, y: oy };
                            }
                          }
                          const xs = Object.values(positions).map((p) => p.x);
                          const ys = Object.values(positions).map((p) => p.y);
                          const minX = Math.min(...xs);
                          const minY = Math.min(...ys);
                          const deltaX = x - minX;
                          const deltaY = y - minY;
                          movePlacedTiles(ids, deltaX, deltaY);
                        }
                      } catch (err) {
                        // ignore
                      }
                    }}
                    className="w-[48px] h-[48px] flex items-center justify-center"
                    style={{ minWidth: tileSize, minHeight: tileSize, border: '1px solid rgba(0,0,0,0.08)' }}
                  >
                    {placed ? (
                      <div
                        draggable
                        onDragStart={(e) => {
                          try { e.dataTransfer.effectAllowed = 'move'; } catch {}
                          const sel = selectedIds.length > 0 && selectedIds.includes(placed.id) ? selectedIds : [placed.id];
                          e.dataTransfer.setData('application/json', JSON.stringify({ ids: sel, source: 'board' }));
                        }}
                        className={`placed-tile w-full h-full flex items-end justify-center`}
                        style={{
                          borderRadius: 8,
                          background: 'linear-gradient(180deg,#fff6d6,#ffe88a)',
                          boxShadow: 'inset 0 -6px 0 rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.12)',
                          fontWeight: 800,
                          color: validCoords.has(key) ? '#194d22' : '#2b2b2b',
                          paddingBottom: Math.max(4, tileSize * 0.08),
                        }}
                      >
                        <span style={{ fontSize: Math.max(14, tileSize * 0.36), lineHeight: 1 }}>{placed.letter}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {/* selection rect overlay */}
          {selectionRect ? (
            <div
              style={{
                position: 'absolute',
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.w,
                height: selectionRect.h,
                background: 'rgba(255,255,255,0.15)',
                border: '2px dashed rgba(255,255,255,0.25)',
                borderRadius: 8,
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </div>
      </div>

      {/* Bottom rack (unplaced tiles) */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-100/80 dark:bg-slate-800/80 border-t border-gray-200 p-3" style={{ zIndex: 10, backdropFilter: 'blur(4px)', height: RACK_HEIGHT_PX }}>
        <div className="max-w-6xl mx-auto flex items-center">
          <div className="flex overflow-x-auto space-x-2 py-1">
            {queue.length === 0 ? (
              <div className="text-muted-foreground">No tiles.</div>
            ) : (
              queue.map((t) => (
                <div
                  key={t.id}
                  className="tile"
                  draggable
                  onDragStart={(e) => { try { e.dataTransfer.effectAllowed = 'move'; } catch {} ; e.dataTransfer.setData('application/json', JSON.stringify({ ids: [t.id], source: 'queue' })); }}
                  style={{ width: tileSize, height: tileSize, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                >
                  {t.letter}
                </div>
              ))
            )}
          </div>
          <div className="ml-4 flex items-center space-x-3">
            <div className="ml-auto text-sm text-muted-foreground">Queue: {queue.length}</div>
            <div
              className="w-16 h-16 bg-red-200 border border-red-400 rounded flex items-center justify-center text-sm"
              onDragOver={(e) => { e.preventDefault(); try { (e.dataTransfer as DataTransfer).dropEffect = 'move'; } catch {} }}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                try {
                  const payload = JSON.parse(raw);
                  const ids: string[] = payload.ids || [];
                  // remove ids from board or queue
                  for (const id of ids) {
                    setQueue((q) => q.filter((t) => t.id !== id));
                    setBoard((prev) => {
                      const next = { ...prev };
                      for (const k of Object.keys(next)) {
                        const t = next[k];
                        if (t && t.id === id) delete next[k];
                      }
                      return next;
                    });
                    // for each dumped tile, draw 3
                    drawTiles(3);
                  }
                } catch (err) {
                  // ignore
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

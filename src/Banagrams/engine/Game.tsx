// path: src/Banagrams/engine_2/Game.tsx
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reducer } from "./reducer";
import { useBoardSync } from "./hooks/useBoardSync";
import type { GameOptions, GameState, TileId, TileState, TilesById } from "./types";
import { boardBounds, getValidWords, tilesInWorldRect } from "./board";
import { takeFromBag, setGameStatus, pushGrants, dumpAndDraw, saveGameAnalysis, saveFinalSnapshot } from "./firebase/rtdb";
import { DEFAULT_OPTIONS } from "./utils";
import { advanceCursorUntilOpen, boardTileAt, canPlaceAt, findRackTileForLetter, initialTypingModeState, moveCursor, normalizeLetterKey } from "./typingMode";
import { snapCoord } from "./coords";

// ---------- Initial state ----------
function initialState(gameId: string, selfId: string): GameState {
  return {
    selfId,
    gameId,
    tiles: {} as TilesById,
    rack: [],
    selection: {},
    drag: { kind: "none" },
    bag: [],
    players: {},
    status: { phase: "active" },
    options: { ...DEFAULT_OPTIONS },
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
type GameProps = { gameId: string; playerId: string; nickname: string };

export default function Game({ gameId, playerId, nickname: _nickname }: GameProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(gameId, playerId));
  const [dragVisual, setDragVisual] = useState<{
    active: boolean;
    ids: TileId[];
    start: { x: number; y: number };
    current: { x: number; y: number };
  }>({ active: false, ids: [], start: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
  const [flash, setFlash] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateCollapsed, setCelebrateCollapsed] = useState(false);
  const [showBananas, setShowBananas] = useState(false);
  const fullDictRef = useRef<Set<string> | null>(null);
  const initialDrawRef = useRef(false);
  const [spectateId, setSpectateId] = useState<string | null>(null);
  const [selectedOther, setSelectedOther] = useState<string | null>(null);
  const [showSpectatePicker, setShowSpectatePicker] = useState(false);
  const lastAutoCenterRef = useRef(0);
  const savedAnalysisRef = useRef(false);
  const [typingMode, setTypingMode] = useState(() => initialTypingModeState());

  const bananaSpecs = useMemo(() => {
    if (!showBananas) return [] as Array<{ key: string; left: number; delay: number; duration: number; size: number }>;
    return Array.from({ length: 50 }).map((_, i) => ({
      key: `banana-${i}-${Math.random().toString(36).slice(2)}`,
      left: Math.random() * 100,
      delay: Math.random() * 1.1,
      duration: 2.6 + Math.random() * 0.9,
      size: 42 + Math.random() * 14,
    }));
  }, [showBananas]);

  // Turn on celebration whenever game status reaches banana-split
  useEffect(() => {
    if (state.status.phase !== "banana-split") {
      setCelebrate(false);
      setShowBananas(false);
      return;
    }
    setCelebrate(true);
    setShowBananas(true);
    const timer = window.setTimeout(() => setShowBananas(false), 5200);
    return () => window.clearTimeout(timer);
  }, [state.status.phase]);

  // Save boards to Firebase once when the game ends for post-game analysis
  useEffect(() => {
    if (state.status.phase !== "banana-split") return;
    if (savedAnalysisRef.current) return;
    savedAnalysisRef.current = true;

    const winnerId = state.status.winnerId ?? null;

    function compactBoard(tiles: TilesById, rackIds: TileId[]) {
      const tilesArr = Object.values(tiles || {}).map((t) => ({ l: t.letter, x: t.pos.x, y: t.pos.y, loc: t.location, owner: t.owner }));
      const rackLetters = rackIds.map((id) => tiles[id]?.letter).filter(Boolean) as string[];
      return { tiles: tilesArr, rack: rackLetters };
    }

    const allBoards: Record<string, { tiles: TilesById; rack: TileId[] }> = {
      [state.selfId]: { tiles: state.tiles, rack: state.rack },
      ...state.remoteBoards,
    };

    const compacted = Object.entries(allBoards).map(([pid, b]) => ({
      pid,
      ...compactBoard(b.tiles ?? {}, b.rack ?? []),
    }));

    const winnerBoard = winnerId ? compacted.find((b) => b.pid === winnerId) : undefined;
    const others = compacted.filter((b) => !winnerId || b.pid !== winnerId);

    const payload = {
      finishedAt: Date.now(),
      winnerId,
      winnerBoard: winnerBoard ?? null,
      otherBoards: others,
      options: state.options,
      players: state.players,
      bagRemaining: state.bag.length,
    };

    saveGameAnalysis(gameId, payload).catch((err) => {
      console.error("saveGameAnalysis failed", err);
      setFlash("Analysis save failed");
      savedAnalysisRef.current = false; // allow retry on failure
    });
  }, [gameId, state.bag.length, state.options, state.players, state.rack, state.remoteBoards, state.status.phase, state.status.winnerId, state.tiles]);

  // Collapse celebration badge after a moment so board is visible
  useEffect(() => {
    if (!celebrate) {
      setCelebrateCollapsed(false);
      return;
    }
    const t = window.setTimeout(() => setCelebrateCollapsed(true), 2000);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  // Sync boards/bag/status/players
  useBoardSync(gameId, playerId, _nickname, state, dispatch);

  // Draw starting hand once bag is available, honoring chosen hand size
  useEffect(() => {
    async function drawInitial() {
      if (initialDrawRef.current) return;
      if (state.rack.length > 0) return;
      if (state.bag.length === 0) return;
      initialDrawRef.current = true;
      const desired = Math.max(1, Math.min(30, Math.round(state.options.startingHand ?? DEFAULT_OPTIONS.startingHand)));
      const drawCount = Math.min(desired, state.bag.length);
      try {
        const { letters } = await takeFromBag(gameId, drawCount);
        if (letters.length === 0) {
          initialDrawRef.current = false;
          return;
        }
        dispatch({ type: "ADD_LETTERS", letters });
      } catch (err) {
        initialDrawRef.current = false;
      }
    }
    drawInitial();
  }, [gameId, state.options.startingHand, state.rack.length, state.bag.length, dispatch]);

  // auto-hide flash
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(id);
  }, [flash]);

  // Load dictionary once, then re-filter when minLength changes
  useEffect(() => {
    let cancelled = false;
    const minLength = Math.max(1, Math.floor(state.options.minLength ?? DEFAULT_OPTIONS.minLength));

    async function loadAndFilter() {
      try {
        if (!fullDictRef.current) {
          if (state.dictionary.status === "unloaded") dispatch({ type: "DICT_LOADING" });
          const url = new URL("../dictionary.txt", import.meta.url).toString();
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const txt = await resp.text();
          const all = new Set<string>();
          txt
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach((w) => {
              const cleaned = w.replace(/[^A-Za-z]/g, "").toUpperCase();
              if (cleaned.length > 0) all.add(cleaned);
            });
          fullDictRef.current = all;
        }

        if (fullDictRef.current) {
          const words = new Set<string>();
          fullDictRef.current.forEach((w) => { if (w.length >= minLength) words.add(w); });
          if (!cancelled) dispatch({ type: "DICT_READY", words });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        if (!cancelled) {
          dispatch({ type: "DICT_ERROR", error });
          setFlash("Dictionary failed to load");
        }
      }
    }

    loadAndFilter();
    return () => { cancelled = true; };
  }, [dispatch, state.options.minLength, state.dictionary.status]);


  // Layout constants...
  const HEADER_H = 72;
  const RACK_MIN_H = 120;
  const RACK_MAX_H = 240;
  const MIN_TILE = 24;
  const GAP = 6;

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

  const [baseTileSize, setBaseTileSize] = useState(52);

  // Responsive tile size
  useEffect(() => {
    function compute() {
      const availableW = window.innerWidth - 24;
      const availableH = window.innerHeight - HEADER_H - RACK_MIN_H - 24;
      const sizeByW = Math.floor(availableW / 14);
      const sizeByH = Math.floor(availableH / 12);
      setBaseTileSize(Math.max(30, Math.min(68, Math.min(sizeByW, sizeByH))));
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Derived sets
  const nicknameFor = (pid: string) => state.players[pid]?.nickname ?? pid;

  const otherPlayers = useMemo(() => {
    const ids = new Set<string>();
    Object.keys(state.players || {}).forEach((pid) => { if (pid !== state.selfId) ids.add(pid); });
    Object.keys(state.remoteBoards || {}).forEach((pid) => { if (pid !== state.selfId) ids.add(pid); });
    return Array.from(ids).map((pid) => [pid, state.players[pid]] as const);
  }, [state.players, state.remoteBoards, state.selfId]);

  useEffect(() => {
    if (otherPlayers.length === 0) {
      setSelectedOther(null);
      setShowSpectatePicker(false);
      if (spectateId) setSpectateId(null);
      return;
    }
    const first = otherPlayers[0][0];
    if (!selectedOther || !otherPlayers.some(([pid]) => pid === selectedOther)) {
      setSelectedOther(first);
    }
  }, [otherPlayers, selectedOther, spectateId]);

  const viewingPlayerId = spectateId ?? state.selfId;
  const viewingRemote = spectateId ? state.remoteBoards[spectateId] : null;
  const viewingTiles = spectateId ? (viewingRemote?.tiles ?? {}) : state.tiles;
  const viewingRackOrder = spectateId ? (viewingRemote?.rack ?? []) : state.rack;
  const isSpectating = spectateId !== null;

  useEffect(() => {
    if (!isSpectating) return;
    setTypingMode((prev) => (prev.enabled ? { ...prev, enabled: false } : prev));
  }, [isSpectating]);

  const boardTiles = useMemo(
    () => Object.values(viewingTiles).filter((t) => t.location === "board"),
    [viewingTiles]
  );

  const rackTiles = useMemo(() => {
    const ordered = viewingRackOrder.map((id) => viewingTiles[id]).filter(Boolean) as TileState[];
    if (ordered.length > 0 || viewingRackOrder.length > 0) return ordered;
    return Object.values(viewingTiles).filter((t) => t.location === "rack") as TileState[];
  }, [viewingRackOrder, viewingTiles]);

  function clampCursorToView(pos: { x: number; y: number }) {
    if (!boardSize.w || !boardSize.h) return snapCoord(pos);
    const spanX = Math.max(0, (boardSize.w - tileSize) / (2 * cell));
    const spanY = Math.max(0, (boardSize.h - tileSize) / (2 * cell));
    const maxX = Math.floor(spanX);
    const minX = -Math.ceil(spanX);
    const maxY = Math.floor(spanY) + 1;
    const minY = -Math.ceil(spanY) - 1;
    return snapCoord({
      x: Math.min(maxX, Math.max(minX, pos.x)),
      y: Math.min(maxY, Math.max(minY, pos.y)),
    });
  }

  function centerBoardWithCursor() {
    if (isSpectating) return;
    const bounds = boardBounds(state.tiles);
    if (!bounds) return;
    const delta = {
      x: -((bounds.min.x + bounds.max.x) / 2) - 1,
      y: -((bounds.min.y + bounds.max.y) / 2) - 1,
    };
    if (typingMode.enabled) {
      setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView({ x: prev.cursor.x + delta.x, y: prev.cursor.y + delta.y }) }));
    }
    dispatch({ type: "CENTER_BOARD" });
  }

  const tileSize = useMemo(() => {
    if (!boardSize.w || !boardSize.h) return baseTileSize;
    const bounds = boardBounds(viewingTiles);
    if (!bounds) return baseTileSize;
    const marginCells = 1; // minimal padding; prevents early zoom-out for small boards
    const widthCells = bounds.max.x - bounds.min.x + 1 + marginCells * 2;
    const heightCells = bounds.max.y - bounds.min.y + 1 + marginCells * 2;
    const capacityW = Math.max(1, Math.floor(boardSize.w / (baseTileSize + GAP)));
    const capacityH = Math.max(1, Math.floor(boardSize.h / (baseTileSize + GAP)));
    // Only zoom out once we would exceed the available cell capacity at the base size.
    if (widthCells <= capacityW && heightCells <= capacityH) return baseTileSize;
    const sizeByW = Math.floor(boardSize.w / Math.max(widthCells, 1) - GAP);
    const sizeByH = Math.floor(boardSize.h / Math.max(heightCells, 1) - GAP);
    const target = Math.min(baseTileSize, sizeByW, sizeByH);
    return Math.max(MIN_TILE, target);
  }, [baseTileSize, boardSize.w, boardSize.h, viewingTiles]);

  const cell = tileSize + GAP;

  const selection = isSpectating ? {} : state.selection;

  // Auto-center when tiles approach the viewport edge (self board only).
  useEffect(() => {
    if (isSpectating) return;
    if (!boardSize.w || !boardSize.h) return;
    const bounds = boardBounds(state.tiles);
    if (!bounds) return;

    const spanX = boardSize.w / cell;
    const spanY = boardSize.h / cell;
    const halfX = Math.max(1, Math.floor(spanX / 2) - 1);
    const halfY = Math.max(1, Math.floor(spanY / 2) - 1);
    const maxAbsX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
    const maxAbsY = Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y));
    const nearEdge = maxAbsX >= halfX || maxAbsY >= halfY;
    if (!nearEdge) return;

    const now = Date.now();
    if (now - lastAutoCenterRef.current < 250) return;
    lastAutoCenterRef.current = now;
    centerBoardWithCursor();
  }, [boardSize.w, boardSize.h, cell, state.tiles, isSpectating]);

  const dictWords = state.dictionary.status === "ready" ? state.dictionary.words : null;
  const playerCount = Math.max(1, Object.keys(state.players || {}).length || 1);
  const isBananaSplit = state.bag.length < playerCount;
  const peelLabel = isBananaSplit ? "Bananas!" : "Peel";
  const winnerNick = state.status.winnerId && state.players[state.status.winnerId]?.nickname;
  const isWinner = state.status.phase === "banana-split" && state.status.winnerId === state.selfId;

  const marqueeStyle = useMemo(() => {
    if (state.drag.kind !== "marquee") return null;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const { startMouse, currentMouse } = state.drag;
    const x1 = Math.min(startMouse.x, currentMouse.x) - rect.left;
    const x2 = Math.max(startMouse.x, currentMouse.x) - rect.left;
    const y1 = Math.min(startMouse.y, currentMouse.y) - rect.top;
    const y2 = Math.max(startMouse.y, currentMouse.y) - rect.top;
    const left = Math.max(0, x1);
    const top = Math.max(0, y1);
    const right = Math.min(rect.width, x2);
    const bottom = Math.min(rect.height, y2);
    return {
      position: "absolute" as const,
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      border: "1px dashed rgba(37,99,235,0.8)",
      background: "rgba(37,99,235,0.12)",
      pointerEvents: "none" as const,
      zIndex: 10,
    };
  }, [state.drag]);

  // Determine valid/invalid tiles using shared board validator when dictionary is ready
  const validity = useMemo(() => {
    if (!dictWords) return null;
    return getValidWords(state.tiles, dictWords);
  }, [state.tiles, dictWords]);

  const handleSaveFinal = useCallback(() => {
    if (isSpectating) {
      setFlash("Cannot save while spectating");
      return;
    }

    const payload = {
      tiles: state.tiles,
      words: [],
      stats: { bagRemaining: state.bag.length, rackCount: state.rack.length, phase: state.status.phase },
    };

    saveFinalSnapshot(gameId, state.selfId, payload)
      .then(() => setFlash("Saved final snapshot"))
      .catch((err) => {
        console.error("saveFinalSnapshot failed", err);
        setFlash("Save failed");
      });
  }, [gameId, isSpectating, state.bag.length, state.rack.length, state.status.phase, state.tiles, state.selfId]);

  function handlePeel() {
    if (!dictWords) {
      setFlash("Dictionary not ready yet");
      return;
    }
    if (state.rack.length > 0) {
      setFlash("Place tiles before peeling");
      return;
    }
    if (!validity || !validity.validBoard) {
      setFlash("Invalid board!");
      return;
    }
    if (state.status.phase === "banana-split") {
      setFlash("Game already ended");
      return;
    }

    if (isBananaSplit) {
      setCelebrate(true);
      setGameStatus(gameId, { phase: "banana-split", winnerId: state.selfId, updatedAt: Date.now() }).catch(() => {});
      return;
    }

    if (state.bag.length === 0) {
      setFlash("No tiles left to peel");
      return;
    }

    const knownPlayers = new Set<string>();
    knownPlayers.add(state.selfId);
    Object.keys(state.players || {}).forEach((p) => knownPlayers.add(p));
    Object.keys(state.remoteBoards || {}).forEach((p) => knownPlayers.add(p));
    const recipients = Array.from(knownPlayers);

    takeFromBag(gameId, recipients.length)
      .then(async ({ letters }) => {
        if (letters.length === 0) {
          setFlash("No tiles left");
          return;
        }

        const assignments: Record<string, string[]> = {};
        recipients.forEach((pid, idx) => {
          const letter = letters[idx];
          if (!letter) return;
          assignments[pid] = assignments[pid] || [];
          assignments[pid].push(letter);
        });

        const mine = assignments[state.selfId] || [];
        if (mine.length) dispatch({ type: "ADD_LETTERS", letters: mine });

        const others: Record<string, string[]> = {};
        for (const [pid, arr] of Object.entries(assignments)) {
          if (pid === state.selfId) continue;
          others[pid] = arr;
        }
        if (Object.keys(others).length) await pushGrants(gameId, others);
      })
      .catch(() => setFlash("Peel failed"));
  }

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

  function screenToWorld(client: { x: number; y: number }) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const localX = client.x - rect.left;
    const localY = client.y - rect.top;
    return {
      x: localX / cell - cx / cell - 0.5,
      y: localY / cell - cy / cell - 0.5,
    };
  }

  function finalizeMarqueeSelection(endClient: { x: number; y: number }) {
    if (state.drag.kind !== "marquee") return;
    const a = screenToWorld(state.drag.startMouse);
    const b = screenToWorld(endClient);
    if (!a || !b) return;
    const rect = {
      min: { x: Math.floor(Math.min(a.x, b.x)), y: Math.floor(Math.min(a.y, b.y)) },
      max: { x: Math.floor(Math.max(a.x, b.x)), y: Math.floor(Math.max(a.y, b.y)) },
    };
    const ids = tilesInWorldRect(state.tiles, rect, { location: "board" });
    dispatch({ type: "SELECT_SET", tileIds: ids });
    dispatch({ type: "MARQUEE_END" });
  }

  useEffect(() => {
    if (!typingMode.enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (isSpectating || state.status.phase === "banana-split") return;

      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || active.isContentEditable) return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Tab") {
        e.preventDefault();
        setTypingMode((prev) => ({ ...prev, advanceDir: prev.advanceDir === "right" ? "down" : "right" }));
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        let tileId = boardTileAt(state.tiles, typingMode.cursor);

        // If nothing at cursor, look one space backward based on advance direction.
        if (!tileId) {
          const backPos = typingMode.advanceDir === "right"
            ? { x: typingMode.cursor.x - 1, y: typingMode.cursor.y }
            : { x: typingMode.cursor.x, y: typingMode.cursor.y - 1 };
          tileId = boardTileAt(state.tiles, backPos);
          if (tileId) {
            const tile = state.tiles[tileId];
            if (!tile || tile.owner !== state.selfId) {
              setFlash("Cannot remove that tile");
              return;
            }
            dispatch({ type: "RETURN_TO_RACK", tileId });
            setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView(backPos) }));
            return;
          }
        }

        if (!tileId) {
          setFlash("No tile to remove");
          return;
        }

        const tile = state.tiles[tileId];
        if (!tile || tile.owner !== state.selfId) {
          setFlash("Cannot remove that tile");
          return;
        }
        dispatch({ type: "RETURN_TO_RACK", tileId });
        return;
      }

      if (e.code === "ArrowUp" || e.key === "ArrowUp") {
        e.preventDefault();
        setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView(moveCursor(prev.cursor, "up")) }));
        return;
      }
      if (e.code === "ArrowDown" || e.key === "ArrowDown") {
        e.preventDefault();
        setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView(moveCursor(prev.cursor, "down")) }));
        return;
      }
      if (e.code === "ArrowLeft" || e.key === "ArrowLeft") {
        e.preventDefault();
        setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView(moveCursor(prev.cursor, "left")) }));
        return;
      }
      if (e.code === "ArrowRight" || e.key === "ArrowRight") {
        e.preventDefault();
        setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView(moveCursor(prev.cursor, "right")) }));
        return;
      }

      const letter = normalizeLetterKey(e.key);
      if (!letter) return;
      e.preventDefault();

      const occupantId = boardTileAt(state.tiles, typingMode.cursor);
      if (occupantId) {
        const occupant = state.tiles[occupantId];
        if (!occupant || occupant.owner !== state.selfId) {
          setFlash("Cannot replace that tile");
          return;
        }
        dispatch({ type: "RETURN_TO_RACK", tileId: occupantId });
      }

      const tileId = findRackTileForLetter(state.tiles, state.rack, letter);
      if (!tileId) {
        setFlash(`No tile '${letter}' in rack`);
        return;
      }

      dispatch({ type: "PLACE_TILE", tileId, pos: typingMode.cursor });

      const placedTile = state.tiles[tileId];
      const previewTiles = { ...state.tiles };
      if (occupantId && state.tiles[occupantId]) {
        previewTiles[occupantId] = { ...state.tiles[occupantId], location: "rack", pos: { x: 0, y: 0 } };
      }
      if (placedTile) {
        previewTiles[tileId] = { ...placedTile, location: "board", pos: typingMode.cursor };
      }

      const nextStart = moveCursor(typingMode.cursor, typingMode.advanceDir);
      const nextCursor = advanceCursorUntilOpen(previewTiles, nextStart, typingMode.advanceDir);
      setTypingMode((prev) => ({ ...prev, cursor: clampCursorToView(nextCursor) }));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [typingMode.enabled, typingMode.cursor, typingMode.advanceDir, isSpectating, state.status.phase, state.tiles, state.rack, state.selfId, dispatch]);

  // Enter shortcut to shuffle rack (ignores when focused in inputs)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key !== "Enter") return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || active.isContentEditable) return;
      }
      if (isSpectating || rackTiles.length < 2) return;
      e.preventDefault();
      dispatch({ type: "SHUFFLE_RACK" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, isSpectating, rackTiles.length]);

  // Spacebar shortcut for peel/bananas (ignores when typing in inputs)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.code !== "Space") return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || active.isContentEditable) return;
      }
      e.preventDefault();
      handlePeel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePeel]);

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: "'Fredoka', system-ui, sans-serif",
        background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {flash && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "#0f172a",
            color: "white",
            padding: "8px 12px",
            borderRadius: 10,
            boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
            fontWeight: 700,
            zIndex: 200,
          }}
        >
          {flash}
        </div>
      )}
      {celebrate && createPortal(
        <>
          <style>{`
            @keyframes banana-fall {
              0% { transform: translate3d(0, -200px, 0) rotate(-12deg); opacity: 1; }
              60% { transform: translate3d(12px, 55vh, 0) rotate(6deg); opacity: 1; }
              100% { transform: translate3d(-8px, 120vh, 0) rotate(18deg); opacity: 0; }
            }
            @keyframes heartbeat { 0%, 100% { transform: scale(1); } 20% { transform: scale(1.12); } 40% { transform: scale(0.94); } 60% { transform: scale(1.1); } 80% { transform: scale(0.98); } }
          `}</style>
          <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 99999, overflow: "hidden" }}>
            {showBananas && bananaSpecs.map((b) => (
              <div
                key={b.key}
                style={{
                  position: "absolute",
                  left: `${b.left}%`,
                  top: -40,
                  fontSize: b.size,
                  animation: `banana-fall ${b.duration}s linear ${b.delay}s forwards`,
                  willChange: "transform, opacity",
                }}
              >
                🍌
              </div>
            ))}
          </div>
          <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 100000 }}>
            <div
              style={{
                padding: celebrateCollapsed ? "10px 12px" : "20px 28px",
                background: "#fffef3",
                borderRadius: 16,
                boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
                border: "3px solid #ffd54f",
                fontWeight: 900,
                fontSize: celebrateCollapsed ? 16 : 28,
                color: isWinner ? "#c58a00" : "#b3261e",
                position: "fixed",
                transition: "all 0.6s ease",
                animation: celebrateCollapsed ? undefined : "heartbeat 1.6s ease-in-out 0s 3",
                left: "50%",
                top: celebrateCollapsed ? HEADER_H + 12 : "50%",
                transform: celebrateCollapsed ? "translate(-50%,0)" : "translate(-50%,-50%)",
              }}
            >
              {isWinner ? "Winner!" : "Non-Winner!"}
            </div>
          </div>
        </>,
        document.body
      )}
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
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 700, color: "#111" }}>Typing mode</span>
          <button
            onClick={() => setTypingMode((prev) => ({ ...prev, enabled: !prev.enabled }))}
            disabled={isSpectating}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: typingMode.enabled ? "#2563eb" : "rgba(255,255,255,0.92)",
              color: typingMode.enabled ? "white" : "#111",
              boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
              fontWeight: 800,
              cursor: isSpectating ? "not-allowed" : "pointer",
            }}
            title={isSpectating ? "Typing mode is disabled while spectating" : "Toggle typing input"}
          >
            {typingMode.enabled ? "On" : "Off"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={handlePeel}
            disabled={isSpectating || state.status.phase === "banana-split" || (!isBananaSplit && state.bag.length === 0)}
            style={{
              padding: "10px 14px",
              background: "#ffd54f",
              borderRadius: 12,
              border: "none",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              fontWeight: 800,
            }}
          >
            {peelLabel}
          </button>

          <button
            onClick={centerBoardWithCursor}
            disabled={isSpectating || state.status.phase === "banana-split"}
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

          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                if (spectateId) {
                  setSpectateId(null);
                  setShowSpectatePicker(false);
                  return;
                }
                if (otherPlayers.length === 0) {
                  setFlash("No other boards yet");
                  setShowSpectatePicker(false);
                  return;
                }
                if (!selectedOther && otherPlayers.length > 0) {
                  setSelectedOther(otherPlayers[0][0]);
                }
                setShowSpectatePicker((prev) => !prev);
              }}
              disabled={false}
              style={{
                padding: "10px 14px",
                background: spectateId ? "#2563eb" : "rgba(255,255,255,0.92)",
                color: spectateId ? "white" : "#111",
                borderRadius: 12,
                border: "none",
                boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
                fontWeight: 800,
              }}
            >
              {spectateId ? "Return to Your Board" : "See Other Board"}
            </button>
            {!spectateId && showSpectatePicker && (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  padding: 6,
                  zIndex: 200,
                  minWidth: 200,
                  display: "grid",
                  gap: 6,
                }}
              >
                {otherPlayers.length === 0 ? (
                  <div style={{ padding: "8px 10px", color: "#6b7280", fontWeight: 600 }}>No other boards yet</div>
                ) : (
                  otherPlayers.map(([pid, info]) => {
                    const label = info?.nickname || nicknameFor(pid);
                    return (
                      <button
                        key={pid}
                        onClick={() => {
                          setSelectedOther(pid);
                          setSpectateId(pid);
                          setShowSpectatePicker(false);
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: selectedOther === pid ? "#e0e7ff" : "white",
                          fontWeight: 700,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <div className="text-sm text-muted-foreground">Bag: {state.bag.length}</div>
          <div className="text-sm text-muted-foreground">Players: {Object.keys(state.players || {}).length}</div>
          {state.status.phase === "banana-split" && (
            <div className="text-sm font-bold" style={{ color: "#0f5132", background: "#d1e7dd", padding: "6px 10px", borderRadius: 10 }}>
              Winner Winner Chicken Dinner: {winnerNick || state.status.winnerId || "Unknown"}
            </div>
          )}
        </div>
      </header>

      {spectateId && (
        <div
          style={{
            position: "absolute",
            top: HEADER_H + 8,
            left: 12,
            background: "rgba(37,99,235,0.12)",
            color: "#1d4ed8",
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(37,99,235,0.3)",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 55,
          }}
        >
          <span>Viewing {nicknameFor(viewingPlayerId)}'s board</span>
          <button
            onClick={() => setSpectateId(null)}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Return to Your Board
          </button>
        </div>
      )}

      {/* Board */}
      <div
        ref={boardRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          ...gridBg,
        }}
        onMouseDown={(e) => {
          if (isSpectating) return;
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (target && target.closest("[data-tile]") ) return; // let tile drag handle it
          e.preventDefault();
          dispatch({ type: "MARQUEE_BEGIN", mouse: { x: e.clientX, y: e.clientY } });
        }}
        onMouseMove={(e) => {
          if (isSpectating) return;
          if (state.drag.kind === "marquee") {
            dispatch({ type: "MARQUEE_UPDATE", mouse: { x: e.clientX, y: e.clientY } });
          }
        }}
        onMouseUp={(e) => {
          if (isSpectating) return;
          if (state.drag.kind === "marquee") {
            finalizeMarqueeSelection({ x: e.clientX, y: e.clientY });
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (isSpectating) return;
          const id = e.dataTransfer.getData("application/tile-id") as TileId;
          if (!id) return;
          const from = e.dataTransfer.getData("application/from");
          const pos = dropEventToWorld(e);
          if (!pos) return;
          if (from === "board") {
            const selectedIds = selection[id] ? Object.keys(selection) : [id];
            const source = state.tiles[id];
            if (!source) return;
            const delta = { x: pos.x - source.pos.x, y: pos.y - source.pos.y };
                  dispatch({ type: "MOVE_TILES", tileIds: selectedIds, delta });
                  dispatch({ type: "SELECT_CLEAR" });
                  setDragVisual({ active: false, ids: [], start: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
          } else {
            dispatch({ type: "PLACE_TILE", tileId: id, pos });
          }
        }}
      >
        {marqueeStyle && <div style={marqueeStyle} />}
        {typingMode.enabled && !isSpectating && (
          (() => {
            const { left, top } = worldToPx(typingMode.cursor);
            const arrow = typingMode.advanceDir === "right" ? "→" : "↓";
            return (
              <div
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: tileSize,
                  height: tileSize,
                  borderRadius: 10,
                  border: "2px dashed #2563eb",
                  background: "rgba(37,99,235,0.12)",
                  pointerEvents: "none",
                  zIndex: 8,
                  boxShadow: "0 0 0 2px rgba(37,99,235,0.16)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1d4ed8",
                  fontWeight: 800,
                  fontSize: Math.max(14, tileSize * 0.38),
                  opacity: 0.9,
                  gap: 4,
                }}
              >
                <span style={{ opacity: 0.9 }}>{arrow}</span>
              </div>
            );
          })()
        )}
        {boardTiles.map((t) => {
          const { left, top } = worldToPx(t.pos);
          const color = validity
            ? validity.invalid.has(t.id)
              ? "#b3261e" // any invalid run takes precedence
              : validity.valid.has(t.id)
                ? "#1a7f37" // only valid, no invalid overlap
                : "#2b2b2b"
            : "#2b2b2b";
          const isSelected = !!selection[t.id];
          const isDragging = dragVisual.active && dragVisual.ids.includes(t.id);
          const dx = isDragging ? dragVisual.current.x - dragVisual.start.x : 0;
          const dy = isDragging ? dragVisual.current.y - dragVisual.start.y : 0;
          return (
            <div
              key={t.id}
              draggable
              data-tile="1"
              onDoubleClick={() => { if (!isSpectating) dispatch({ type: "RETURN_TO_RACK", tileId: t.id }); }}
              onDragStart={(e) => {
                if (isSpectating) return;
                e.dataTransfer.setData("application/tile-id", t.id);
                e.dataTransfer.setData("application/from", "board");
                const ids = selection[t.id] ? Object.keys(selection) : [t.id];
                setDragVisual({ active: true, ids, start: { x: e.clientX, y: e.clientY }, current: { x: e.clientX, y: e.clientY } });
                try {
                  e.dataTransfer.effectAllowed = "move";
                } catch {}
              }}
              onDrag={(e) => {
                if (isSpectating || !dragVisual.active) return;
                setDragVisual((prev) => ({ ...prev, current: { x: e.clientX, y: e.clientY } }));
              }}
              onDragEnd={() => {
                setDragVisual({ active: false, ids: [], start: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
              }}
              style={{
                position: "absolute",
                left,
                top,
                ...boardTileStyle(tileSize),
                paddingBottom: Math.max(6, tileSize * 0.32),
                color,
                background: isSelected ? "linear-gradient(180deg,#e7f0ff,#c7d7ff)" : boardTileStyle(tileSize).background,
                transform: isDragging ? `translate(${dx}px, ${dy}px)` : undefined,
                opacity: isDragging ? 0.9 : 1,
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
                      if (isSpectating) return;
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
            <button
              onClick={() => dispatch({ type: "SHUFFLE_RACK" })}
              disabled={isSpectating || rackTiles.length < 2}
              style={{
                padding: "10px 14px",
                background: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
                fontWeight: 800,
                cursor: isSpectating ? "not-allowed" : "pointer",
                opacity: rackTiles.length < 2 ? 0.7 : 1,
              }}
              title={isSpectating ? "Cannot shuffle while spectating" : "Shuffle rack (Enter)"}
            >
              Shuffle (Enter)
            </button>
            <div
              className="w-35 h-20 bg-red-200 border border-red-400 rounded flex items-center justify-center text-sm"
              style={{ minWidth: 80 }}
              title="Drop a rack tile here to dump it and draw replacement(s)"
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                if (isSpectating) return;
                const id = e.dataTransfer.getData("application/tile-id") as TileId;
                if (!id) return;
                const tile = state.tiles[id];
                if (!tile || tile.owner !== state.selfId) return;
                try {
                  const drawn = await dumpAndDraw(gameId, [tile.letter]);
                  if (drawn.length === 0) {
                    setFlash("No tiles to draw");
                    return;
                  }
                  dispatch({ type: "APPLY_DUMP", tileIds: [id], newLetters: drawn });
                } catch (err) {
                  setFlash("Dump failed");
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

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  canFormWord,
  claimWord,
  createGame,
  findSnatchSourceOptions,
  findSnatchSources,
  isPendingSnatchLive,
  normalizeWord,
  PENDING_SNATCH_TTL_MS,
  type GameState,
  type PendingSnatch,
  type PlayerState,
  type WordSource,
} from "../engine";
import {
  cancelAnagramsSnatch,
  claimAnagramsWord,
  drawAnagramsTile,
  leaveAnagramsLobby,
  proposeAnagramsSnatch,
  resetAnagramsGame,
  subscribeAnagramsGame,
  touchAnagramsPlayer,
  type ClaimSource,
  type MoveResult,
} from "../firebase/rtdb";
import type { AnagramsLobbyChoice } from "../LobbyGate";

const emptyState = (): GameState => ({ ...createGame({ players: {} }), bag: [] });

const tileStyle: CSSProperties = {
  width: "var(--tile-size)",
  height: "var(--tile-size)",
  borderRadius: 6,
  background: "linear-gradient(180deg, #f5e6d3, #e8d5bd)",
  border: "2px solid #d8c5ab",
  boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), inset 0 -2px 3px rgba(0,0,0,0.18)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  color: "#2b2b2b",
  fontSize: "var(--tile-font)",
  letterSpacing: 0.5,
  fontFamily: "Arial Black, Arial, sans-serif",
  userSelect: "none",
};

const sourceKey = (source: WordSource) => `${source.playerId}:${source.wordIndex}`;

export function AnagramsVisualizer({ choice }: { choice: AnagramsLobbyChoice }) {
  const gameId = choice.gameId;
  const playerId = choice.playerId;
  const [state, setState] = useState<GameState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [uiScale, setUiScale] = useState(1);
  const [claimInput, setClaimInput] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<WordSource[]>([]);
  const [selectedPool, setSelectedPool] = useState(false);
  const [snatchNotice, setSnatchNotice] = useState<string | null>(null);
  const [dictStatus, setDictStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fullDictionaryRef = useRef<Set<string> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const [ringSize, setRingSize] = useState({ width: 0, height: 0 });
  const [centerSize, setCenterSize] = useState({ width: 0, height: 0 });
  const lastSnatchSeenRef = useRef(Date.now());

  const { activePlayers, inactiveWithWords } = useMemo(() => {
    const entries = Object.entries(state.players ?? {}) as Array<[string, PlayerState]>;
    const sorted = entries
      .map(([id, player]) => ({ playerId: id, player }))
      .sort((a, b) => {
        const aJoined = a.player.joinedAt ?? 0;
        const bJoined = b.player.joinedAt ?? 0;
        if (aJoined !== bJoined) return aJoined - bJoined;
        return a.player.name.localeCompare(b.player.name);
      });

    const active = sorted.filter((entry) => entry.player.active !== false);
    const inactive = sorted.filter(
      (entry) => entry.player.active === false && (entry.player.words ?? []).length > 0,
    );

    return { activePlayers: active, inactiveWithWords: inactive };
  }, [state.players]);

  const displayCount = Math.min(6, activePlayers.length);
  const playerSlots = useMemo(() => activePlayers.slice(0, displayCount), [activePlayers, displayCount]);

  // A steal choice that its claimant abandoned expires so the table isn't stuck.
  const pendingSnatch: PendingSnatch | null = isPendingSnatchLive(state.pendingSnatch, now) ? state.pendingSnatch ?? null : null;
  const isChooser = pendingSnatch?.claimantId === playerId;
  const isWaiting = !!pendingSnatch && !isChooser;
  const claimantName = pendingSnatch ? state.players?.[pendingSnatch.claimantId]?.name ?? "Someone" : "Someone";
  const pendingSecondsLeft = pendingSnatch
    ? Math.max(0, Math.min(PENDING_SNATCH_TTL_MS, PENDING_SNATCH_TTL_MS - (now - pendingSnatch.createdAt)) / 1000)
    : 0;
  const candidateKeys = useMemo(() => {
    const keys = new Set<string>();
    pendingSnatch?.options?.forEach((option) => option.forEach((source) => keys.add(sourceKey(source))));
    return keys;
  }, [pendingSnatch]);

  const leader = useMemo(() => {
    let best: { name: string; score: number } | null = null;
    for (const player of Object.values(state.players ?? {})) {
      if (!best || player.score > best.score) best = { name: player.name, score: player.score };
    }
    return best;
  }, [state.players]);
  const bagEmpty = loaded && state.bag.length === 0;

  const useRingLayout = ringSize.width >= 900 && ringSize.height >= 600;
  const layoutMetrics = useMemo(() => {
    if (!useRingLayout || displayCount === 0) {
      return { radius: 0, spread: 0, centerRadius: 0 };
    }
    const minDim = Math.min(ringSize.width, ringSize.height);
    const centerRadius = Math.max(centerSize.width, centerSize.height) / 2 + 220;
    const spread = Math.max(120, minDim * 0.14);
    const radius = Math.max(340, minDim / 2 - centerRadius + spread);
    return { radius, spread, centerRadius };
  }, [useRingLayout, displayCount, ringSize, centerSize]);

  const slotPositions = useMemo(() => {
    if (!useRingLayout || displayCount === 0) return [];
    // Keep cards on screen: never place one closer to an edge than about half a card.
    const radiusX = Math.min(layoutMetrics.radius, ringSize.width / 2 - 190);
    const radiusY = Math.min(layoutMetrics.radius, ringSize.height / 2 - 80);
    return Array.from({ length: displayCount }, (_, idx) => {
      const angle = (2 * Math.PI * idx) / displayCount - Math.PI / 2;
      return {
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY,
      };
    });
  }, [useRingLayout, displayCount, layoutMetrics, ringSize]);

  const totalLetters = useMemo(() => {
    let total = state.revealed.length;
    for (const player of Object.values(state.players ?? {})) {
      for (const word of player.words ?? []) total += word.length;
    }
    return total;
  }, [state.players, state.revealed]);

  const tileSizeRem = useMemo(() => {
    const max = 1.6;
    const min = 0.95;
    return Math.max(min, Math.min(max, max - totalLetters * 0.01));
  }, [totalLetters]);
  const tileFontRem = Number((tileSizeRem * 0.62).toFixed(2));

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const report = (result: MoveResult) => {
    if (!result.ok) setClaimError(result.reason);
    return result.ok;
  };

  // ---- subscriptions & presence ---------------------------------------------

  useEffect(() => {
    const unsubscribe = subscribeAnagramsGame(gameId, (snapshot) => {
      const rawPlayers = (snapshot.players ?? {}) as Record<string, PlayerState>;
      const playersMap = Object.entries(rawPlayers).reduce((acc, [id, player]) => {
        const words = Array.isArray(player?.words) ? player.words : [];
        acc[id] = {
          name: player?.name ?? "Player",
          words,
          score: words.reduce((sum, w) => sum + w.length, 0),
          joinedAt: player?.joinedAt,
          lastSeen: player?.lastSeen,
          active: player?.active ?? true,
        };
        return acc;
      }, {} as Record<string, PlayerState>);
      setState({
        bag: snapshot.bag ?? [],
        revealed: snapshot.revealed ?? [],
        players: playersMap,
        minWordLength: snapshot.minWordLength ?? 3,
        pendingSnatch: snapshot.pendingSnatch ?? null,
        lastSnatch: snapshot.lastSnatch ?? null,
      });
      setLoaded(true);
    });
    return () => unsubscribe();
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !playerId) return;
    touchAnagramsPlayer(gameId, playerId).catch(() => {});
    const tick = window.setInterval(() => {
      touchAnagramsPlayer(gameId, playerId).catch(() => {});
    }, 15000);
    const handleUnload = () => {
      leaveAnagramsLobby(gameId, playerId).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.clearInterval(tick);
      leaveAnagramsLobby(gameId, playerId).catch(() => {});
    };
  }, [gameId, playerId]);

  // Tick while a steal choice is open so its countdown and expiry render.
  useEffect(() => {
    if (!state.pendingSnatch) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [state.pendingSnatch?.createdAt]);

  useEffect(() => {
    setSelectedSources([]);
    setSelectedPool(false);
    setClaimError(null);
  }, [pendingSnatch?.createdAt]);

  useEffect(() => {
    const last = state.lastSnatch;
    if (!last?.at) return;
    if (lastSnatchSeenRef.current >= last.at) return;
    lastSnatchSeenRef.current = last.at;
    const wasTarget = (last.targets ?? []).some((target) => target.playerId === playerId);
    if (!wasTarget || last.byPlayerId === playerId) return;
    setSnatchNotice("That sucks for you!");
    const timer = window.setTimeout(() => setSnatchNotice(null), 1600);
    return () => window.clearTimeout(timer);
  }, [state.lastSnatch, playerId]);

  // ---- dictionary -------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const minLength = Math.max(1, Math.floor(state.minWordLength ?? 1));

    async function loadDictionary() {
      try {
        if (!fullDictionaryRef.current) {
          setDictStatus("loading");
          const url = new URL("../dictionary.txt", import.meta.url).toString();
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const txt = await resp.text();
          const all = new Set<string>();
          for (const line of txt.split(/\r?\n/)) {
            const cleaned = line.trim().replace(/[^A-Za-z]/g, "").toUpperCase();
            if (cleaned.length > 0) all.add(cleaned);
          }
          fullDictionaryRef.current = all;
        }
        if (fullDictionaryRef.current && !cancelled) {
          const filtered = new Set<string>();
          fullDictionaryRef.current.forEach((word) => {
            if (word.length >= minLength) filtered.add(word);
          });
          setDictionary(filtered);
          setDictStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setDictionary(null);
          setDictStatus("error");
        }
      }
    }

    loadDictionary();
    return () => {
      cancelled = true;
    };
  }, [state.minWordLength]);

  // ---- layout measurement -------------------------------------------------------

  useEffect(() => {
    const computeScale = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      setUiScale(Math.max(0.95, Math.min(1.35, minDim / 880)));
    };
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  useEffect(() => {
    const observe = (node: HTMLDivElement | null, set: (size: { width: number; height: number }) => void) => {
      if (!node) return () => {};
      const update = () => {
        const rect = node.getBoundingClientRect();
        set({ width: rect.width, height: rect.height });
      };
      update();
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
      observer?.observe(node);
      window.addEventListener("resize", update);
      return () => {
        window.removeEventListener("resize", update);
        observer?.disconnect();
      };
    };
    const stopRing = observe(ringRef.current, setRingSize);
    const stopCenter = observe(centerRef.current, setCenterSize);
    return () => {
      stopRing();
      stopCenter();
    };
  }, []);

  // ---- moves ------------------------------------------------------------------

  const withWords = (sources: WordSource[]): ClaimSource[] =>
    sources.map((source) => ({
      playerId: source.playerId,
      wordIndex: source.wordIndex,
      word: source.word ?? state.players?.[source.playerId]?.words?.[source.wordIndex] ?? "",
    }));

  const submitClaim = (word: string, sources: ClaimSource[]) => {
    if (!dictionary) return;
    const submitted = claimInput;
    claimAnagramsWord(gameId, playerId, word, sources, dictionary).then((result) => {
      if (report(result)) {
        setClaimInput((current) => (current === submitted ? "" : current));
        setSelectedSources([]);
        setSelectedPool(false);
        setClaimError(null);
      }
    });
  };

  const handleDraw = () => {
    if (pendingSnatch) {
      setClaimError(isChooser ? "Pick a word to steal first." : `Waiting for ${claimantName} to choose.`);
      return;
    }
    setClaimError(null);
    drawAnagramsTile(gameId).then(report);
    focusInput();
  };

  const handleClaim = () => {
    if (pendingSnatch) {
      setClaimError(isChooser ? "Choose the word to steal, then confirm." : `Waiting for ${claimantName} to choose.`);
      focusInput();
      return;
    }
    const input = claimInput.trim();
    if (!input) {
      focusInput();
      return;
    }
    if (dictStatus !== "ready" || !dictionary) {
      setClaimError(dictStatus === "error" ? "Dictionary failed to load. Refresh the page." : "Dictionary still loading…");
      return;
    }
    const word = normalizeWord(input);
    if (word.length < state.minWordLength) {
      setClaimError(`Words need at least ${state.minWordLength} letters.`);
      return;
    }
    if (!dictionary.has(word)) {
      setClaimError(`${word} isn't in the dictionary.`);
      return;
    }

    // Words clicked before typing are an explicit steal.
    if (selectedSources.length > 0) {
      submitClaim(word, withWords(selectedSources));
      return;
    }

    // Otherwise find every legal way to make the word: from the middle alone, or by stealing.
    const canUsePool = canFormWord(state.revealed, word);
    const options = findSnatchSourceOptions(state, word, 6, canUsePool);
    let snatchOptions = options.ok ? options.options ?? [] : [];
    if (snatchOptions.length === 0) {
      const auto = findSnatchSources(state, word);
      if (auto.ok && auto.sources) snatchOptions = [auto.sources];
    }
    const validOptions = snatchOptions
      .map(withWords)
      .filter((option) => claimWord(state, playerId, word, option, dictionary).ok);
    const poolOk = canUsePool && claimWord(state, playerId, word, [], dictionary).ok;
    const routes = validOptions.length + (poolOk ? 1 : 0);

    if (routes === 0) {
      const attempt = claimWord(state, playerId, word, snatchOptions[0] ? withWords(snatchOptions[0]) : [], dictionary);
      setClaimError(attempt.reason ?? `Can't make ${word} right now.`);
      return;
    }
    if (routes === 1) {
      submitClaim(word, poolOk ? [] : validOptions[0]);
      return;
    }

    // More than one way to make it: the claimant picks, everyone else waits.
    proposeAnagramsSnatch(gameId, {
      claimantId: playerId,
      word,
      options: validOptions,
      allowPool: poolOk,
      createdAt: Date.now(),
    }).then(report);
    setClaimError(null);
  };

  const confirmPendingSnatch = () => {
    if (!pendingSnatch || !isChooser || !dictionary) return;
    if (selectedPool && pendingSnatch.allowPool) {
      submitClaim(pendingSnatch.word, []);
      return;
    }
    const selectionKeys = selectedSources.map(sourceKey).sort().join("|");
    const option = pendingSnatch.options?.find((opt) => opt.map(sourceKey).sort().join("|") === selectionKeys);
    if (!option || selectedSources.length === 0) {
      setClaimError(pendingSnatch.allowPool ? "Pick a highlighted word, or take from the middle." : "Pick a highlighted word to steal.");
      return;
    }
    submitClaim(pendingSnatch.word, withWords(option));
  };

  const cancelPendingSnatch = () => {
    if (!pendingSnatch || !isChooser) return;
    cancelAnagramsSnatch(gameId, playerId).then(report);
    setSelectedSources([]);
    setSelectedPool(false);
    setClaimError(null);
    focusInput();
  };

  const handleReset = () => {
    if (pendingSnatch) return;
    if (!window.confirm("Start a new round? This clears everyone's words and refills the bag.")) return;
    setClaimInput("");
    setSelectedSources([]);
    setClaimError(null);
    resetAnagramsGame(gameId).then(report);
    focusInput();
  };

  const toggleSource = (source: WordSource) => {
    if (!source.playerId) return;
    if (pendingSnatch && !isChooser) return;
    const key = sourceKey(source);
    if (pendingSnatch && !candidateKeys.has(key)) return;
    setClaimError(null);
    if (pendingSnatch) {
      // While choosing, pick the whole option this word belongs to.
      const option = pendingSnatch.options.find((opt) => opt.some((s) => sourceKey(s) === key));
      setSelectedPool(false);
      setSelectedSources(option ? option.map((s) => ({ playerId: s.playerId, wordIndex: s.wordIndex })) : []);
      focusInput();
      return;
    }
    setSelectedSources((current) =>
      current.some((item) => sourceKey(item) === key)
        ? current.filter((item) => sourceKey(item) !== key)
        : [...current, { playerId: source.playerId, wordIndex: source.wordIndex }],
    );
    focusInput();
  };

  const takeFromMiddle = () => {
    if (!pendingSnatch || !isChooser || !pendingSnatch.allowPool) return;
    setSelectedPool(true);
    setSelectedSources([]);
    setClaimError(null);
  };

  // Keyboard: Space flips anywhere; Enter claims (or confirms a steal). The input
  // handles its own Enter, so the window listener skips it to avoid double claims.
  const actionsRef = useRef({ draw: handleDraw, enter: handleClaim });
  actionsRef.current = {
    draw: handleDraw,
    enter: () => (pendingSnatch && isChooser ? confirmPendingSnatch() : handleClaim()),
  };

  useEffect(() => {
    focusInput();
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const inInput = event.target === inputRef.current;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        actionsRef.current.draw();
        return;
      }
      if (event.key === "Enter") {
        if (inInput) return;
        event.preventDefault();
        actionsRef.current.enter();
        return;
      }
      if (!inInput) focusInput();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ---- render -----------------------------------------------------------------

  const wordStyle = (isSelected: boolean, isCandidate: boolean, canClick: boolean): CSSProperties => ({
    border: isSelected
      ? "2px solid #2563eb"
      : isCandidate
        ? "2px dashed #f59e0b"
        : "1px solid rgba(15,23,42,0.12)",
    background: isSelected
      ? "rgba(219,234,254,0.95)"
      : isCandidate
        ? "rgba(254,243,199,0.9)"
        : "rgba(255,255,255,0.85)",
    cursor: canClick ? "pointer" : "not-allowed",
    opacity: pendingSnatch && !isCandidate ? 0.25 : 1,
    position: pendingSnatch && isCandidate ? "relative" : undefined,
    zIndex: pendingSnatch && isCandidate ? 25 : undefined,
  });

  const renderWord = (ownerId: string, word: string, wordIndex: number) => {
    const key = `${ownerId}:${wordIndex}`;
    const isCandidate = pendingSnatch ? candidateKeys.has(key) : false;
    const isSelected = selectedSources.some((source) => sourceKey(source) === key);
    const canClick = !pendingSnatch || (isChooser && isCandidate);
    return (
      <div
        key={`${ownerId}-${word}-${wordIndex}`}
        className="anagrams-word"
        style={wordStyle(isSelected, isCandidate, canClick)}
        onClick={() => canClick && toggleSource({ playerId: ownerId, wordIndex })}
      >
        {word.split("").map((letter, letterIndex) => (
          <div key={`${word}-${letterIndex}`} style={tileStyle}>
            {letter}
          </div>
        ))}
      </div>
    );
  };

  const renderPlayerCard = (slotIndex: number) => {
    const slot = playerSlots[slotIndex];
    if (!slot) return null;
    const { player } = slot;
    const wordCount = player.words.length;
    return (
      <div className="anagrams-player-card" style={{ width: "100%", maxWidth: 360 }}>
        <div className="anagrams-player-header">
          <div className="anagrams-player-name">{player.name}</div>
          <div className="anagrams-meta">
            {wordCount} word{wordCount === 1 ? "" : "s"} · {player.score} pts
          </div>
        </div>
        <div className="anagrams-words">
          {player.words.map((word, wordIndex) => renderWord(slot.playerId, word, wordIndex))}
        </div>
      </div>
    );
  };

  return (
    <section
      className="anagrams-stage"
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button, input")) return;
        focusInput();
      }}
      style={{
        "--ui-scale": uiScale,
        "--tile-size": `${(tileSizeRem * uiScale).toFixed(2)}rem`,
        "--tile-font": `${(tileFontRem * uiScale).toFixed(2)}rem`,
      } as CSSProperties}
    >
      <style>{`
        html, body, #root {
          width: 100%;
          height: 100%;
          margin: 0;
        }
        .anagrams-stage {
          min-height: 100vh;
          height: 100vh;
          width: 100vw;
          background: linear-gradient(135deg, #667eea, #764ba2);
          padding: calc(16px * var(--ui-scale));
          color: #111827;
          box-sizing: border-box;
          font-size: calc(16px * var(--ui-scale));
          overflow-y: auto;
        }
        .anagrams-ring {
          position: relative;
          gap: calc(18px * var(--ui-scale));
          width: 100%;
          height: 100%;
          margin: 0;
        }
        .anagrams-slot {
          width: 100%;
          display: flex;
          justify-content: center;
          z-index: 5;
        }
        .anagrams-center {
          width: 100%;
          display: grid;
          gap: calc(14px * var(--ui-scale));
          justify-items: center;
          z-index: 12;
        }
        .anagrams-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: calc(18px * var(--ui-scale));
          padding: calc(12px * var(--ui-scale)) calc(14px * var(--ui-scale)) calc(14px * var(--ui-scale));
          box-shadow: 0 10px 24px rgba(17, 24, 39, 0.18);
        }
        .anagrams-player-card {
          background: transparent;
          border-radius: 0;
          padding: 0;
          box-shadow: none;
        }
        .anagrams-player-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 8px;
          gap: 10px;
        }
        .anagrams-player-name {
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-size: calc(0.7rem * var(--ui-scale));
          background: rgba(255, 255, 255, 0.9);
          padding: 6px 10px;
          color: #111827;
          clip-path: polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%);
          box-shadow: 0 6px 14px rgba(17, 24, 39, 0.12);
        }
        .anagrams-title {
          font-weight: 900;
          letter-spacing: 0.08em;
          font-size: calc(0.8rem * var(--ui-scale));
          text-transform: uppercase;
          transform: rotate(-2deg);
          text-shadow: 0 2px 0 rgba(0, 0, 0, 0.08);
        }
        .anagrams-words {
          display: flex;
          flex-wrap: wrap;
          gap: calc(0.2rem * var(--ui-scale));
          margin-top: calc(10px * var(--ui-scale));
        }
        .anagrams-word {
          display: inline-flex;
          flex-wrap: wrap;
          gap: calc(0.2rem * var(--ui-scale));
          padding: calc(4px * var(--ui-scale));
          border-radius: calc(10px * var(--ui-scale));
          cursor: default;
        }
        .anagrams-pool {
          display: grid;
          gap: calc(12px * var(--ui-scale));
          justify-items: center;
          width: 100%;
          max-width: min(90vw, calc(440px * var(--ui-scale)));
        }
        .anagrams-pool-tiles {
          display: flex;
          flex-wrap: wrap;
          gap: calc(0.2rem * var(--ui-scale));
          justify-content: center;
          min-height: calc(2rem * var(--ui-scale));
        }
        .anagrams-button {
          padding: calc(10px * var(--ui-scale)) calc(16px * var(--ui-scale));
          border-radius: calc(10px * var(--ui-scale));
          border: 1px solid #d7b93b;
          background: #f6d44a;
          font-weight: 900;
          letter-spacing: 0.02em;
          color: #4b3c12;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
          cursor: pointer;
        }
        .anagrams-input {
          width: 100%;
          padding: calc(8px * var(--ui-scale)) calc(10px * var(--ui-scale));
          border-radius: calc(10px * var(--ui-scale));
          border: 1px solid #e5e7eb;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.9);
        }
        .anagrams-meta {
          font-size: calc(0.75rem * var(--ui-scale));
          color: #6b7280;
          font-weight: 700;
        }
        .anagrams-dim {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(1px);
          z-index: 20;
          display: grid;
          place-items: start center;
          padding-top: calc(24px * var(--ui-scale));
        }
        .anagrams-dim-message {
          background: rgba(255, 255, 255, 0.95);
          color: #111827;
          padding: calc(10px * var(--ui-scale)) calc(14px * var(--ui-scale));
          border-radius: calc(999px * var(--ui-scale));
          font-weight: 800;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
        }
        .anagrams-flash {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: grid;
          place-items: center;
          background: rgba(220, 38, 38, 0.2);
          color: #7f1d1d;
          font-weight: 900;
          font-size: calc(1.5rem * var(--ui-scale));
          text-transform: uppercase;
          letter-spacing: 0.08em;
          pointer-events: none;
          animation: anagrams-flash 1.4s ease forwards;
        }
        @keyframes anagrams-flash {
          0% { opacity: 0; transform: scale(0.98); }
          20% { opacity: 1; transform: scale(1); }
          90% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 900px) {
          .anagrams-stage {
            height: auto;
          }
          .anagrams-ring {
            display: flex;
            flex-direction: column;
            height: auto;
          }
          .anagrams-slot,
          .anagrams-center {
            width: 100%;
            position: static !important;
            transform: none !important;
          }
        }
      `}</style>

      {pendingSnatch ? (
        <div className="anagrams-dim" style={{ pointerEvents: isWaiting ? "auto" : "none" }}>
          <div className="anagrams-dim-message">
            {isChooser
              ? `Choose which word to take (${Math.ceil(pendingSecondsLeft)}s)`
              : `Waiting for ${claimantName} to choose a word to take... (${Math.ceil(pendingSecondsLeft)}s)`}
          </div>
        </div>
      ) : null}

      {snatchNotice ? <div className="anagrams-flash">{snatchNotice}</div> : null}

      <div className="anagrams-ring" ref={ringRef}>
        {playerSlots.map((slot, idx) => {
          const pos = slotPositions[idx];
          const style = useRingLayout && pos
            ? {
              position: "absolute" as const,
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`,
            }
            : undefined;
          return (
            <div key={slot.playerId ?? idx} className="anagrams-slot" style={style}>
              {renderPlayerCard(idx)}
            </div>
          );
        })}

        <div
          className="anagrams-center"
          ref={centerRef}
          style={useRingLayout ? { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" } : undefined}
        >
          <div className="anagrams-card anagrams-pool">
            <div className="anagrams-title">Tile Pool</div>
            <div className="anagrams-pool-tiles">
              {state.revealed.length === 0 ? (
                <div className="anagrams-meta">(none)</div>
              ) : (
                state.revealed.map((tile, index) => (
                  <div key={`${tile}-${index}`} style={tileStyle}>
                    {tile}
                  </div>
                ))
              )}
            </div>
            {bagEmpty ? (
              <div className="anagrams-meta" style={{ textAlign: "center" }}>
                Bag's empty.{leader && leader.score > 0 ? ` ${leader.name} leads with ${leader.score}.` : ""}
              </div>
            ) : (
              <button
                type="button"
                className="anagrams-button"
                onClick={handleDraw}
                disabled={!!pendingSnatch || !loaded}
                style={{ opacity: pendingSnatch ? 0.6 : 1, cursor: pendingSnatch ? "not-allowed" : "pointer" }}
              >
                Flip a Tile
              </button>
            )}
            <div className="anagrams-meta">{loaded ? `${state.bag.length} tiles left in the bag` : ""}</div>
            <div style={{ width: "100%", display: "grid", gap: 8 }}>
              <input
                ref={inputRef}
                value={claimInput}
                onChange={(event) => {
                  setClaimInput(event.target.value.replace(/\s/g, ""));
                  setClaimError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  actionsRef.current.enter();
                }}
                onBlur={() => {
                  // Keep typing flowing into the box, but don't fight other controls (e.g. the reset confirm).
                  requestAnimationFrame(() => {
                    const active = document.activeElement;
                    if (!active || active === document.body) focusInput();
                  });
                }}
                placeholder="Type a word..."
                className="anagrams-input"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                disabled={isWaiting}
              />
              {claimError ? <div className="anagrams-meta">{claimError}</div> : null}
              {pendingSnatch ? (
                <div className="anagrams-meta">
                  {isChooser
                    ? "Select the highlighted word(s), then confirm your snatch."
                    : `Waiting for ${claimantName} to select a word to take.`}
                </div>
              ) : null}
              {pendingSnatch && isChooser && pendingSnatch.allowPool ? (
                <button
                  type="button"
                  onClick={takeFromMiddle}
                  style={{
                    border: selectedPool ? "2px solid #2563eb" : "2px dashed #f59e0b",
                    background: selectedPool ? "rgba(219,234,254,0.95)" : "rgba(254,243,199,0.9)",
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontWeight: 800,
                    cursor: "pointer",
                    position: "relative",
                    zIndex: 25,
                  }}
                >
                  Take from middle
                </button>
              ) : null}
              {dictStatus !== "ready" ? (
                <div className="anagrams-meta">
                  {dictStatus === "loading" ? "Loading dictionary..." : "Dictionary failed to load."}
                </div>
              ) : null}
              {pendingSnatch && isChooser ? (
                <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 25 }}>
                  <button type="button" className="anagrams-button" onClick={confirmPendingSnatch}>
                    Confirm snatch (Enter)
                  </button>
                  <button
                    type="button"
                    className="anagrams-meta"
                    onClick={cancelPendingSnatch}
                    style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleReset}
                className="anagrams-meta"
                style={{
                  background: "transparent",
                  border: "none",
                  textDecoration: "underline",
                  cursor: pendingSnatch ? "not-allowed" : "pointer",
                  opacity: pendingSnatch ? 0.6 : 1,
                }}
                disabled={!!pendingSnatch}
              >
                Reset game
              </button>
            </div>
          </div>

          {inactiveWithWords.length > 0 ? (
            <div className="anagrams-player-card" style={{ width: "100%", maxWidth: 360 }}>
              <div className="anagrams-player-header">
                <div className="anagrams-player-name">Gone but not Forgotten</div>
              </div>
              <div className="anagrams-words">
                {inactiveWithWords.map(({ playerId: goneId, player }) => (
                  <div key={`gone-${goneId}`} style={{ width: "100%" }}>
                    <div className="anagrams-meta" style={{ marginBottom: 6 }}>
                      {player.name}
                    </div>
                    <div className="anagrams-words">
                      {player.words.map((word, wordIndex) => renderWord(goneId, word, wordIndex))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

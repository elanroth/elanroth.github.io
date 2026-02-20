import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  claimWord,
  createGame,
  drawTile,
  findSnatchSourceOptions,
  findSnatchSources,
  canFormWord,
  normalizeWord,
  type GameState,
  type PendingSnatch,
  type PlayerState,
  type WordSource,
} from "../engine";
import { leaveAnagramsLobby, subscribeAnagramsGame, touchAnagramsPlayer, updateAnagramsGame } from "../firebase/rtdb";
import type { AnagramsLobbyChoice } from "../LobbyGate";

const createSession = () => createGame({ players: {} });

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

export function AnagramsVisualizer({ choice }: { choice: AnagramsLobbyChoice }) {
  const gameId = choice.gameId;
  const playerId = choice.playerId;
  const [state, setState] = useState<GameState>(() => createSession());
  const [uiScale, setUiScale] = useState(1);
  const [claimInput, setClaimInput] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<WordSource[]>([]);
  const [selectedPool, setSelectedPool] = useState(false);
  const [snatchNotice, setSnatchNotice] = useState<string | null>(null);
  const [dictStatus, setDictStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const fullDictionaryRef = useRef<Set<string> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const [ringSize, setRingSize] = useState({ width: 0, height: 0 });
  const [centerSize, setCenterSize] = useState({ width: 0, height: 0 });
  const lastSnatchSeenRef = useRef(0);
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
  const pendingSnatch: PendingSnatch | null = state.pendingSnatch ?? null;
  const isChooser = pendingSnatch?.claimantId === playerId;
  const isWaiting = !!pendingSnatch && !isChooser;
  const claimantName = pendingSnatch
    ? state.players?.[pendingSnatch.claimantId]?.name ?? "Player"
    : "Player";
  const candidateKeys = useMemo(() => {
    if (!pendingSnatch?.options) return new Set<string>();
    const keys = new Set<string>();
    pendingSnatch.options.forEach((option) => {
      option.forEach((source) => keys.add(`${source.playerId}:${source.wordIndex}`));
    });
    return keys;
  }, [pendingSnatch]);

  const useRingLayout = ringSize.width >= 900 && ringSize.height >= 600;
  const layoutMetrics = useMemo(() => {
    if (!useRingLayout || displayCount === 0) {
      return {
        radius: 0,
        spread: 0,
        centerRadius: 0,
      };
    }
    const minDim = Math.min(ringSize.width, ringSize.height);
    const centerRadius = Math.max(centerSize.width, centerSize.height) / 2 + 220;
    const spread = Math.max(120, minDim * 0.14);
    const radius = Math.max(340, minDim / 2 - centerRadius + spread);
    return { radius, spread, centerRadius };
  }, [useRingLayout, displayCount, ringSize, centerSize]);

  const slotPositions = useMemo(() => {
    if (!useRingLayout || displayCount === 0) return [];
    return Array.from({ length: displayCount }, (_, idx) => {
      const angle = (2 * Math.PI * idx) / displayCount - Math.PI / 2;
      return {
        x: Math.cos(angle) * layoutMetrics.radius,
        y: Math.sin(angle) * layoutMetrics.radius,
      };
    });
  }, [useRingLayout, displayCount, layoutMetrics]);

  const totalLetters = useMemo(() => {
    let total = state.revealed.length;
    for (const player of Object.values(state.players ?? {})) {
      for (const word of player.words ?? []) {
        total += word.length;
      }
    }
    return total;
  }, [state.players, state.revealed]);

  const tileSizeRem = useMemo(() => {
    const max = 1.6;
    const min = 0.95;
    const size = max - totalLetters * 0.01;
    return Math.max(min, Math.min(max, size));
  }, [totalLetters]);

  const tileFontRem = Number((tileSizeRem * 0.62).toFixed(2));

  const focusInput = () => {
    inputRef.current?.focus();
  };

  useEffect(() => {
    focusInput();
    const handleKey = (event: KeyboardEvent) => {
      const isInputFocused = document.activeElement === inputRef.current;
      if (!isInputFocused) {
        if (event.key !== "Enter") {
          focusInput();
          return;
        }
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        handleDraw();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        console.log("[anagrams] key:enter", {
          gameId,
          playerId,
          pendingSnatch: !!pendingSnatch,
          isChooser,
          claimInput,
          selectedSources,
        });
        if (pendingSnatch && isChooser) {
          confirmPendingSnatch();
          return;
        }
        handleClaim();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, claimInput]);

  useEffect(() => {
    console.log("[anagrams] visualizer:mount", { gameId, playerId });
    return () => console.log("[anagrams] visualizer:unmount", { gameId, playerId });
  }, [gameId, playerId]);

  useEffect(() => {
    const computeScale = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      const scale = minDim / 880;
      const clamped = Math.max(0.95, Math.min(1.35, scale));
      setUiScale(clamped);
    };
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  useEffect(() => {
    const node = ringRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setRingSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateSize());
      observer.observe(node);
    }
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const node = centerRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setCenterSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateSize());
      observer.observe(node);
    }
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!useRingLayout) return;
    console.debug("[anagrams] layout:metrics", {
      ring: ringSize,
      center: centerSize,
      radius: Number(layoutMetrics.radius.toFixed(1)),
      spread: Number(layoutMetrics.spread.toFixed(1)),
      centerRadius: Number(layoutMetrics.centerRadius.toFixed(1)),
    });
  }, [useRingLayout, ringSize, centerSize, layoutMetrics]);

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
          txt
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((word) => {
              const cleaned = word.replace(/[^A-Za-z]/g, "").toUpperCase();
              if (cleaned.length > 0) all.add(cleaned);
            });
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
      } catch (err) {
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

  useEffect(() => {
    if (!pendingSnatch) return;
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
    if (!wasTarget) return;
    if (last.byPlayerId === playerId) return;
    setSnatchNotice("That sucks for you!");
    const timer = window.setTimeout(() => setSnatchNotice(null), 1600);
    return () => window.clearTimeout(timer);
  }, [state.lastSnatch, playerId]);


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

  const handleDraw = () => {
    if (pendingSnatch) return;
    const result = drawTile(state);
    setState(result.state);
    setClaimError(null);
    console.debug("[anagrams] draw", { gameId, result, revealed: result.state.revealed, bag: result.state.bag.length });
    updateAnagramsGame(gameId, result.state).catch(() => {});
    focusInput();
  };

  const handleClaim = () => {
    console.log("[anagrams] claim:trigger", {
      gameId,
      playerId,
      pendingSnatch: !!pendingSnatch,
      claimInput,
      selectedSources,
    });
    if (pendingSnatch) {
      if (isChooser) {
        setClaimError("Choose the word(s) to steal, then confirm.");
      } else {
        setClaimError(`Waiting for ${claimantName} to choose a word to take.`);
      }
      focusInput();
      return;
    }
    if (!claimInput.trim()) {
      focusInput();
      return;
    }
    if (dictStatus !== "ready" || !dictionary) {
      console.debug("[anagrams] claim:dictionaryNotReady", { dictStatus });
      setClaimError(dictStatus === "error" ? "Dictionary failed to load." : "Dictionary still loading.");
      focusInput();
      return;
    }
    const normalizedInput = claimInput.trim();
    let sourcesToUse = selectedSources;
    if (sourcesToUse.length === 0) {
      const canUsePool = canFormWord(state.revealed, normalizedInput);
      const options = findSnatchSourceOptions(state, normalizedInput, 6, canUsePool);
      let snatchOptions = options.ok ? (options.options ?? []) : [];
      if (snatchOptions.length === 0) {
        const auto = findSnatchSources(state, normalizedInput);
        if (auto.ok && auto.sources) {
          snatchOptions = [auto.sources];
          console.debug("[anagrams] claim:autoSources", { auto });
        }
      }
      const needsChoice = (snatchOptions.length > 1) || (snatchOptions.length > 0 && canUsePool);
      if (needsChoice) {
        const pending: PendingSnatch = {
          claimantId: playerId,
          word: normalizeWord(normalizedInput),
          options: snatchOptions,
          allowPool: canUsePool,
          createdAt: Date.now(),
        };
        console.log("[anagrams] pendingSnatch:create", {
          gameId,
          playerId,
          word: pending.word,
          optionCount: pending.options.length,
          options: pending.options,
          allowPool: pending.allowPool,
        });
        setSelectedSources([]);
        setSelectedPool(false);
        setClaimError(null);
        updateAnagramsGame(gameId, { pendingSnatch: pending }).catch(() => {});
        focusInput();
        return;
      }
      sourcesToUse = snatchOptions.length > 0 ? snatchOptions[0] : [];
    }
    console.debug("[anagrams] claim:attempt", { gameId, input: normalizedInput, selectedSources: sourcesToUse });
    const result = claimWord(state, playerId, normalizedInput, sourcesToUse, dictionary);
    setState(result.state);
    console.debug("[anagrams] claim:result", result);
    if (result.ok && sourcesToUse.length > 0) {
      const targets = sourcesToUse
        .map((source) => ({
          playerId: source.playerId,
          word: state.players?.[source.playerId]?.words?.[source.wordIndex] ?? "",
        }))
        .filter((target) => target.word.length > 0);
      updateAnagramsGame(gameId, {
        ...result.state,
        lastSnatch: {
          at: Date.now(),
          byPlayerId: playerId,
          word: normalizeWord(normalizedInput),
          targets,
        },
      }).catch(() => {});
    } else {
      updateAnagramsGame(gameId, result.state).catch(() => {});
    }
    if (result.ok) {
      setClaimInput("");
      setSelectedSources([]);
      setClaimError(null);
    } else {
      setClaimError(result.reason ?? "Word not allowed.");
    }
    focusInput();
  };

  const confirmPendingSnatch = () => {
    if (!pendingSnatch || !isChooser) return;
    if (dictStatus !== "ready" || !dictionary) {
      setClaimError(dictStatus === "error" ? "Dictionary failed to load." : "Dictionary still loading.");
      return;
    }
    console.log("[anagrams] pendingSnatch:confirm", {
      gameId,
      playerId,
      word: pendingSnatch.word,
      selectedSources,
      selectedPool,
      options: pendingSnatch.options,
      allowPool: pendingSnatch.allowPool,
    });
    if (selectedPool && pendingSnatch.allowPool) {
      const result = claimWord(state, playerId, pendingSnatch.word, [], dictionary);
      console.log("[anagrams] pendingSnatch:confirm:claimResult", result);
      if (!result.ok) {
        setClaimError(result.reason ?? "Word not allowed.");
        updateAnagramsGame(gameId, { pendingSnatch: null }).catch(() => {});
        return;
      }

      updateAnagramsGame(gameId, {
        ...result.state,
        pendingSnatch: null,
      }).catch(() => {});

      setClaimInput("");
      setSelectedSources([]);
      setSelectedPool(false);
      setClaimError(null);
      return;
    }
    const selectionKeys = selectedSources
      .map((source) => `${source.playerId}:${source.wordIndex}`)
      .sort();
    const matches = pendingSnatch.options?.some((option) => {
      const optionKeys = option.map((source) => `${source.playerId}:${source.wordIndex}`).sort();
      if (optionKeys.length !== selectionKeys.length) return false;
      return optionKeys.every((key, idx) => key === selectionKeys[idx]);
    });

    if (!matches) {
      console.log("[anagrams] pendingSnatch:confirm:noMatch", {
        selectionKeys,
      });
      setClaimError("Select a highlighted word to steal.");
      return;
    }

    const result = claimWord(state, playerId, pendingSnatch.word, selectedSources, dictionary);
    console.log("[anagrams] pendingSnatch:confirm:claimResult", result);
    if (!result.ok) {
      setClaimError(result.reason ?? "Word not allowed.");
      updateAnagramsGame(gameId, { pendingSnatch: null }).catch(() => {});
      return;
    }

    const targets = selectedSources
      .map((source) => ({
        playerId: source.playerId,
        word: state.players?.[source.playerId]?.words?.[source.wordIndex] ?? "",
      }))
      .filter((target) => target.word.length > 0);

    updateAnagramsGame(gameId, {
      ...result.state,
      pendingSnatch: null,
      lastSnatch: {
        at: Date.now(),
        byPlayerId: playerId,
        word: normalizeWord(pendingSnatch.word),
        targets,
      },
    }).catch(() => {});

    setClaimInput("");
    setSelectedSources([]);
    setSelectedPool(false);
    setClaimError(null);
  };

  const cancelPendingSnatch = () => {
    if (!pendingSnatch || !isChooser) return;
    updateAnagramsGame(gameId, { pendingSnatch: null }).catch(() => {});
    setSelectedSources([]);
    setClaimError(null);
    focusInput();
  };

  const handleReset = () => {
    if (pendingSnatch) return;
    const resetState = createSession();
    setState(resetState);
    setClaimInput("");
    setSelectedSources([]);
    setClaimError(null);
    updateAnagramsGame(gameId, resetState).catch(() => {});
    console.debug("[anagrams] reset", { gameId, resetState });
    focusInput();
  };

  const toggleSource = (source: WordSource) => {
    if (!source.playerId) return;
    if (pendingSnatch && !isChooser) return;
    const key = `${source.playerId}:${source.wordIndex}`;
    if (pendingSnatch && !candidateKeys.has(key)) return;
    if (pendingSnatch) {
      console.log("[anagrams] pendingSnatch:toggleSource", {
        gameId,
        playerId,
        key,
        selectedSources,
      });
    }
    setSelectedSources((current) => {
      if (pendingSnatch) {
        setSelectedPool(false);
        return [{ playerId: source.playerId, wordIndex: source.wordIndex }];
      }
      const exists = current.some(
        (item) => item.playerId === source.playerId && item.wordIndex === source.wordIndex,
      );
      if (exists) {
        return current.filter(
          (item) => !(item.playerId === source.playerId && item.wordIndex === source.wordIndex),
        );
      }
      return [...current, source];
    });
    setClaimError(null);
    focusInput();
  };

  const togglePoolChoice = () => {
    if (!pendingSnatch || !isChooser || !pendingSnatch.allowPool) return;
    setSelectedPool(true);
    setSelectedSources([]);
    setClaimError(null);
  };

  const renderPlayerCard = (slotIndex: number) => {
    const slot = playerSlots[slotIndex];
    const player = slot?.player;
    if (!player) return null;
    const wordCount = player?.words?.length ?? 0;
    const playerName = player?.name ?? `Player ${slotIndex + 1}`;
    return (
      <div className="anagrams-player-card" style={{ width: "100%", maxWidth: 360 }}>
        <div className="anagrams-player-header">
          <div className="anagrams-player-name">{playerName}</div>
          <div className="anagrams-meta">{wordCount} words</div>
        </div>
        <div className="anagrams-words">
          {(player?.words ?? []).length === 0 ? (
            null
          ) : (
            (player.words ?? []).map((word, wordIndex) => {
              const key = `${slot?.playerId ?? ""}:${wordIndex}`;
              const isCandidate = pendingSnatch ? candidateKeys.has(key) : false;
              const isSelected = selectedSources.some(
                (source) => source.playerId === slot?.playerId && source.wordIndex === wordIndex,
              );
              const canClick = (!pendingSnatch || isChooser) && (!pendingSnatch || isCandidate);
              return (
                <div
                  key={`${playerName}-${word}-${wordIndex}`}
                  className="anagrams-word"
                  style={{
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
                  }}
                  onClick={() =>
                    canClick &&
                    toggleSource({
                      playerId: slot?.playerId ?? "",
                      wordIndex,
                    })}
                >
                  {word.split("").map((letter, letterIndex) => (
                    <div key={`${word}-${letterIndex}`} style={tileStyle}>
                      {letter}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      className="anagrams-stage"
      onMouseDown={() => focusInput()}
      onTouchStart={() => focusInput()}
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
        .anagrams-face-down {
          background: repeating-linear-gradient(45deg, #8b7355, #8b7355 4px, #7a6246 4px, #7a6246 8px) !important;
          border: 2px solid #6f5a41 !important;
          box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.25), inset 0 -2px 3px rgba(0, 0, 0, 0.25) !important;
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
          animation: anagrams-flash 1.4s ease forwards;
        }
        @keyframes anagrams-flash {
          0% { opacity: 0; transform: scale(0.98); }
          20% { opacity: 1; transform: scale(1); }
          90% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 900px) {
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
              ? "Choose which word to take"
              : `Waiting for ${claimantName} to choose a word to take...`}
          </div>
        </div>
      ) : null}

      {snatchNotice ? <div className="anagrams-flash">{snatchNotice}</div> : null}

      <div className="anagrams-ring" ref={ringRef}>
        {playerSlots.map((slot, idx) => {
          const pos = slotPositions[idx];
          const style = useRingLayout && pos ? {
            position: "absolute" as const,
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`,
          } : undefined;
          return (
            <div
              key={slot.playerId ?? idx}
              className="anagrams-slot"
              style={style}
            >
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
            <button
              type="button"
              className="anagrams-button"
              onClick={handleDraw}
              disabled={!!pendingSnatch}
              style={{ opacity: pendingSnatch ? 0.6 : 1, cursor: pendingSnatch ? "not-allowed" : "pointer" }}
            >
              Flip a Tile
            </button>
            <div style={{ width: "100%", display: "grid", gap: 8 }}>
              <input
                ref={inputRef}
                value={claimInput}
                onChange={(event) => {
                  setClaimInput(event.target.value);
                  setClaimError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  console.log("[anagrams] input:enter", {
                    gameId,
                    playerId,
                    pendingSnatch: !!pendingSnatch,
                    isChooser,
                    claimInput,
                    selectedSources,
                    selectedPool,
                  });
                  if (pendingSnatch && isChooser) {
                    confirmPendingSnatch();
                    return;
                  }
                  handleClaim();
                }}
                onBlur={() => {
                  requestAnimationFrame(() => focusInput());
                }}
                placeholder="Type a word..."
                className="anagrams-input"
                disabled={!!pendingSnatch && !isChooser}
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
                  onClick={togglePoolChoice}
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
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    position: "relative",
                    zIndex: 25,
                  }}
                >
                  <button type="button" className="anagrams-button" onClick={confirmPendingSnatch}>
                    Confirm snatch (Enter)
                  </button>
                  <button
                    type="button"
                    className="anagrams-meta"
                    onClick={cancelPendingSnatch}
                    style={{
                      background: "transparent",
                      border: "none",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
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
                      {player.words.map((word, wordIndex) => {
                        const key = `${goneId}:${wordIndex}`;
                        const isCandidate = pendingSnatch ? candidateKeys.has(key) : false;
                        const isSelected = selectedSources.some(
                          (source) => source.playerId === goneId && source.wordIndex === wordIndex,
                        );
                        const canClick = (!pendingSnatch || isChooser) && (!pendingSnatch || isCandidate);
                        return (
                          <div
                            key={`${goneId}-${word}-${wordIndex}`}
                            className="anagrams-word"
                            style={{
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
                            }}
                            onClick={() =>
                              canClick &&
                              toggleSource({
                                playerId: goneId,
                                wordIndex,
                              })}
                          >
                            {word.split("").map((letter, letterIndex) => (
                              <div key={`${word}-${letterIndex}`} style={tileStyle}>
                                {letter}
                              </div>
                            ))}
                          </div>
                        );
                      })}
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

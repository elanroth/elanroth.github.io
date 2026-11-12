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

const sourceKey = (source: WordSource) => `${source.playerId}:${source.wordIndex}`;

export function AnagramsVisualizer({ choice, onLeave }: { choice: AnagramsLobbyChoice; onLeave?: () => void }) {
  const gameId = choice.gameId;
  const playerId = choice.playerId;
  const [state, setState] = useState<GameState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [lobbyName, setLobbyName] = useState(choice.lobbyName ?? "");
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
      if (snapshot.lobbyName) setLobbyName(snapshot.lobbyName);
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
    const thief = state.players?.[last.byPlayerId]?.name ?? "Someone";
    setSnatchNotice(`${thief} stole your word!`);
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

  const renderWord = (ownerId: string, word: string, wordIndex: number) => {
    const key = `${ownerId}:${wordIndex}`;
    const isCandidate = pendingSnatch ? candidateKeys.has(key) : false;
    const isSelected = selectedSources.some((source) => sourceKey(source) === key);
    const canClick = !pendingSnatch || (isChooser && isCandidate);
    const classes = ["ag-word"];
    if (isSelected) classes.push("is-selected");
    else if (isCandidate) classes.push("is-candidate");
    if (pendingSnatch && !isCandidate) classes.push("is-dimmed");
    return (
      <button
        type="button"
        key={`${ownerId}-${word}-${wordIndex}`}
        className={classes.join(" ")}
        disabled={!canClick}
        aria-pressed={isSelected}
        aria-label={`${word}${isSelected ? " (selected)" : ""}`}
        onClick={() => canClick && toggleSource({ playerId: ownerId, wordIndex })}
      >
        {word.split("").map((letter, letterIndex) => (
          <span key={`${word}-${letterIndex}`} className="ag-tile">
            {letter}
          </span>
        ))}
      </button>
    );
  };

  const renderPlayerCard = (slotIndex: number) => {
    const slot = playerSlots[slotIndex];
    if (!slot) return null;
    const { player } = slot;
    const isMe = slot.playerId === playerId;
    return (
      <div className={`ag-card ag-player${isMe ? " is-me" : ""}`}>
        <div className="ag-card-head">
          <h3>{player.name}</h3>
          {isMe && <span className="ag-chip">you</span>}
          <span className="ag-count">{player.score} pts</span>
        </div>
        <div className="ag-card-body ag-words">
          {player.words.length === 0 ? (
            <span className="ag-muted ag-italic">No words yet</span>
          ) : (
            player.words.map((word, wordIndex) => renderWord(slot.playerId, word, wordIndex))
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      className="ag-stage"
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input")) return;
        focusInput();
      }}
      style={{
        "--ui-scale": uiScale,
        "--tile-size": `${(tileSizeRem * uiScale).toFixed(2)}rem`,
        "--tile-font": `${(tileFontRem * uiScale).toFixed(2)}rem`,
      } as CSSProperties}
    >
      <style>{`
        html, body, #root { width: 100%; height: 100%; margin: 0; }
        .ag-stage {
          height: 100vh;
          width: 100%;
          padding: calc(16px * var(--ui-scale));
          overflow-y: auto;
          font-size: calc(16px * var(--ui-scale));
        }
        .ag-topbar {
          position: fixed;
          top: 14px;
          left: 18px;
          z-index: 15;
          display: grid;
          gap: 2px;
          max-width: 260px;
        }
        .ag-brand {
          font-family: var(--serif);
          font-weight: 800;
          font-size: 22px;
          color: var(--accent-dark);
          line-height: 1;
        }
        .ag-lobby-label { font-family: var(--mono); font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
        .ag-ring {
          position: relative;
          width: 100%;
          height: 100%;
          margin: 0;
        }
        .ag-slot {
          width: 100%;
          display: flex;
          justify-content: center;
          z-index: 5;
        }
        .ag-player { width: 100%; max-width: 360px; }
        .ag-player.is-me { box-shadow: 5px 5px 0 var(--accent-dark), 9px 11px 24px -8px var(--shadow-amb); }
        .ag-player.is-me .ag-card-head { background: var(--accent-hi); }
        .ag-center {
          width: 100%;
          display: grid;
          gap: calc(18px * var(--ui-scale));
          justify-items: center;
          z-index: 12;
        }
        .ag-pool { width: 100%; max-width: min(92vw, calc(460px * var(--ui-scale))); }
        .ag-pool-body { display: grid; gap: calc(12px * var(--ui-scale)); justify-items: center; }
        .ag-pool-tiles {
          display: flex;
          flex-wrap: wrap;
          gap: calc(0.3rem * var(--ui-scale));
          justify-content: center;
          min-height: calc(2rem * var(--ui-scale));
          align-items: center;
        }
        .ag-words { display: flex; flex-wrap: wrap; gap: calc(0.35rem * var(--ui-scale)); align-items: center; }
        .ag-word {
          display: inline-flex;
          flex-wrap: wrap;
          gap: calc(0.15rem * var(--ui-scale));
          padding: calc(4px * var(--ui-scale));
          border-radius: calc(10px * var(--ui-scale));
          border: 2px solid transparent;
          background: transparent;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s, opacity 0.12s;
        }
        .ag-word:hover:not(:disabled) { background: var(--accent-soft); }
        .ag-word:disabled { cursor: default; }
        .ag-word.is-candidate { border: 2px dashed var(--accent-warm); background: var(--accent-warm-soft); position: relative; z-index: 25; }
        .ag-word.is-selected { border: 2px solid var(--accent); background: var(--accent-soft); position: relative; z-index: 25; }
        .ag-word.is-dimmed { opacity: 0.3; }
        .ag-hint { font-family: var(--sans); font-size: 12px; color: var(--muted); text-align: center; }
        .ag-status { font-family: var(--sans); font-size: 13px; font-weight: 700; color: var(--accent-dark); text-align: center; }
        .ag-claim { width: 100%; display: grid; gap: 8px; }
        .ag-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; align-items: center; position: relative; z-index: 25; }
        .ag-choice { position: relative; z-index: 25; }
        /* Only waiting players get the dim; the chooser's non-options are already faded. */
        .ag-dim.is-chooser { background: transparent; pointer-events: none; }
        .ag-dim {
          position: fixed;
          inset: 0;
          background: rgba(41, 29, 95, 0.28);
          z-index: 20;
          display: grid;
          place-items: start center;
          padding-top: calc(24px * var(--ui-scale));
        }
        .ag-dim-message {
          background: #fff;
          color: var(--ink);
          border: 2px solid var(--ink);
          box-shadow: 4px 4px 0 var(--accent);
          padding: 10px 18px;
          border-radius: 999px;
          font-family: var(--sans);
          font-weight: 800;
          font-size: 14px;
        }
        .ag-flash {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: grid;
          place-items: center;
          pointer-events: none;
          background: rgba(194, 65, 12, 0.14);
          color: var(--accent-warm);
          font-family: var(--serif);
          font-style: italic;
          font-weight: 800;
          font-size: calc(2rem * var(--ui-scale));
          animation: ag-flash 1.5s ease forwards;
        }
        @keyframes ag-flash {
          0% { opacity: 0; transform: scale(0.98); }
          20% { opacity: 1; transform: scale(1); }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (max-width: 900px) {
          .ag-stage { height: auto; min-height: 100vh; }
          .ag-topbar { position: static; margin-bottom: 14px; max-width: none; }
          .ag-ring { display: flex; flex-direction: column; gap: 18px; height: auto; }
          .ag-slot, .ag-center { position: static !important; transform: none !important; }
          .ag-center { order: -1; }
        }
      `}</style>

      <div className="ag-topbar">
        <div className="ag-brand">Anagrams</div>
        {lobbyName && <div className="ag-lobby-label">{lobbyName}</div>}
        {onLeave && (
          <div>
            <button type="button" className="ag-btn ag-btn--link" style={{ paddingLeft: 0 }} onClick={onLeave}>
              ← Lobbies
            </button>
          </div>
        )}
      </div>

      {pendingSnatch ? (
        <div className={`ag-dim${isChooser ? " is-chooser" : ""}`}>
          <div className="ag-dim-message">
            {isChooser
              ? `Choose how to make ${pendingSnatch.word} · ${Math.ceil(pendingSecondsLeft)}s`
              : `${claimantName} is choosing how to make ${pendingSnatch.word}… ${Math.ceil(pendingSecondsLeft)}s`}
          </div>
        </div>
      ) : null}

      {snatchNotice ? <div className="ag-flash">{snatchNotice}</div> : null}

      <div className="ag-ring" ref={ringRef}>
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
            <div key={slot.playerId ?? idx} className="ag-slot" style={style}>
              {renderPlayerCard(idx)}
            </div>
          );
        })}

        <div
          className="ag-center"
          ref={centerRef}
          style={useRingLayout ? { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" } : undefined}
        >
          <div className="ag-card ag-pool">
            <div className="ag-card-head">
              <h2>The middle</h2>
              <span className="ag-count">{loaded ? `${state.bag.length} in bag` : "…"}</span>
            </div>
            <div className="ag-card-body ag-pool-body">
              <div className="ag-pool-tiles">
                {state.revealed.length === 0 ? (
                  <span className="ag-muted ag-italic">Nothing flipped yet</span>
                ) : (
                  state.revealed.map((tile, index) => (
                    <span key={`${tile}-${index}`} className="ag-tile">
                      {tile}
                    </span>
                  ))
                )}
              </div>

              {bagEmpty ? (
                <div className="ag-status">
                  Bag's empty.{leader && leader.score > 0 ? ` ${leader.name} leads with ${leader.score}.` : ""} Keep claiming from the middle, or start a new round.
                </div>
              ) : (
                <button
                  type="button"
                  className="ag-btn ag-btn--lg is-on"
                  onClick={handleDraw}
                  disabled={!!pendingSnatch || !loaded}
                >
                  Flip a tile
                </button>
              )}

              <div className="ag-claim">
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
                    // Keep typing flowing into the box, but don't fight other inputs (e.g. the reset confirm).
                    requestAnimationFrame(() => {
                      const active = document.activeElement;
                      if (!active || active === document.body) focusInput();
                    });
                  }}
                  placeholder="Type a word, press Enter"
                  className="ag-input"
                  style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Claim a word"
                  disabled={isWaiting}
                />
                {claimError ? <div className="ag-error" style={{ textAlign: "center" }} role="status">{claimError}</div> : null}
                {dictStatus !== "ready" ? (
                  <div className="ag-hint">{dictStatus === "loading" ? "Loading dictionary…" : "Dictionary failed to load."}</div>
                ) : null}
                {pendingSnatch && isChooser ? (
                  <>
                    <div className="ag-hint">Click a highlighted word{pendingSnatch.allowPool ? " or take it from the middle" : ""}, then confirm.</div>
                    <div className="ag-row">
                      {pendingSnatch.allowPool ? (
                        <button
                          type="button"
                          className={`ag-btn ag-choice${selectedPool ? " is-on" : ""}`}
                          onClick={takeFromMiddle}
                        >
                          Take from middle
                        </button>
                      ) : null}
                      <button type="button" className="ag-btn is-on" onClick={confirmPendingSnatch}>
                        Confirm (Enter)
                      </button>
                      <button type="button" className="ag-btn ag-btn--link" onClick={cancelPendingSnatch}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : !pendingSnatch ? (
                  <div className="ag-hint">
                    <span className="ag-mono">Space</span> flips · click words first to choose which to steal
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button type="button" className="ag-btn ag-btn--link" onClick={handleReset} disabled={!!pendingSnatch}>
                    New round
                  </button>
                </div>
              </div>
            </div>
          </div>

          {inactiveWithWords.length > 0 ? (
            <div className="ag-card ag-player">
              <div className="ag-card-head">
                <h3>Gone but not forgotten</h3>
              </div>
              <div className="ag-card-body" style={{ display: "grid", gap: 10 }}>
                {inactiveWithWords.map(({ playerId: goneId, player }) => (
                  <div key={`gone-${goneId}`}>
                    <div className="ag-hint" style={{ textAlign: "left", marginBottom: 4 }}>
                      {player.name} · {player.score} pts
                    </div>
                    <div className="ag-words">
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

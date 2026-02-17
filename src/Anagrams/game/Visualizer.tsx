import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  claimWord,
  createGame,
  drawTile,
  findSnatchSourceOptions,
  findSnatchSources,
  type GameState,
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

type PlayerPosition = "topLeft" | "topRight" | "right" | "bottomRight" | "bottomLeft" | "left";

function getActivePositions(count: number): PlayerPosition[] {
  if (count <= 0) return [];
  if (count === 1) return ["topLeft"];
  if (count === 2) return ["left", "right"];
  if (count === 3) return ["topLeft", "topRight", "bottomLeft"];
  if (count === 4) return ["topLeft", "topRight", "bottomLeft", "bottomRight"];
  if (count === 5) return ["topLeft", "topRight", "left", "right", "bottomLeft"];
  return ["topLeft", "topRight", "right", "bottomRight", "bottomLeft", "left"];
}

export function AnagramsVisualizer({ choice }: { choice: AnagramsLobbyChoice }) {
  const gameId = choice.gameId;
  const playerId = choice.playerId;
  const [state, setState] = useState<GameState>(() => createSession());
  const [uiScale, setUiScale] = useState(1);
  const [claimInput, setClaimInput] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<WordSource[]>([]);
  const [dictStatus, setDictStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const fullDictionaryRef = useRef<Set<string> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  const positionToPlayerIndex = useMemo(() => {
    const active = getActivePositions(displayCount);
    const map = new Map<PlayerPosition, number>();
    active.forEach((pos, idx) => map.set(pos, idx));
    return map;
  }, [displayCount]);

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
        focusInput();
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        handleDraw();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleClaim();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, claimInput]);

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
    const result = drawTile(state);
    setState(result.state);
    setClaimError(null);
    console.debug("[anagrams] draw", { gameId, result, revealed: result.state.revealed, bag: result.state.bag.length });
    updateAnagramsGame(gameId, result.state).catch(() => {});
    focusInput();
  };

  const handleClaim = () => {
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
      const options = findSnatchSourceOptions(state, normalizedInput, 2);
      if (options.ok && (options.options?.length ?? 0) > 1) {
        setClaimError("Multiple snatch sources possible. Select the word(s) to steal.");
        focusInput();
        return;
      }
      const auto = findSnatchSources(state, normalizedInput);
      sourcesToUse = auto.ok && auto.sources ? auto.sources : [];
      if (auto.ok && auto.sources) {
        console.debug("[anagrams] claim:autoSources", { auto });
      }
    }
    console.debug("[anagrams] claim:attempt", { gameId, input: normalizedInput, selectedSources: sourcesToUse });
    const result = claimWord(state, playerId, normalizedInput, sourcesToUse, dictionary);
    setState(result.state);
    console.debug("[anagrams] claim:result", result);
    updateAnagramsGame(gameId, result.state).catch(() => {});
    if (result.ok) {
      setClaimInput("");
      setSelectedSources([]);
      setClaimError(null);
    } else {
      setClaimError(result.reason ?? "Word not allowed.");
    }
    focusInput();
  };

  const handleReset = () => {
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
    setSelectedSources((current) => {
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

  const renderPlayerCard = (slotIndex: number) => {
    const slot = playerSlots[slotIndex];
    const player = slot?.player;
    if (!player) return null;
    const wordCount = player?.words?.length ?? 0;
    const playerName = player?.name ?? `Player ${slotIndex + 1}`;
    return (
      <div className="anagrams-card" style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ fontWeight: 800 }}>{playerName}</div>
          <div className="anagrams-meta">{wordCount} words</div>
        </div>
        <div className="anagrams-words">
          {(player?.words ?? []).length === 0 ? (
            null
          ) : (
            (player.words ?? []).map((word, wordIndex) => {
              const isSelected = selectedSources.some(
                (source) => source.playerId === slot?.playerId && source.wordIndex === wordIndex,
              );
              return (
                <div
                  key={`${playerName}-${word}-${wordIndex}`}
                  className="anagrams-word"
                  style={{
                    border: isSelected ? "2px solid #2563eb" : "1px solid rgba(15,23,42,0.12)",
                    background: isSelected ? "rgba(219,234,254,0.95)" : "rgba(255,255,255,0.85)",
                    cursor: "pointer",
                  }}
                  onClick={() =>
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
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
          grid-template-rows: auto auto auto;
          grid-template-areas:
            "top-left . top-right"
            "left center right"
            "bottom-left . bottom-right";
          gap: calc(18px * var(--ui-scale));
          width: 100%;
          height: 100%;
          margin: 0;
          align-items: center;
          justify-items: center;
        }
        .anagrams-slot {
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .anagrams-slot-top-left { grid-area: top-left; }
        .anagrams-slot-top-right { grid-area: top-right; }
        .anagrams-slot-right { grid-area: right; }
        .anagrams-slot-bottom-right { grid-area: bottom-right; }
        .anagrams-slot-bottom-left { grid-area: bottom-left; }
        .anagrams-slot-left { grid-area: left; }
        .anagrams-center {
          grid-area: center;
          width: 100%;
          display: grid;
          gap: calc(14px * var(--ui-scale));
          justify-items: center;
        }
        .anagrams-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: calc(18px * var(--ui-scale));
          padding: calc(12px * var(--ui-scale)) calc(14px * var(--ui-scale)) calc(14px * var(--ui-scale));
          box-shadow: 0 10px 24px rgba(17, 24, 39, 0.18);
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
          max-width: calc(360px * var(--ui-scale));
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
        @media (max-width: 900px) {
          .anagrams-ring {
            display: flex;
            flex-direction: column;
            height: auto;
          }
          .anagrams-slot,
          .anagrams-center {
            width: 100%;
          }
        }
      `}</style>

      <div className="anagrams-ring">
        {positionToPlayerIndex.has("topLeft") ? (
          <div className="anagrams-slot anagrams-slot-top-left">
            {renderPlayerCard(positionToPlayerIndex.get("topLeft")!)}
          </div>
        ) : null}
        {positionToPlayerIndex.has("topRight") ? (
          <div className="anagrams-slot anagrams-slot-top-right">
            {renderPlayerCard(positionToPlayerIndex.get("topRight")!)}
          </div>
        ) : null}
        {positionToPlayerIndex.has("right") ? (
          <div className="anagrams-slot anagrams-slot-right">
            {renderPlayerCard(positionToPlayerIndex.get("right")!)}
          </div>
        ) : null}
        {positionToPlayerIndex.has("bottomRight") ? (
          <div className="anagrams-slot anagrams-slot-bottom-right">
            {renderPlayerCard(positionToPlayerIndex.get("bottomRight")!)}
          </div>
        ) : null}
        {positionToPlayerIndex.has("bottomLeft") ? (
          <div className="anagrams-slot anagrams-slot-bottom-left">
            {renderPlayerCard(positionToPlayerIndex.get("bottomLeft")!)}
          </div>
        ) : null}
        {positionToPlayerIndex.has("left") ? (
          <div className="anagrams-slot anagrams-slot-left">
            {renderPlayerCard(positionToPlayerIndex.get("left")!)}
          </div>
        ) : null}

        <div className="anagrams-center">
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
            <button type="button" className="anagrams-button" onClick={handleDraw}>
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
                onBlur={() => {
                  requestAnimationFrame(() => focusInput());
                }}
                placeholder="Type a word..."
                className="anagrams-input"
              />
              {claimError ? <div className="anagrams-meta">{claimError}</div> : null}
              {dictStatus !== "ready" ? (
                <div className="anagrams-meta">
                  {dictStatus === "loading" ? "Loading dictionary..." : "Dictionary failed to load."}
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
                  cursor: "pointer",
                }}
              >
                Reset game
              </button>
            </div>
          </div>

          {inactiveWithWords.length > 0 ? (
            <div className="anagrams-card" style={{ width: "100%", maxWidth: 360 }}>
              <div className="anagrams-title">Gone but not Forgotten</div>
              <div className="anagrams-words">
                {inactiveWithWords.map(({ playerId: goneId, player }) => (
                  <div key={`gone-${goneId}`} style={{ width: "100%" }}>
                    <div className="anagrams-meta" style={{ marginBottom: 6 }}>
                      {player.name}
                    </div>
                    <div className="anagrams-words">
                      {player.words.map((word, wordIndex) => {
                        const isSelected = selectedSources.some(
                          (source) => source.playerId === goneId && source.wordIndex === wordIndex,
                        );
                        return (
                          <div
                            key={`${goneId}-${word}-${wordIndex}`}
                            className="anagrams-word"
                            style={{
                              border: isSelected ? "2px solid #2563eb" : "1px solid rgba(15,23,42,0.12)",
                              background: isSelected ? "rgba(219,234,254,0.95)" : "rgba(255,255,255,0.85)",
                              cursor: "pointer",
                            }}
                            onClick={() =>
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

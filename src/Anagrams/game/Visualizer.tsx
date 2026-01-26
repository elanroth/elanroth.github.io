import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { claimWord, createGame, drawTile, findSnatchSources, type GameState, type WordSource } from "../engine";
import { createAnagramsGame, subscribeAnagramsGame, updateAnagramsGame } from "../firebase/rtdb";

const defaultNames = ["Alice", "Bob", "Casey", "Dee"];

const createSession = (names: string[]) => createGame({ players: names });

const tileStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 8,
  background: "#fff5cc",
  boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.08)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  color: "#2b2b2b",
  fontSize: 20,
  letterSpacing: 1,
};

const boardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  display: "grid",
  gap: 8,
};

export function AnagramsVisualizer() {
  const gameId = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("game") ?? "local";
    } catch {
      return "local";
    }
  }, []);
  const [state, setState] = useState<GameState>(() => createSession(defaultNames.slice(0, 3)));
  const [claimInput, setClaimInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSources, setSelectedSources] = useState<WordSource[]>([]);
  const initializedRef = useRef(false);
  const revealed = state.revealed.join(" ") || "(none)";

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
    const unsubscribe = subscribeAnagramsGame(gameId, (snapshot) => {
      const playersArray = Array.isArray(snapshot.players) ? snapshot.players.filter(Boolean) : [];
      setState({
        bag: snapshot.bag ?? [],
        revealed: snapshot.revealed ?? [],
        players: playersArray.map((player) => ({
          name: player?.name ?? "Player",
          words: Array.isArray(player?.words) ? player.words : [],
          score: Array.isArray(player?.words) ? player.words.reduce((sum, w) => sum + w.length, 0) : 0,
        })),
        minWordLength: snapshot.minWordLength ?? 3,
      });

      if (!initializedRef.current && (!snapshot.players || snapshot.players.length === 0)) {
        initializedRef.current = true;
        createAnagramsGame(gameId, defaultNames.slice(0, 3)).catch(() => {});
      }
    });

    return () => unsubscribe();
  }, [gameId]);

  const handleDraw = () => {
    const result = drawTile(state);
    setState(result.state);
    console.debug("[anagrams] draw", { gameId, result, revealed: result.state.revealed, bag: result.state.bag.length });
    updateAnagramsGame(gameId, result.state).catch(() => {});
    focusInput();
  };

  const handleClaim = () => {
    if (!claimInput.trim()) {
      focusInput();
      return;
    }
    const normalizedInput = claimInput.trim();
    let sourcesToUse = selectedSources;
    if (sourcesToUse.length === 0) {
      const auto = findSnatchSources(state, normalizedInput);
      if (auto.ok && auto.sources) {
        sourcesToUse = auto.sources;
        console.debug("[anagrams] claim:autoSources", { auto });
      }
    }
    console.debug("[anagrams] claim:attempt", { gameId, input: normalizedInput, selectedSources: sourcesToUse });
    const result = claimWord(state, 0, normalizedInput, sourcesToUse);
    setState(result.state);
    console.debug("[anagrams] claim:result", result);
    updateAnagramsGame(gameId, result.state).catch(() => {});
    if (result.ok) {
      setClaimInput("");
      setSelectedSources([]);
    }
    focusInput();
  };

  const handleReset = () => {
    const resetState = createSession(defaultNames.slice(0, 3));
    setState(resetState);
    setClaimInput("");
    setSelectedSources([]);
    updateAnagramsGame(gameId, resetState).catch(() => {});
    console.debug("[anagrams] reset", { gameId, resetState });
    focusInput();
  };

  const toggleSource = (playerIndex: number, wordIndex: number) => {
    setSelectedSources((current) => {
      const exists = current.some((s) => s.playerIndex === playerIndex && s.wordIndex === wordIndex);
      if (exists) {
        const next = current.filter((s) => !(s.playerIndex === playerIndex && s.wordIndex === wordIndex));
        console.debug("[anagrams] source:toggle:remove", { playerIndex, wordIndex, next });
        return next;
      }
      const next = [...current, { playerIndex, wordIndex }];
      console.debug("[anagrams] source:toggle:add", { playerIndex, wordIndex, next });
      return next;
    });
  };

  return (
    <section
      style={{ display: "grid", gap: 16 }}
      onMouseDown={() => focusInput()}
      onTouchStart={() => focusInput()}
    >
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Tile Pool</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minHeight: 54 }}>
              {state.revealed.length === 0 ? (
                <div style={{ color: "#94a3b8", fontWeight: 600 }}>(none)</div>
              ) : (
                state.revealed.map((tile, index) => (
                  <div key={`${tile}-${index}`} style={tileStyle}>
                    {tile}
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                onClick={handleReset}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  fontWeight: 700,
                  textAlign: "left",
                }}
              >
                Reset game
              </button>
              <input
              ref={inputRef}
              value={claimInput}
              onChange={(event) => setClaimInput(event.target.value)}
              onBlur={() => {
                requestAnimationFrame(() => focusInput());
              }}
              placeholder="Type a word…"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontWeight: 600,
                background: "#ffffff",
              }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Words</div>
          <div style={{ display: "grid", gap: 12 }}>
            {state.players.map((player, playerIndex) => (
              <div key={`${player.name}-${playerIndex}`} style={boardStyle}>
                <div style={{ fontWeight: 700 }}>{player.name}</div>
                {(player?.words ?? []).length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>(no words)</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {(player.words ?? []).map((word, wordIndex) => (
                      <div
                        key={`${player.name}-${word}-${wordIndex}`}
                        onClick={() => toggleSource(playerIndex, wordIndex)}
                        style={{
                          padding: 8,
                          borderRadius: 10,
                          border: selectedSources.some(
                            (s) => s.playerIndex === playerIndex && s.wordIndex === wordIndex,
                          )
                            ? "2px solid #2563eb"
                            : "1px solid #e2e8f0",
                          background: selectedSources.some(
                            (s) => s.playerIndex === playerIndex && s.wordIndex === wordIndex,
                          )
                            ? "#eff6ff"
                            : "#ffffff",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          cursor: "pointer",
                        }}
                      >
                        {word.split("").map((letter, letterIndex) => (
                          <div key={`${word}-${letterIndex}`} style={{ ...tileStyle, width: 38, height: 38, fontSize: 16 }}>
                            {letter}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

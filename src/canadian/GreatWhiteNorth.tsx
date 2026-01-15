import { useEffect, useRef, useState } from "react";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LETTER_COUNT = 4;
type Mode = 10 | 30 | 60 | 120 | "chill" | null;

function isSubsequence(letters: string[], word: string) {
  let idx = 0;
  for (const ch of word.toUpperCase()) {
    if (ch === letters[idx]) idx += 1;
    if (idx === letters.length) return true;
  }
  return false;
}

function pickLettersFromWord(word: string, n: number): string[] {
  const indices: number[] = [];
  let prev = -1;
  for (let i = 0; i < n; i += 1) {
    // choose a position after the previous
    const remaining = n - i - 1;
    const minPos = prev + 1;
    const maxPos = word.length - remaining - 1;
    const range = Math.max(minPos, 0);
    const choice = Math.floor(range + Math.random() * (maxPos - range + 1));
    indices.push(choice);
    prev = choice;
  }
  return indices.map((i) => word[i]);
}

function generateSolvableLetters(n: number, words: string[]): string[] {
  const viable = words.filter((w) => w.length >= n);
  if (viable.length === 0) {
    // fallback: random letters
    return Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const w = viable[Math.floor(Math.random() * viable.length)];
    const letters = pickLettersFromWord(w, n);
    if (letters.length === n) return letters;
  }
  const w = viable[0];
  return pickLettersFromWord(w, n);
}

export function SEQNC() {
  const [letters, setLetters] = useState<string[]>([]);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [dictStatus, setDictStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mode, setMode] = useState<Mode>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState<number | "Go" | null>(null);
  const [roundSummary, setRoundSummary] = useState<string | null>(null);
  const [cheatWords, setCheatWords] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const modeOptions = [
    { id: 10 as const, label: "10 sec", seconds: 10 },
    { id: 30 as const, label: "30 sec", seconds: 30 },
    { id: 60 as const, label: "1 min", seconds: 60 },
    { id: 120 as const, label: "2 min", seconds: 120 },
    { id: "chill" as const, label: "Chill mode", seconds: null },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const url = new URL("./dictionary.txt", import.meta.url).toString();
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const txt = await resp.text();
        const parsed = txt
          .split(/\r?\n/)
          .map((l) => l.trim().toUpperCase())
          .filter(Boolean);
        if (!cancelled) {
          setWords(parsed);
          setDictStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setDictStatus("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dictStatus === "ready" && words.length > 0) {
      // wait for mode selection before showing letters
    }
  }, [dictStatus, words.length]);

  const hasMode = mode !== null;
  const isTimed = mode !== null && mode !== "chill";
  const timeUp = isTimed && remainingSeconds !== null && remainingSeconds <= 0;
  const isCountdownActive = countdown !== null;
  const canPlay = hasMode && (!isTimed || (!timeUp && !isCountdownActive));
  const timerLabel = formatTime(remainingSeconds);
  const currentModeLabel = modeOptions.find((m) => m.id === mode)?.label ?? "";

  function startMode(option: { id: Exclude<Mode, null>; seconds: number | null }) {
    setMode(option.id);
    setScore(0);
    setResult(null);
    setRoundSummary(null);
    setCheatWords(null);
    setGuess("");
    regen({ keepResult: false });
    if (option.seconds !== null) {
      setRemainingSeconds(option.seconds);
      setIsTimerRunning(false);
      setCountdown(3);
    } else {
      setRemainingSeconds(null);
      setIsTimerRunning(false);
      setCountdown(null);
    }
  }

  function endRound(message: string) {
    setRoundSummary(message);
    setMode(null);
    setRemainingSeconds(null);
    setIsTimerRunning(false);
    setCountdown(null);
    setLetters([]);
    setGuess("");
    setScore(0);
    setResult(null);
    setCheatWords(null);
  }

  function formatTime(sec: number | null) {
    if (sec === null) return "Chill";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  useEffect(() => {
    if (!isTimerRunning) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isTimerRunning]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === "Go") {
      const goId = window.setTimeout(() => {
        setCountdown(null);
        setIsTimerRunning(true);
      }, 700);
      return () => clearTimeout(goId);
    }
    const id = window.setTimeout(() => {
      setCountdown((prev) => {
        if (prev === null || prev === "Go") return prev;
        if (prev <= 1) return "Go";
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  useEffect(() => {
    if (isTimed && remainingSeconds === 0) {
      endRound(`Nice job—you got ${score} word${score === 1 ? "" : "s"}.`);
    }
  }, [isTimed, remainingSeconds, score]);

  useEffect(() => {
    if (canPlay && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canPlay]);

  useEffect(() => {
    function handleSpace(e: KeyboardEvent) {
      if (e.key === " " && !e.repeat) {
        if (hasMode) {
          e.preventDefault();
          regen();
          if (inputRef.current) inputRef.current.focus();
        }
      }
    }
    window.addEventListener("keydown", handleSpace);
    return () => window.removeEventListener("keydown", handleSpace);
  }, [hasMode]);

  function regen(opts?: { keepResult?: boolean }) {
    if (dictStatus === "ready" && words.length > 0) {
      setLetters(generateSolvableLetters(LETTER_COUNT, words));
    } else {
      setLetters(Array.from({ length: LETTER_COUNT }, () => alphabet[Math.floor(Math.random() * alphabet.length)]));
    }
    setGuess("");
    setCheatWords(null);
    if (!opts?.keepResult) setResult(null);
  }

  function checkGuess() {
    if (!hasMode) {
      setResult("Pick a mode to start");
      return;
    }
    if (timeUp) {
      setResult("Time's up!");
      return;
    }
    const word = guess.trim().toUpperCase();
    if (!word) {
      setResult("Type a word first");
      return;
    }
    if (dictStatus !== "ready") {
      setResult("Dictionary still loading");
      return;
    }
    const inDict = words.includes(word);
    if (!inDict) {
      setResult("Not in dictionary");
      return;
    }
    const ok = isSubsequence(letters, word);
    if (ok) {
      setScore((s) => s + 1);
      setResult("Nice job!");
      regen({ keepResult: true });
    } else {
      setResult("✖️ Those letters aren't in order");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 20% 20%, rgba(167,139,250,0.25), transparent 30%), radial-gradient(circle at 80% 30%, rgba(147,51,234,0.18), transparent 32%), linear-gradient(180deg,#f6f1ff 0%, #fdf7ff 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      position: "relative",
    }}>
      {hasMode && (
        <div style={{ position: "absolute", top: 10, left: 0, width: "100%", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ padding: "8px 16px", borderRadius: 16, background: "rgba(124,58,237,0.14)", color: "#4c1d95", fontWeight: 900, fontSize: 22, boxShadow: "0 12px 24px rgba(124,58,237,0.16)" }}>
            {isTimed ? `Time: ${timerLabel}` : "Chill mode"}
          </div>
        </div>
      )}

      {isCountdownActive && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", background: "rgba(76,29,149,0.25)", backdropFilter: "blur(2px)", zIndex: 2 }}>
          <div style={{ fontSize: 132, fontWeight: 1000, letterSpacing: 2, color: "#4c1d95", textShadow: "0 22px 44px rgba(124,58,237,0.45)" }}>
            {countdown}
          </div>
        </div>
      )}
      {roundSummary && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(76,29,149,0.18)", backdropFilter: "blur(3px)", zIndex: 3 }}>
          <div style={{ position: "relative", width: "min(640px, 92vw)", background: "white", borderRadius: 18, border: "1px solid #e9d5ff", boxShadow: "0 24px 60px rgba(109,40,217,0.22)", padding: "24px 28px", display: "grid", gap: 12 }}>
            <button
              type="button"
              onClick={() => setRoundSummary(null)}
              style={{ position: "absolute", top: 10, right: 10, border: "none", background: "transparent", color: "#4c1d95", fontWeight: 900, fontSize: 18, cursor: "pointer" }}
            >
              ×
            </button>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#4c1d95", textAlign: "center" }}>Time's up!</div>
            <div style={{ fontSize: 18, color: "#4c1d95", textAlign: "center", fontWeight: 700 }}>{roundSummary}</div>
          </div>
        </div>
      )}

      <div style={{
        width: "min(960px, 94vw)",
        background: "linear-gradient(180deg,#f5f3ff,#fdf4ff)",
        borderRadius: 18,
        border: "1px solid #e9d5ff",
        padding: 24,
        boxShadow: "0 16px 40px rgba(109,40,217,0.16)",
        display: "grid",
        gap: 18,
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#4c1d95" }}>SEQNC</div>
          <div style={{ color: "#6b21a8", fontSize: 15, marginTop: 4 }}>Find any word containing these letters in order (not necessarily adjacent).</div>
        </div>

        {!hasMode && (
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            <div style={{ fontWeight: 800, color: "#4c1d95" }}>Choose a mode</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {modeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => startMode(opt)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "1px solid #d8b4fe",
                    background: "#f8f5ff",
                    color: "#4c1d95",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 6px 16px rgba(124,58,237,0.12)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasMode && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", alignItems: "center", color: "#4c1d95", fontWeight: 800 }}>
            <span>Mode: {currentModeLabel}</span>
            <span>Words found: {score}</span>
            <button
              type="button"
              onClick={() => {
                endRound(`Ended early with ${score} word${score === 1 ? "" : "s"}.`);
              }}
              style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #c084fc", background: "white", color: "#4c1d95", fontWeight: 700, cursor: "pointer" }}
            >
              End now
            </button>
            {mode === "chill" && (
              <button
                type="button"
                onClick={() => {
                  if (dictStatus !== "ready" || letters.length === 0) return;
                  const matches = words.filter((w) => isSubsequence(letters, w));
                  setCheatWords(matches.slice(0, 80));
                }}
                style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #c084fc", background: "#ede9fe", color: "#4c1d95", fontWeight: 700, cursor: "pointer" }}
              >
                Show answers (Chill)
              </button>
            )}
          </div>
        )}

        {hasMode && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {letters.map((l, idx) => (
                <div key={`${l}-${idx}`} style={{
                  width: 86,
                  height: 100,
                  borderRadius: 16,
                  background: "linear-gradient(180deg,#ede9fe,#c084fc)",
                  color: "#2e1065",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 42,
                  boxShadow: "0 16px 28px rgba(124,58,237,0.25)",
                }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMode && (
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            <input
              ref={inputRef}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); checkGuess(); } }}
              placeholder="Enter a word"
              disabled={!canPlay}
              style={{ width: "min(720px, 100%)", padding: "14px 16px", borderRadius: 14, border: "1px solid #c084fc", boxShadow: "0 8px 18px rgba(124,58,237,0.22)", background: !canPlay ? "#f3e8ff" : "white", color: "#2e1065" }}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                onClick={checkGuess}
                disabled={!canPlay}
                style={{ padding: "14px 18px", borderRadius: 14, border: "none", background: "#7c3aed", color: "white", fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 22px rgba(124,58,237,0.28)", opacity: !canPlay ? 0.6 : 1 }}
              >
                Check (Enter)
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  regen();
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
                style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid #c084fc", background: "#ede9fe", color: "#4c1d95", fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 22px rgba(124,58,237,0.18)" }}
              >
                New letters (Space)
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "#6b21a8", textAlign: "center" }}>
          {dictStatus === "loading" && "Loading dictionary..."}
          {dictStatus === "error" && "Dictionary failed to load."}
          {/* {dictStatus === "ready" && `${words.length} words loaded.`} */}
        </div>

        {result && (
          <div style={{ fontWeight: 900, color: result.startsWith("Nice") ? "#16a34a" : "#b3261e", fontSize: 18, textAlign: "center" }}>{result}</div>
        )}

        {cheatWords && cheatWords.length > 0 && (
          <div style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: 14, border: "1px solid #e9d5ff", background: "#f8f5ff" }}>
            <div style={{ fontWeight: 800, color: "#4c1d95", textAlign: "center" }}>Possible answers ({cheatWords.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", color: "#4c1d95" }}>
              {cheatWords.map((w) => (
                <span key={w} style={{ padding: "4px 8px", borderRadius: 10, background: "white", border: "1px solid #e9d5ff", fontWeight: 700 }}>
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {roundSummary && (
          <div style={{ textAlign: "center", fontWeight: 800, color: "#4c1d95", fontSize: 18 }}>
            {roundSummary}
            <div style={{ marginTop: 6, fontSize: 14, color: "#6b21a8" }}>Pick a mode to start a new round.</div>
          </div>
        )}

      </div>
    </div>
  );
}

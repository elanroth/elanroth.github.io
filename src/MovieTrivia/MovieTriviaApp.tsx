import React, { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../Banagrams/engine/firebase/firebase";
import { ref, push, onValue, query, orderByChild } from "firebase/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  name: string;
  score: number;
  date: number; // epoch ms
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NAME_KEY = "movieTrivia_playerName";
const LEADERBOARD_PATH = "movieTrivia/leaderboard";
const MEDALS = ["🥇", "🥈", "🥉"];

function pbKey(name: string) { return `movieTrivia_pb_${name.toLowerCase().trim()}`; }
function getLocalPB(name: string): number { return parseInt(localStorage.getItem(pbKey(name)) ?? "0", 10) || 0; }
function setLocalPB(name: string, score: number) { localStorage.setItem(pbKey(name), String(score)); }

function saveScore(name: string, score: number) {
  const entry: LeaderboardEntry = { name, score, date: Date.now() };
  return push(ref(db, LEADERBOARD_PATH), entry);
}

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── API Types ───────────────────────────────────────────────────────────────

interface OTDBResponse {
  response_code: number;
  results: OTDBQuestion[];
}

interface OTDBQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

interface Question {
  question: string;
  choices: string[];
  correct: string;
  difficulty: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decode(s: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = s;
  return txt.value;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "#22c55e",
  medium: "#f59e0b",
  hard: "#ef4444",
};

const CHOICE_LETTERS = ["A", "B", "C", "D"];
const CONFETTI_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#fff"];

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti({ active }: { active: boolean }) {
  const pieces = useRef(
    Array.from({ length: 60 }, (_, i) => ({
      delay: Math.random() * 0.6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      x: Math.random() * 100,
    }))
  );

  if (!active) return null;
  return (
    <>
      {pieces.current.map((p, i) => (
        <div
          key={i}
          style={{
            position: "fixed", left: `${p.x}%`, top: "-20px",
            width: 10, height: 10, background: p.color, borderRadius: "2px",
            animation: `confettiFall 1.4s ease-in ${p.delay}s forwards`,
            zIndex: 9999, pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

// ─── Leaderboard Screen ───────────────────────────────────────────────────────

function LeaderboardScreen({
  highlightName,
  highlightScore,
  highlightIsNewPB,
  onBack,
  onPlay,
}: {
  highlightName?: string;
  highlightScore?: number;
  highlightIsNewPB?: boolean;
  onBack: () => void;
  onPlay: () => void;
}) {
  const [entries, setEntries] = useState<(LeaderboardEntry & { key: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(ref(db, LEADERBOARD_PATH), orderByChild("score"));
    const unsub = onValue(q, (snap) => {
      const raw: (LeaderboardEntry & { key: string })[] = [];
      snap.forEach((child) => {
        raw.push({ key: child.key!, ...(child.val() as LeaderboardEntry) });
      });
      // Deduplicate: one entry per name, keeping their best score
      const bestByName = new Map<string, LeaderboardEntry & { key: string }>();
      for (const e of raw) {
        const existing = bestByName.get(e.name);
        if (!existing || e.score > existing.score || (e.score === existing.score && e.date > existing.date)) {
          bestByName.set(e.name, e);
        }
      }
      const deduped = Array.from(bestByName.values()).sort((a, b) => b.score - a.score || b.date - a.date);
      setEntries(deduped.slice(0, 15));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <div style={styles.centered}>
      <div style={{ ...styles.card, maxWidth: 520 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={onBack} style={styles.ghostBtn}>←</button>
          <span style={{ fontSize: 24 }}>🏆</span>
          <h2 style={{ ...styles.title, fontSize: 22, margin: 0 }}>Leaderboard</h2>
        </div>

        {highlightScore !== undefined && (
          <div style={{
            background: "linear-gradient(135deg, #f59e0b18, #ef444418)",
            border: "1px solid #f59e0b55",
            borderRadius: 10, padding: "10px 14px", marginBottom: 16,
            fontSize: 14, color: "#fcd34d", fontWeight: 700,
          }}>
            {highlightScore === 0
              ? `${highlightName} — tough one! (0 correct)`
              : highlightIsNewPB
              ? `✨ New personal best for ${highlightName}: ${highlightScore}! 🎉`
              : `${highlightName} just scored ${highlightScore}! 🎉`}
          </div>
        )}

        {loading ? (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: 24 }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: 24 }}>No scores yet. Be the first!</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            {entries.map((e, i) => {
              const isNew =
                highlightName === e.name &&
                highlightScore === e.score &&
                Date.now() - e.date < 15_000;
              return (
                <div key={e.key} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10,
                  background: isNew ? "#f59e0b14" : "#0f172a",
                  border: `1px solid ${isNew ? "#f59e0b55" : "#1e293b"}`,
                }}>
                  <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>
                    {i < 3 ? MEDALS[i] : <span style={{ color: "#475569", fontSize: 13 }}>#{i + 1}</span>}
                  </span>
                  <span style={{ flex: 1, color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{e.name}</span>
                  <span style={{ fontWeight: 900, fontSize: 18, color: "#f59e0b" }}>{e.score}</span>
                  <span style={{ color: "#475569", fontSize: 12, flexShrink: 0 }}>{formatDate(e.date)}</span>
                </div>
              );
            })}
          </div>
        )}

        <button style={styles.primaryBtn} onClick={onPlay}>Play Again</button>
      </div>
    </div>
  );
}

// ─── Name Entry Screen ────────────────────────────────────────────────────────

function NameScreen({ onConfirm }: { onConfirm: (name: string) => void }) {
  const saved = localStorage.getItem(NAME_KEY) ?? "";
  const [name, setName] = useState(saved);
  const inputRef = useRef<HTMLInputElement>(null);
  const pb = saved ? getLocalPB(saved) : 0;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(NAME_KEY, trimmed);
    onConfirm(trimmed);
  }

  return (
    <div style={styles.centered}>
      <form onSubmit={handleSubmit} style={{ ...styles.card, width: "100%", maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
        <h2 style={{ ...styles.title, fontSize: 26, marginBottom: 6 }}>What's your name?</h2>
        {saved && pb > 0 ? (
          <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: 14 }}>
            Welcome back, <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{saved}</span>!
            Your personal best is{" "}
            <span style={{ color: "#f59e0b", fontWeight: 800 }}>{pb}</span>.
          </p>
        ) : (
          <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: 14 }}>
            {saved ? "Welcome back! Change your name or just hit Play." : "Your name will appear on the leaderboard."}
          </p>
        )}
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name…"
          maxLength={24}
          style={styles.input}
        />
        <button type="submit" disabled={!name.trim()}
          style={{ ...styles.primaryBtn, width: "100%", opacity: name.trim() ? 1 : 0.5 }}>
          Let's Play →
        </button>
      </form>
    </div>
  );
}

// ─── Screen: Splash ───────────────────────────────────────────────────────────

function SplashScreen({ onStart, onLeaderboard }: { onStart: () => void; onLeaderboard: () => void }) {
  return (
    <div style={styles.centered}>
      <div style={styles.card}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🎬</div>
        <h1 style={styles.title}>Movie Trivia</h1>
        <p style={{ color: "#94a3b8", marginBottom: 28, lineHeight: 1.6 }}>
          Answer questions fetched live from the Open Trivia Database.
          <br />
          The game ends when you get one wrong.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={styles.primaryBtn} onClick={onStart}>Play</button>
          <button style={styles.secondaryBtn} onClick={onLeaderboard}>🏆 Leaderboard</button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen: Loading ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={styles.centered}>
      <div style={{ fontSize: 48, animation: "spin 1s linear infinite" }}>🎞️</div>
      <p style={{ color: "#94a3b8", marginTop: 16 }}>Loading question…</p>
    </div>
  );
}

// ─── Screen: Error ────────────────────────────────────────────────────────────

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={styles.centered}>
      <div style={styles.card}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😵</div>
        <p style={{ color: "#ef4444", marginBottom: 20 }}>{message}</p>
        <button style={styles.primaryBtn} onClick={onRetry}>
          Try Again
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Game Over ────────────────────────────────────────────────────────

function GameOverScreen({
  score,
  isNewPB,
  prevPB,
  wrongQuestion,
  wrongChosen,
  wrongCorrect,
  onViewLeaderboard,
}: {
  score: number;
  isNewPB: boolean;
  prevPB: number;
  wrongQuestion: string;
  wrongChosen: string;
  wrongCorrect: string;
  onViewLeaderboard: () => void;
}) {
  const emoji = isNewPB ? "✨" : score >= 10 ? "🏆" : score >= 5 ? "🥈" : score >= 2 ? "🥉" : "😅";

  return (
    <div style={styles.centered}>
      <div style={{ ...styles.card, maxWidth: 520 }}>
        <div style={{ fontSize: 60, marginBottom: 8 }}>{emoji}</div>
        <h2 style={{ ...styles.title, fontSize: 28, marginBottom: 4 }}>
          {isNewPB ? "New Personal Best!" : "Game Over"}
        </h2>
        {isNewPB && prevPB > 0 && (
          <p style={{ color: "#f59e0b", fontWeight: 700, marginBottom: 4, fontSize: 14 }}>
            Beat your old best of {prevPB} 📈
          </p>
        )}
        <p style={{ color: "#94a3b8", marginBottom: 20 }}>
          You answered <span style={{ color: "#f59e0b", fontWeight: 800 }}>{score}</span> question{score !== 1 ? "s" : ""} correctly.
        </p>

        <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>The question you got wrong:</p>
          <p style={{ color: "#e2e8f0", marginBottom: 12, lineHeight: 1.5 }}>{wrongQuestion}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ padding: "4px 10px", borderRadius: 999, background: "#ef444422", color: "#ef4444", fontSize: 13 }}>
              Your answer: {wrongChosen}
            </span>
            <span style={{ padding: "4px 10px", borderRadius: 999, background: "#22c55e22", color: "#22c55e", fontSize: 13 }}>
              Correct: {wrongCorrect}
            </span>
          </div>
        </div>

        <button style={styles.primaryBtn} onClick={onViewLeaderboard}>
          🏆 View Leaderboard
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Question ────────────────────────────────────────────────────────

function QuestionScreen({
  question,
  score,
  playerName,
  onAnswer,
}: {
  question: Question;
  score: number;
  playerName: string;
  onAnswer: (choice: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when question changes
  useEffect(() => {
    setChosen(null);
    setRevealed(false);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [question]);

  function handleChoose(choice: string) {
    if (revealed) return;
    setChosen(choice);
    setRevealed(true);
    timeoutRef.current = setTimeout(() => onAnswer(choice), 1200);
  }

  function choiceBackground(choice: string): string {
    if (!revealed) return "#1e293b";
    if (choice === question.correct) return "#15803d";
    if (choice === chosen) return "#991b1b";
    return "#1e293b";
  }

  function choiceBorder(choice: string): string {
    if (!revealed) return "#334155";
    if (choice === question.correct) return "#22c55e";
    if (choice === chosen) return "#ef4444";
    return "#334155";
  }

  return (
    <div style={styles.centered}>
      <div style={{ ...styles.card, maxWidth: 600 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 22 }}>🎬</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#94a3b8" }}>{playerName}</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                background: DIFFICULTY_COLOR[question.difficulty] + "22",
                color: DIFFICULTY_COLOR[question.difficulty],
                fontSize: 12,
                fontWeight: 700,
                textTransform: "capitalize",
              }}
            >
              {question.difficulty}
            </span>
            <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 18 }}>
              {score} ✓
            </span>
          </div>
        </div>

        {/* Question */}
        <p style={{ color: "#e2e8f0", fontSize: 18, lineHeight: 1.6, marginBottom: 24, fontWeight: 600 }}>
          {question.question}
        </p>

        {/* Choices */}
        <div style={{ display: "grid", gap: 10 }}>
          {question.choices.map((choice, i) => (
            <button
              key={choice}
              onClick={() => handleChoose(choice)}
              disabled={revealed}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 10,
                border: `2px solid ${choiceBorder(choice)}`,
                background: choiceBackground(choice),
                color: "#e2e8f0",
                cursor: revealed ? "default" : "pointer",
                textAlign: "left",
                fontWeight: 600,
                fontSize: 15,
                transition: "all 0.25s ease",
                transform: revealed && choice === question.correct ? "scale(1.02)" : "scale(1)",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "#334155",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 13,
                  flexShrink: 0,
                  color: "#94a3b8",
                }}
              >
                {CHOICE_LETTERS[i]}
              </span>
              {choice}
              {revealed && choice === question.correct && <span style={{ marginLeft: "auto" }}>✓</span>}
              {revealed && choice === chosen && choice !== question.correct && (
                <span style={{ marginLeft: "auto" }}>✗</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

type Phase = "splash" | "name" | "loading" | "question" | "error" | "gameover" | "leaderboard";

export function MovieTriviaApp() {
  const [phase, setPhase] = useState<Phase>("splash");
  const [playerName, setPlayerName] = useState<string>(localStorage.getItem(NAME_KEY) ?? "");
  const [question, setQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [wrongQuestion, setWrongQuestion] = useState("");
  const [wrongChosen, setWrongChosen] = useState("");
  const [wrongCorrect, setWrongCorrect] = useState("");
  // Score saved this round, used to highlight on leaderboard
  const [savedScore, setSavedScore] = useState<number | undefined>(undefined);
  const [isNewPB, setIsNewPB] = useState(false);
  const [prevPB, setPrevPB] = useState(0);

  const tokenRef = useRef<string | null>(null);

  async function fetchToken(): Promise<string> {
    const res = await fetch("https://opentdb.com/api_token.php?command=request");
    const data = await res.json();
    return data.token as string;
  }

  const fetchQuestion = useCallback(async () => {
    setPhase("loading");
    try {
      if (!tokenRef.current) tokenRef.current = await fetchToken();
      const url = `https://opentdb.com/api.php?amount=1&category=11&type=multiple&token=${tokenRef.current}`;
      const res = await fetch(url);
      const data: OTDBResponse = await res.json();
      if (data.response_code === 4) {
        tokenRef.current = await fetchToken();
        return fetchQuestion();
      }
      if (data.response_code !== 0 || !data.results.length) {
        setError("Could not load a question. The API might be rate-limiting. Try again in a moment.");
        setPhase("error");
        return;
      }
      const raw = data.results[0];
      const correct = decode(raw.correct_answer);
      const choices = shuffle([correct, ...raw.incorrect_answers.map(decode)]);
      setQuestion({ question: decode(raw.question), choices, correct, difficulty: raw.difficulty });
      setPhase("question");
    } catch {
      setError("Network error. Check your connection and try again.");
      setPhase("error");
    }
  }, []);

  function handleAnswer(choice: string) {
    if (!question) return;
    if (choice === question.correct) {
      setScore((s) => s + 1);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1600);
      fetchQuestion();
    } else {
      setWrongQuestion(question.question);
      setWrongChosen(choice);
      setWrongCorrect(question.correct);
      const old = getLocalPB(playerName);
      const newPB = score > old;
      if (newPB) setLocalPB(playerName, score);
      setIsNewPB(newPB);
      setPrevPB(old);
      if (score > 0) saveScore(playerName, score).catch(console.error);
      setSavedScore(score);
      setPhase("gameover");
    }
  }

  function handleNameConfirm(name: string) {
    setPlayerName(name);
    setScore(0);
    setQuestion(null);
    setSavedScore(undefined);
    tokenRef.current = null;
    fetchQuestion();
  }

  function startPlay() {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) {
      setPlayerName(saved);
      setScore(0);
      setQuestion(null);
      setSavedScore(undefined);
      tokenRef.current = null;
      fetchQuestion();
    } else {
      setPhase("name");
    }
  }

  return (
    <div style={styles.root}>
      <Confetti active={showConfetti} />
      {phase === "splash" && (
        <SplashScreen onStart={startPlay} onLeaderboard={() => setPhase("leaderboard")} />
      )}
      {phase === "name" && <NameScreen onConfirm={handleNameConfirm} />}
      {phase === "loading" && <LoadingScreen />}
      {phase === "error" && <ErrorScreen message={error} onRetry={fetchQuestion} />}
      {phase === "question" && question && (
        <QuestionScreen question={question} score={score} playerName={playerName} onAnswer={handleAnswer} />
      )}
      {phase === "gameover" && (
        <GameOverScreen
          score={score}
          isNewPB={isNewPB}
          prevPB={prevPB}
          wrongQuestion={wrongQuestion}
          wrongChosen={wrongChosen}
          wrongCorrect={wrongCorrect}
          onViewLeaderboard={() => setPhase("leaderboard")}
        />
      )}
      {phase === "leaderboard" && (
        <LeaderboardScreen
          highlightName={savedScore !== undefined ? playerName : undefined}
          highlightScore={savedScore}
          highlightIsNewPB={isNewPB}
          onBack={() => setPhase("splash")}
          onPlay={() => setPhase("name")}
        />
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  centered: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    minHeight: "100vh",
  },
  card: {
    background: "#1e293b",
    borderRadius: 20,
    padding: "32px 28px",
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
    border: "1px solid #334155",
    textAlign: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: 900,
    color: "#f1f5f9",
    marginBottom: 12,
    letterSpacing: "-0.02em",
  },
  primaryBtn: {
    padding: "12px 32px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #f59e0b, #ef4444)",
    color: "white",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(239,68,68,0.4)",
  },
  secondaryBtn: {
    padding: "12px 24px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#94a3b8",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "transparent",
    color: "#94a3b8",
    fontWeight: 700,
    fontSize: 18,
    cursor: "pointer",
    lineHeight: 1,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "2px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 16,
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
  },
};

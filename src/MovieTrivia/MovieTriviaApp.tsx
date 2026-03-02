import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Confetti ─────────────────────────────────────────────────────────────────

function ConfettiPiece({ delay, color, x }: { delay: number; color: string; x: number }) {
  const style: React.CSSProperties = {
    position: "fixed",
    left: `${x}%`,
    top: "-20px",
    width: 10,
    height: 10,
    background: color,
    borderRadius: "2px",
    animation: `confettiFall 1.4s ease-in ${delay}s forwards`,
    zIndex: 9999,
    pointerEvents: "none",
  };
  return <div style={style} />;
}

const CONFETTI_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#fff"];

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
        <ConfettiPiece key={i} delay={p.delay} color={p.color} x={p.x} />
      ))}
    </>
  );
}

// ─── Screen: Splash ───────────────────────────────────────────────────────────

function SplashScreen({ onStart }: { onStart: () => void }) {
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
        <button style={styles.primaryBtn} onClick={onStart}>
          Start Game
        </button>
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
  wrongQuestion,
  wrongChosen,
  wrongCorrect,
  onRestart,
}: {
  score: number;
  wrongQuestion: string;
  wrongChosen: string;
  wrongCorrect: string;
  onRestart: () => void;
}) {
  const emoji = score >= 10 ? "🏆" : score >= 5 ? "🥈" : score >= 2 ? "🥉" : "😅";

  return (
    <div style={styles.centered}>
      <div style={{ ...styles.card, maxWidth: 520 }}>
        <div style={{ fontSize: 60, marginBottom: 8 }}>{emoji}</div>
        <h2 style={{ ...styles.title, fontSize: 28, marginBottom: 4 }}>Game Over</h2>
        <p style={{ color: "#94a3b8", marginBottom: 20 }}>
          You answered <span style={{ color: "#f59e0b", fontWeight: 800 }}>{score}</span> question{score !== 1 ? "s" : ""} correctly.
        </p>

        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
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

        <button style={styles.primaryBtn} onClick={onRestart}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Question ────────────────────────────────────────────────────────

function QuestionScreen({
  question,
  score,
  onAnswer,
}: {
  question: Question;
  score: number;
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
            <span style={{ fontWeight: 800, fontSize: 16, color: "#e2e8f0" }}>Movie Trivia</span>
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

type Phase = "splash" | "loading" | "question" | "error" | "gameover";

export function MovieTriviaApp() {
  const [phase, setPhase] = useState<Phase>("splash");
  const [question, setQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);

  // Game‑over state
  const [wrongQuestion, setWrongQuestion] = useState("");
  const [wrongChosen, setWrongChosen] = useState("");
  const [wrongCorrect, setWrongCorrect] = useState("");

  // We keep a token to avoid duplicate questions within one session.
  const tokenRef = useRef<string | null>(null);

  // ── Fetch a session token (reduces repeats from the API) ──────────────────
  async function fetchToken(): Promise<string> {
    const res = await fetch("https://opentdb.com/api_token.php?command=request");
    const data = await res.json();
    return data.token as string;
  }

  // ── Fetch one question ────────────────────────────────────────────────────
  const fetchQuestion = useCallback(async () => {
    setPhase("loading");
    try {
      if (!tokenRef.current) {
        tokenRef.current = await fetchToken();
      }
      const url = `https://opentdb.com/api.php?amount=1&category=11&type=multiple&token=${tokenRef.current}`;
      const res = await fetch(url);
      const data: OTDBResponse = await res.json();

      if (data.response_code === 4) {
        // Token exhausted – reset and retry
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

      setQuestion({
        question: decode(raw.question),
        choices,
        correct,
        difficulty: raw.difficulty,
      });
      setPhase("question");
    } catch {
      setError("Network error. Check your connection and try again.");
      setPhase("error");
    }
  }, []);

  // ── Handle an answer ──────────────────────────────────────────────────────
  function handleAnswer(choice: string) {
    if (!question) return;
    if (choice === question.correct) {
      const newScore = score + 1;
      setScore(newScore);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1600);
      fetchQuestion();
    } else {
      setWrongQuestion(question.question);
      setWrongChosen(choice);
      setWrongCorrect(question.correct);
      setPhase("gameover");
    }
  }

  // ── Restart ───────────────────────────────────────────────────────────────
  function handleRestart() {
    setScore(0);
    setQuestion(null);
    tokenRef.current = null;
    fetchQuestion();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      <Confetti active={showConfetti} />
      {phase === "splash" && <SplashScreen onStart={fetchQuestion} />}
      {phase === "loading" && <LoadingScreen />}
      {phase === "error" && <ErrorScreen message={error} onRetry={fetchQuestion} />}
      {phase === "question" && question && (
        <QuestionScreen question={question} score={score} onAnswer={handleAnswer} />
      )}
      {phase === "gameover" && (
        <GameOverScreen
          score={score}
          wrongQuestion={wrongQuestion}
          wrongChosen={wrongChosen}
          wrongCorrect={wrongCorrect}
          onRestart={handleRestart}
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
    transition: "transform 0.1s ease",
  },
};

import { useMemo, useState } from "react";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function randomLetters(n: number) {
  return Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]);
}

function isSubsequence(letters: string[], word: string) {
  let idx = 0;
  for (const ch of word.toUpperCase()) {
    if (ch === letters[idx]) idx += 1;
    if (idx === letters.length) return true;
  }
  return false;
}

export function LetterTrail() {
  const [count, setCount] = useState(4);
  const [letters, setLetters] = useState<string[]>(() => randomLetters(4));
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const prompt = useMemo(() => letters.join("  "), [letters]);

  function regen(n = count) {
    const capped = Math.max(2, Math.min(8, n));
    setCount(capped);
    setLetters(randomLetters(capped));
    setGuess("");
    setResult(null);
  }

  function checkGuess() {
    const word = guess.trim();
    if (!word) {
      setResult("Type a word first");
      return;
    }
    const ok = isSubsequence(letters, word);
    setResult(ok ? "✔️ Valid ordering" : "✖️ Those letters aren't in order");
  }

  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.04)", display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Letter Trail</div>
        <div style={{ color: "#4b5563", fontSize: 14 }}>Find any word containing these letters in order (not necessarily adjacent).</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 4 }}>{prompt}</div>
        <button
          type="button"
          onClick={() => regen(count)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f3f4f6", fontWeight: 700, cursor: "pointer" }}
        >
          New letters
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontWeight: 700, fontSize: 13 }}>Length</label>
          <input
            type="number"
            min={2}
            max={8}
            value={count}
            onChange={(e) => regen(Number(e.target.value))}
            style={{ width: 64, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Enter a word"
          style={{ flex: "1 1 240px", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <button
          type="button"
          onClick={checkGuess}
          style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" }}
        >
          Check
        </button>
      </div>

      {result && (
        <div style={{ fontWeight: 800, color: result.startsWith("✔") ? "#16a34a" : "#b3261e" }}>{result}</div>
      )}

      <div style={{ color: "#6b7280", fontSize: 13 }}>
        Tip: any word works as long as the letters appear in this order, even if other letters are in between.
      </div>
    </div>
  );
}

import { useState } from "react";
import { AnagramsVisualizer } from "./game";
import { AnagramsLobbyGate, type AnagramsLobbyChoice } from "./LobbyGate";

/** The full-screen Anagrams page (?tab=anagrams&full=1): lobby, then the table. */
export function AnagramsPage() {
  const [choice, setChoice] = useState<AnagramsLobbyChoice | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", color: "#111827", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {choice ? <AnagramsVisualizer choice={choice} /> : <AnagramsLobbyGate onEnter={setChoice} />}
    </div>
  );
}

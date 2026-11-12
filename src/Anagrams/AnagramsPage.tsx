import { useState } from "react";
import { AnagramsVisualizer } from "./game";
import { AnagramsLobbyGate, type AnagramsLobbyChoice } from "./LobbyGate";
import { ANAGRAMS_FONTS_HREF, ANAGRAMS_THEME_CSS } from "./theme";

/** The full-screen Anagrams page (?tab=anagrams&full=1): lobby, then the table. */
export function AnagramsPage() {
  const [choice, setChoice] = useState<AnagramsLobbyChoice | null>(null);

  return (
    <div className="anagrams-theme">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={ANAGRAMS_FONTS_HREF} />
      <style>{ANAGRAMS_THEME_CSS}</style>
      {choice ? (
        <AnagramsVisualizer choice={choice} onLeave={() => setChoice(null)} />
      ) : (
        <AnagramsLobbyGate onEnter={setChoice} />
      )}
    </div>
  );
}

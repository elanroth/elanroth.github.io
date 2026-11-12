import { useEffect, useMemo, useState } from "react";
import {
  createAnagramsLobby,
  createAnagramsTestLobby,
  joinAnagramsLobby,
  listAnagramsLobbies,
  subscribeAnagramsLobbies,
  type AnagramsLobbyMeta,
} from "./firebase/rtdb";

export type AnagramsLobbyChoice = {
  gameId: string;
  playerId: string;
  nickname: string;
  lobbyName?: string;
};

type Props = {
  onEnter: (choice: AnagramsLobbyChoice) => void;
};

const BAG_SIZES = [40, 60, 100, 144];
const MIN_LENGTHS = [2, 3, 4];
// Lobbies are never deleted and player counts drift when tabs close, so only list
// ones that are plausibly still going: new today, or occupied and under a week old.
const DAY_MS = 24 * 60 * 60 * 1000;
const isOpenLobby = (lobby: AnagramsLobbyMeta, now: number) => {
  const age = now - lobby.createdAt;
  return age < DAY_MS || (lobby.playerCount > 0 && age < 7 * DAY_MS);
};

function describeLobbyError(fallback: string, err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err && typeof (err as { code?: unknown }).code === "string"
    ? (err as { code: string }).code
    : "";
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const normalized = `${code} ${message}`.toLowerCase();
  if (normalized.includes("permission_denied") || normalized.includes("permission denied")) {
    return `${fallback}: Firebase denied the write. The live Realtime Database rules for this project probably have not been deployed yet.`;
  }
  const details = [code, message].filter(Boolean).join(" ");
  return details ? `${fallback}: ${details}` : fallback;
}

function getOrCreatePlayerId(): string {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("user");
  if (fromQuery) {
    sessionStorage.setItem("anagrams_userId_session", fromQuery);
    url.searchParams.delete("user");
    window.history.replaceState({}, "", url.toString());
    return fromQuery;
  }

  const session = sessionStorage.getItem("anagrams_userId_session");
  if (session) return session;

  const baseKey = "anagrams_userId_base";
  let base = localStorage.getItem(baseKey);
  if (!base) {
    base = `guest-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(baseKey, base);
  }

  const id = `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`;
  sessionStorage.setItem("anagrams_userId_session", id);
  return id;
}

function timeAgo(ts: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AnagramsLobbyGate({ onEnter }: Props) {
  const [nickname, setNickname] = useState(() => localStorage.getItem("anagrams_nick") || "");
  const [lobbies, setLobbies] = useState<AnagramsLobbyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [bagSize, setBagSize] = useState(60);
  const [minWordLength, setMinWordLength] = useState(3);

  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const now = Date.now();
  const openLobbies = lobbies.filter((lobby) => isOpenLobby(lobby, now));

  useEffect(() => {
    setLoading(true);
    listAnagramsLobbies()
      .then(setLobbies)
      .catch((err) => setError(describeLobbyError("Could not load lobbies", err)))
      .finally(() => setLoading(false));
    return subscribeAnagramsLobbies(setLobbies);
  }, []);

  function requireNickname(): string | null {
    const nick = nickname.trim();
    if (!nick) {
      setError("Enter your name first.");
      document.getElementById("anagrams-nickname")?.focus();
      return null;
    }
    return nick;
  }

  async function enter(lobby: AnagramsLobbyMeta) {
    const nick = requireNickname();
    if (!nick) return;
    setError(null);
    setBusy(true);
    try {
      await joinAnagramsLobby(lobby.gameId, playerId, nick);
      localStorage.setItem("anagrams_nick", nick);
      onEnter({ gameId: lobby.gameId, playerId, nickname: nick, lobbyName: lobby.lobbyName });
    } catch (err) {
      console.error("[anagrams] joinLobby failed", err);
      setError(describeLobbyError("Could not join lobby", err));
    } finally {
      setBusy(false);
    }
  }

  async function createAndEnter() {
    const nick = requireNickname();
    if (!nick) return;
    setError(null);
    setBusy(true);
    try {
      const created = await createAnagramsLobby({
        lobbyName: lobbyName.trim() || `${nick}'s table`,
        hostId: playerId,
        options: { bagSize, minWordLength },
      });
      await joinAnagramsLobby(created.gameId, playerId, nick);
      localStorage.setItem("anagrams_nick", nick);
      onEnter({ gameId: created.gameId, playerId, nickname: nick, lobbyName: created.lobbyName });
    } catch (err) {
      console.error("[anagrams] createLobby failed", err);
      setError(describeLobbyError("Could not create lobby", err));
    } finally {
      setBusy(false);
    }
  }

  async function createTestGame() {
    const nick = requireNickname();
    if (!nick) return;
    setError(null);
    setBusy(true);
    try {
      const created = await createAnagramsTestLobby({ hostId: playerId, nickname: nick });
      localStorage.setItem("anagrams_nick", nick);
      onEnter({ gameId: created.gameId, playerId, nickname: nick, lobbyName: created.lobbyName });
    } catch (err) {
      console.error("[anagrams] createTestLobby failed", err);
      setError(describeLobbyError("Could not create test lobby", err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ag-lobby">
      <style>{`
        .ag-lobby {
          max-width: 980px;
          margin: 0 auto;
          padding: 40px 16px 56px;
          display: grid;
          gap: 26px;
        }
        .ag-lobby-title {
          font-family: var(--serif);
          font-weight: 800;
          font-size: clamp(40px, 7vw, 64px);
          letter-spacing: -0.02em;
          line-height: 1;
          margin: 0;
          color: var(--accent-dark);
        }
        .ag-lobby-sub { margin: 10px 0 0; font-size: 18px; color: var(--ink-soft); }
        .ag-lobby-grid {
          display: grid;
          gap: 26px;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
          align-items: start;
        }
        .ag-field { display: grid; gap: 0; }
        .ag-form { display: grid; gap: 16px; }
        .ag-lobby-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid var(--rule-soft);
        }
        .ag-lobby-row:last-child { border-bottom: none; }
        .ag-lobby-name { font-weight: 700; font-size: 17px; overflow-wrap: anywhere; }
        .ag-lobby-meta { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
        .ag-rules { margin: 0; padding-left: 20px; display: grid; gap: 6px; color: var(--ink-soft); }
        .ag-rules b { color: var(--accent-dark); }
        .ag-kbd {
          font-family: var(--mono);
          font-size: 12px;
          border: 1.5px solid var(--ink);
          border-radius: 5px;
          padding: 0 5px;
          background: var(--paper-2);
        }
      `}</style>

      <header>
        <h1 className="ag-lobby-title">Anagrams</h1>
        <p className="ag-lobby-sub ag-italic">Sometimes called Snatch. Flip tiles, make words, steal words.</p>
      </header>

      {error && <div className="ag-error" role="alert">{error}</div>}

      <div className="ag-lobby-grid">
        <section className="ag-card">
          <div className="ag-card-head"><h2>Start a game</h2></div>
          <div className="ag-card-body ag-form">
            <div className="ag-field">
              <label htmlFor="anagrams-nickname" className="ag-label">Your name</label>
              <input
                id="anagrams-nickname"
                name="nickname"
                autoComplete="nickname"
                className="ag-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="What should the table call you?"
              />
            </div>

            <div className="ag-field">
              <label htmlFor="anagrams-lobby-name" className="ag-label">Lobby name (optional)</label>
              <input
                id="anagrams-lobby-name"
                className="ag-input"
                value={lobbyName}
                onChange={(e) => setLobbyName(e.target.value)}
                placeholder="Named after you if left blank"
              />
            </div>

            <div className="ag-field">
              <span className="ag-label">Tiles in the bag</span>
              <div className="ag-pills" role="group" aria-label="Tiles in the bag">
                {BAG_SIZES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`ag-btn${bagSize === v ? " is-on" : ""}`}
                    aria-pressed={bagSize === v}
                    onClick={() => setBagSize(v)}
                    disabled={busy}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="ag-field">
              <span className="ag-label">Shortest word</span>
              <div className="ag-pills" role="group" aria-label="Shortest word">
                {MIN_LENGTHS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`ag-btn${minWordLength === v ? " is-on" : ""}`}
                    aria-pressed={minWordLength === v}
                    onClick={() => setMinWordLength(v)}
                    disabled={busy}
                  >
                    {v} letters
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              <button type="button" className="ag-btn ag-btn--lg is-on" onClick={createAndEnter} disabled={busy}>
                Start new lobby
              </button>
              {import.meta.env.DEV && (
                <button type="button" className="ag-btn ag-btn--muted" onClick={createTestGame} disabled={busy}>
                  Test game (dev)
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="ag-card">
          <div className="ag-card-head">
            <h2>Open lobbies</h2>
            <span className="ag-count">{loading ? "…" : openLobbies.length}</span>
          </div>
          <div className="ag-card-body">
            {loading && <div className="ag-muted ag-italic">Loading lobbies…</div>}
            {!loading && openLobbies.length === 0 && (
              <div className="ag-muted ag-italic">No one's playing right now. Start a lobby and send a friend the link.</div>
            )}
            {openLobbies.map((lobby) => (
              <div key={lobby.gameId} className="ag-lobby-row">
                <div style={{ minWidth: 0 }}>
                  <div className="ag-lobby-name">{lobby.lobbyName}</div>
                  <div className="ag-lobby-meta">
                    {lobby.playerCount} player{lobby.playerCount === 1 ? "" : "s"} · {lobby.options.bagSize} tiles · {timeAgo(lobby.createdAt, now)}
                  </div>
                </div>
                <button type="button" className="ag-btn" onClick={() => enter(lobby)} disabled={busy}>
                  Join
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ag-card">
        <div className="ag-card-head"><h2>How to play</h2></div>
        <div className="ag-card-body">
          <ol className="ag-rules">
            <li><b>Flip</b> a tile into the middle with the button or <span className="ag-kbd">Space</span>. Anyone can flip, any time.</li>
            <li><b>Claim</b> a word you can spell from the middle: type it and press <span className="ag-kbd">Enter</span>.</li>
            <li><b>Steal</b> someone's word by using all of its letters plus at least one from the middle: TONE + S → STONE works, TONE + S → TONES doesn't (plurals and tense changes don't count).</li>
            <li>When the bag runs out, the most letters in words wins.</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

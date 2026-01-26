import { useEffect, useMemo, useState } from "react";
import {
  createAnagramsLobby,
  joinAnagramsLobby,
  listAnagramsLobbies,
  subscribeAnagramsLobbies,
  type AnagramsLobbyMeta,
} from "./firebase/rtdb";

export type AnagramsLobbyChoice = {
  gameId: string;
  playerId: string;
  nickname: string;
  playerIndex: number;
};

type Props = {
  onEnter: (choice: AnagramsLobbyChoice) => void;
};

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

  useEffect(() => {
    setLoading(true);
    listAnagramsLobbies().then(setLobbies).finally(() => setLoading(false));
    const unsub = subscribeAnagramsLobbies(setLobbies);
    return unsub;
  }, []);

  async function enter(lobby: AnagramsLobbyMeta) {
    const nick = nickname.trim();
    if (!nick) {
      setError("Enter a nickname");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const playerIndex = await joinAnagramsLobby(lobby.gameId, playerId, nick);
      localStorage.setItem("anagrams_nick", nick);
      onEnter({ gameId: lobby.gameId, playerId, nickname: nick, playerIndex });
    } catch (err) {
      setError("Could not join lobby");
    } finally {
      setBusy(false);
    }
  }

  async function createAndEnter() {
    const nick = nickname.trim();
    if (!nick) {
      setError("Enter a nickname");
      return;
    }
    const trimmedLobbyName = lobbyName.trim();
    setError(null);
    setBusy(true);
    try {
      const { gameId } = await createAnagramsLobby({
        lobbyName: trimmedLobbyName,
        hostId: playerId,
        options: { bagSize, minWordLength },
      });
      const playerIndex = await joinAnagramsLobby(gameId, playerId, nick);
      localStorage.setItem("anagrams_nick", nick);
      onEnter({ gameId, playerId, nickname: nick, playerIndex });
    } catch (err) {
      setError("Could not create lobby");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)", fontFamily: "'Fredoka', system-ui, sans-serif" }}>
      <div style={{ width: "min(860px, 96vw)", background: "rgba(255,255,255,0.92)", padding: 24, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Anagrams</div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>Join any lobby (even in progress) or start a new one.</div>
          </div>
          <button
            type="button"
            onClick={createAndEnter}
            disabled={busy}
            style={{
              padding: "10px 14px",
              background: "#ffd54f",
              borderRadius: 12,
              border: "none",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              fontWeight: 800,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Start new lobby
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <div>
            <label htmlFor="anagrams-nickname" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              Nickname
            </label>
            <input
              id="anagrams-nickname"
              name="nickname"
              autoComplete="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your name"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
                fontSize: 16,
              }}
            />
          </div>

          <div>
            <label htmlFor="anagrams-lobby-name" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              Lobby name (optional)
            </label>
            <input
              id="anagrams-lobby-name"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder="Auto-named if left blank"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
                fontSize: 15,
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13, color: "#374151" }}>Bag size</strong>
            <div style={{ display: "inline-flex" }}>
              {[40, 60, 100, 144].map((v, idx, arr) => {
                const isActive = bagSize === v;
                const isFirst = idx === 0;
                const isLast = idx === arr.length - 1;
                return (
                  <button
                    key={v}
                    onClick={() => setBagSize(v)}
                    disabled={busy}
                    style={{
                      padding: "10px 12px",
                      minWidth: 90,
                      justifyContent: "center",
                      alignItems: "center",
                      display: "inline-flex",
                      fontWeight: 800,
                      border: "1px solid #e5e7eb",
                      background: isActive ? "#2563eb" : "white",
                      color: isActive ? "white" : "#111",
                      cursor: busy ? "not-allowed" : "pointer",
                      marginLeft: isFirst ? 0 : -1,
                      borderRadius: isFirst ? "12px 0 0 12px" : isLast ? "0 12px 12px 0" : "0",
                    }}
                  >
                    {v} tiles
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13, color: "#374151" }}>Min word length</strong>
            <div style={{ display: "inline-flex" }}>
              {[2, 3, 4].map((v, idx, arr) => {
                const isActive = minWordLength === v;
                const isFirst = idx === 0;
                const isLast = idx === arr.length - 1;
                return (
                  <button
                    key={v}
                    onClick={() => setMinWordLength(v)}
                    disabled={busy}
                    style={{
                      padding: "10px 12px",
                      minWidth: 70,
                      justifyContent: "center",
                      alignItems: "center",
                      display: "inline-flex",
                      fontWeight: 800,
                      border: "1px solid #e5e7eb",
                      background: isActive ? "#2563eb" : "white",
                      color: isActive ? "white" : "#111",
                      cursor: busy ? "not-allowed" : "pointer",
                      marginLeft: isFirst ? 0 : -1,
                      borderRadius: isFirst ? "12px 0 0 12px" : isLast ? "0 12px 12px 0" : "0",
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && <div style={{ color: "#b3261e", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && <div style={{ color: "#6b7280" }}>Loading lobbies…</div>}
          {!loading && lobbies.length === 0 && <div style={{ color: "#6b7280" }}>No lobbies yet. Start one!</div>}
          {lobbies.map((lobby) => (
            <div
              key={lobby.gameId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: 12,
                background: "linear-gradient(180deg,#fffef9,#fff7d6)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{lobby.lobbyName}</div>
                <div style={{ color: "#6b7280", fontSize: 14 }}>
                  {lobby.playerCount} player{lobby.playerCount === 1 ? "" : "s"} · {lobby.status}
                </div>
              </div>
              <button
                onClick={() => enter(lobby)}
                disabled={busy}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 800,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Join
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

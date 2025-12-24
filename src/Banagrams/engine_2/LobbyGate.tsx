import React, { useEffect, useMemo, useState } from "react";
import { createLobby, joinLobby, listLobbies, subscribeLobbies, type LobbyMeta } from "./firebase/rtdb";

export type LobbyChoice = { gameId: string; playerId: string; nickname: string };

type Props = {
  onEnter: (choice: LobbyChoice) => void;
};

function getOrCreatePlayerId(): string {
  const qs = new URLSearchParams(window.location.search);
  const fromQuery = qs.get("user");
  if (fromQuery) {
    sessionStorage.setItem("banagrams_userId_session", fromQuery);
    return fromQuery;
  }

  const session = sessionStorage.getItem("banagrams_userId_session");
  if (session) return session;

  // Base persisted id for convenience (per device), but make it unique per tab/session
  const baseKey = "banagrams_userId_base";
  let base = localStorage.getItem(baseKey);
  if (!base) {
    base = `guest-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(baseKey, base);
  }

  const id = `${base}-${Math.random().toString(36).slice(2, 5)}`;
  sessionStorage.setItem("banagrams_userId_session", id);
  return id;
}

export function LobbyGate({ onEnter }: Props) {
  const [nickname, setNickname] = useState(() => localStorage.getItem("banagrams_nick") || "");
  const [lobbies, setLobbies] = useState<LobbyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerId = useMemo(() => getOrCreatePlayerId(), []);

  useEffect(() => {
    setLoading(true);
    listLobbies().then(setLobbies).finally(() => setLoading(false));
    const unsub = subscribeLobbies(setLobbies);
    return unsub;
  }, []);

  async function enter(gameId: string) {
    const nick = nickname.trim();
    if (!nick) {
      setError("Enter a nickname");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await joinLobby(gameId, playerId, nick);
      localStorage.setItem("banagrams_nick", nick);
      onEnter({ gameId, playerId, nickname: nick });
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
    setError(null);
    setBusy(true);
    try {
      const { gameId } = await createLobby();
      await joinLobby(gameId, playerId, nick);
      localStorage.setItem("banagrams_nick", nick);
      onEnter({ gameId, playerId, nickname: nick });
    } catch (err) {
      setError("Could not create lobby");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)", fontFamily: "'Fredoka', system-ui, sans-serif" }}>
      <div style={{ width: "min(720px, 95vw)", background: "rgba(255,255,255,0.92)", padding: 24, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Banagrams</div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>Pick a nickname and join a lobby.</div>
          </div>
          <button
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

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Nickname</label>
          <input
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

        {error && <div style={{ color: "#b3261e", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && <div style={{ color: "#6b7280" }}>Loading lobbies…</div>}
          {!loading && lobbies.length === 0 && <div style={{ color: "#6b7280" }}>No lobbies yet. Start one!</div>}
          {lobbies.map((lobby) => (
            <div key={lobby.gameId} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: 12,
              background: "linear-gradient(180deg,#fffef9,#fff7d6)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            }}>
              <div>
                <div style={{ fontWeight: 800 }}>{lobby.lobbyName}</div>
                <div style={{ color: "#6b7280", fontSize: 14 }}>{lobby.playerCount} player{lobby.playerCount === 1 ? "" : "s"} · {lobby.status === "active" ? "Active" : "Finished"}</div>
              </div>
              <button
                onClick={() => enter(lobby.gameId)}
                disabled={busy}
                style={{
                  padding: "8px 12px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
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

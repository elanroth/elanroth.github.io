import React, { useEffect, useMemo, useState } from "react";
import { subscribeGame, setGameStatus } from "./firebase/rtdb";
import type { LobbyChoice } from "./LobbyGate";
import type { PlayerInfo, GameStatus } from "./types";

export type LobbyWaitingRoomProps = {
  choice: LobbyChoice;
  onReady: () => void;
};

export function LobbyWaitingRoom({ choice, onReady }: LobbyWaitingRoomProps) {
  const { gameId, playerId } = choice;
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [status, setStatus] = useState<GameStatus>({ phase: "waiting" });
  const [hostId, setHostId] = useState<string | undefined>(undefined);
  const [lobbyName, setLobbyName] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeGame(gameId, (snap) => {
      setPlayers(snap.players || {});
      setStatus(snap.status || { phase: "waiting" });
      setHostId(snap.hostId);
      setLobbyName(snap.lobbyName);
      if (snap.status?.phase === "active") {
        onReady();
      }
    });
    return unsub;
  }, [gameId, onReady]);

  const isHost = useMemo(() => hostId === playerId, [hostId, playerId]);
  const playerList = useMemo(() => {
    return Object.entries(players)
      .sort((a, b) => (a[1]?.joinedAt ?? 0) - (b[1]?.joinedAt ?? 0))
      .map(([pid, info]) => ({ pid, nickname: info?.nickname || pid, isHost: pid === hostId }));
  }, [players, hostId]);

  async function startGame() {
    if (!isHost) return;
    setBusy(true);
    try {
      await setGameStatus(gameId, { phase: "active", updatedAt: Date.now() });
    } finally {
      setBusy(false);
    }
  }

  const waiting = status.phase === "waiting";

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)", fontFamily: "'Fredoka', system-ui, sans-serif" }}>
      <div style={{ width: "min(740px, 96vw)", background: "rgba(255,255,255,0.94)", padding: 24, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>{lobbyName || "Lobby"}</div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>
              Waiting room · {playerList.length} player{playerList.length === 1 ? "" : "s"}
            </div>
          </div>
          {waiting && (
            <button
              onClick={startGame}
              disabled={!isHost || busy}
              style={{
                padding: "10px 14px",
                background: isHost ? "#2563eb" : "#9ca3af",
                color: "white",
                border: "none",
                borderRadius: 12,
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                fontWeight: 800,
                cursor: isHost && !busy ? "pointer" : "not-allowed",
              }}
            >
              {isHost ? "Start" : "Waiting for host"}
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {playerList.length === 0 && <div style={{ color: "#6b7280" }}>No players yet.</div>}
          {playerList.map((p) => (
            <div key={p.pid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 12, background: "linear-gradient(180deg,#fffef9,#fff7d6)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800 }}>{p.nickname}</span>
                {p.isHost && <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 700 }}>Host</span>}
              </div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Joined {new Date(players[p.pid]?.joinedAt ?? Date.now()).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { subscribeGame, setGameStatus, updateLobbyOptions } from "./firebase/rtdb";
import type { LobbyChoice } from "./LobbyGate";
import type { PlayerInfo, GameStatus, GameOptions } from "./types";
import { DEFAULT_OPTIONS } from "./utils";

export type LobbyWaitingRoomProps = {
  choice: LobbyChoice;
  onReady: () => void;
  onShowInstructions?: () => void;
};

export function LobbyWaitingRoom({ choice, onReady, onShowInstructions }: LobbyWaitingRoomProps) {
  const { gameId, playerId } = choice;
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [status, setStatus] = useState<GameStatus>({ phase: "waiting" });
  const [hostId, setHostId] = useState<string | undefined>(undefined);
  const [lobbyName, setLobbyName] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<GameOptions>(DEFAULT_OPTIONS);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [savingOptions, setSavingOptions] = useState(false);

  useEffect(() => {
    const unsub = subscribeGame(gameId, (snap) => {
      setPlayers(snap.players || {});
      setStatus(snap.status || { phase: "waiting" });
      setHostId(snap.hostId);
      setLobbyName(snap.lobbyName);
      setOptions(snap.options ?? DEFAULT_OPTIONS);
      setOptionError(null);
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

  async function changeOptions(next: Partial<GameOptions>) {
    if (!isHost || status.phase !== "waiting") return;
    setOptionError(null);
    setSavingOptions(true);
    setOptions((prev) => ({ ...prev, ...next }));
    try {
      await updateLobbyOptions(gameId, playerId, next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update options";
      setOptionError(message);
    } finally {
      setSavingOptions(false);
    }
  }

  const waiting = status.phase === "waiting";
  const canEditOptions = isHost && waiting;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg,#fff8e1 0%, #fff3bf 60%, #fffbe6 100%)", fontFamily: "'Fredoka', system-ui, sans-serif" }}>
      <div style={{ width: "min(1080px, 96vw)", background: "rgba(255,255,255,0.94)", padding: 28, borderRadius: 18, boxShadow: "0 14px 36px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 24 }}>{lobbyName || "Lobby"}</div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>
              Waiting room · {playerList.length} player{playerList.length === 1 ? "" : "s"}
            </div>
          </div>
          {waiting && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => onShowInstructions?.()}
                disabled={busy}
                style={{
                  padding: "10px 12px",
                  background: "#e5e7eb",
                  border: "none",
                  borderRadius: 12,
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Instructions
              </button>
              <button
                type="button"
                onClick={startGame}
                disabled={!isHost || busy || savingOptions}
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
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(420px,1.05fr) minmax(360px,0.95fr)", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 6, padding: 10, borderRadius: 12, background: "linear-gradient(180deg,#fffef9,#fff7d6)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", alignSelf: "start" }}>
            {playerList.length === 0 && <div style={{ color: "#6b7280" }}>No players yet.</div>}
            {playerList.map((p) => (
              <div
                key={p.pid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: "flex-start",
                  padding: "6px 10px",
                  minHeight: 36,
                  borderRadius: 8,
                  background: "linear-gradient(180deg,#fffef9,#fff7d6)",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                }}
              >
                <span style={{ fontWeight: 800 }}>{p.nickname}</span>
                {p.isHost && <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 700 }}>Host</span>}
              </div>
            ))}
          </div>

          <div style={{ padding: 12, borderRadius: 12, background: "linear-gradient(180deg,#fffef9,#fff7d6)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800 }}>Game options</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13, color: "#374151" }}>Bag size</strong>
              <div style={{ display: "inline-flex" }}>
                {[40, 60, 100, 144].map((v, idx, arr) => {
                  const isActive = options.bagSize === v;
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  return (
                    <button
                      key={v}
                      onClick={() => changeOptions({ bagSize: v as GameOptions["bagSize"] })}
                      disabled={!canEditOptions}
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
                        cursor: canEditOptions ? "pointer" : "not-allowed",
                        marginLeft: isFirst ? 0 : -1,
                        borderRadius: isFirst ? "12px 0 0 12px" : isLast ? "0 12px 12px 0" : "0",
                        opacity: canEditOptions ? 1 : 0.7,
                      }}
                    >
                      {v} tiles
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13, color: "#374151" }}>Starting tiles</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="range"
                  min={16}
                  max={30}
                  step={1}
                  value={options.startingHand}
                  onChange={(e) => changeOptions({ startingHand: Number(e.target.value) })}
                  disabled={!canEditOptions}
                  style={{ width: 220, accentColor: "#2563eb", cursor: canEditOptions ? "pointer" : "not-allowed" }}
                />
                <div style={{ minWidth: 44, textAlign: "center", fontWeight: 800, fontSize: 18 }}>{options.startingHand}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13, color: "#374151" }}>Min word length</strong>
              <div style={{ display: "inline-flex" }}>
                {[2, 3, 4].map((v, idx, arr) => {
                  const isActive = options.minLength === v;
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  return (
                    <button
                      key={v}
                      onClick={() => changeOptions({ minLength: v as GameOptions["minLength"] })}
                      disabled={!canEditOptions}
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
                        cursor: canEditOptions ? "pointer" : "not-allowed",
                        marginLeft: isFirst ? 0 : -1,
                        borderRadius: isFirst ? "12px 0 0 12px" : isLast ? "0 12px 12px 0" : "0",
                        opacity: canEditOptions ? 1 : 0.7,
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            {optionError && <div style={{ color: "#b3261e", fontWeight: 700 }}>{optionError}</div>}
            {!isHost && <div style={{ color: "#6b7280", fontSize: 13 }}>Waiting for the host to start.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

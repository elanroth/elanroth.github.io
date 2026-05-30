import { useEffect, useState } from "react";
import type { Seat } from "./engine/types";
import { SEATS } from "./engine/types";
import { claimSeat, createGame, getMeta, releaseSeat } from "./controller/rtdb";
import { storeNickname } from "./controller/identity";
import type { UseGameResult } from "./controller/useGame";
import { botNickname, botUid } from "./bot/heuristics";

type Props = {
  uid: string;
  initialNick: string;
  gameId: string | null;
  setGameId: (g: string | null) => void;
  game: UseGameResult;             // shared, owned by HiLoJackApp
};

function isBotUid(uid: string): boolean {
  return uid.startsWith("bot-");
}

// Stage 1: enter nickname and pick "create" vs "join".
// Stage 2 (after a gameId exists): pick a seat. Once all 4 seated AND the engine
// state agrees, host can start the hand.
export function Lobby({ uid, initialNick, gameId, setGameId, game }: Props) {
  const [nick, setNick] = useState(initialNick);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [targetScore, setTargetScore] = useState<7 | 11 | 21>(21);

  // Use the engine's reducer-derived players as the SOURCE OF TRUTH for seating
  // and for the "all 4 seated → can start" gate. The /players RTDB subscription
  // (game.players) is just the atomic-claim helper and may briefly disagree
  // (showing a seat as claimed before the corresponding JOIN_SEAT action has
  // been replayed locally). Using state.players avoids that race entirely.
  const enginePlayers = game.state.players;
  const filledSeats = SEATS.filter((s) => enginePlayers[s]).length;
  const allFourSeated = filledSeats === 4;

  useEffect(() => {
    if (nick.trim()) storeNickname(nick.trim());
  }, [nick]);

  async function handleCreate() {
    if (!nick.trim()) { setErr("nickname required"); return; }
    setBusy(true);
    setErr(null);
    try {
      const id = await createGame({ hostUid: uid, nickname: nick.trim(), targetScore });
      setGameId(id);
    } catch (e) {
      setErr(`create failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!nick.trim()) { setErr("nickname required"); return; }
    if (!code) { setErr("game code required"); return; }
    setBusy(true);
    setErr(null);
    try {
      const m = await getMeta(code);
      if (!m) setErr(`no game with code ${code}`);
      else setGameId(code);
    } catch (e) {
      setErr(`join failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleClaimSeat(seat: Seat) {
    if (!gameId || !nick.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const ok = await claimSeat(gameId, seat, uid, nick.trim());
      if (!ok) {
        setErr(`seat ${seat} is taken`);
      } else {
        await game.dispatch({ type: "JOIN_SEAT", seat, uid, nickname: nick.trim() });
      }
    } catch (e) {
      setErr(`claim failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddBot(seat: Seat) {
    if (!gameId) return;
    setBusy(true);
    setErr(null);
    try {
      const bUid = botUid(gameId, seat);
      const bNick = botNickname(seat);
      const ok = await claimSeat(gameId, seat, bUid, bNick);
      if (!ok) {
        setErr(`seat ${seat} is taken`);
      } else {
        await game.dispatch({ type: "JOIN_SEAT", seat, uid: bUid, nickname: bNick });
      }
    } catch (e) {
      setErr(`add bot failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveBot(seat: Seat) {
    if (!gameId) return;
    const occupant = enginePlayers[seat];
    if (!occupant || !isBotUid(occupant.uid)) return;
    setBusy(true);
    setErr(null);
    try {
      await releaseSeat(gameId, seat, occupant.uid);
      await game.dispatch({ type: "LEAVE_SEAT", seat, uid: occupant.uid });
    } catch (e) {
      setErr(`remove bot failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddBotsToEmpty() {
    if (!gameId) return;
    for (const seat of SEATS) {
      if (!enginePlayers[seat]) {
        // sequential so each JOIN_SEAT lands before the next, keeping the
        // reducer's allFourSeated check happy as it converges.
        // eslint-disable-next-line no-await-in-loop
        await handleAddBot(seat);
      }
    }
  }

  async function handleStartHand() {
    if (!gameId) return;
    if (!allFourSeated) {
      setErr("need 4 players seated");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await game.dispatch({ type: "START_HAND" });
    } catch (e) {
      setErr(`start failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  // Stage 1: no game yet — show create/join UI
  if (!gameId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-3 sm:p-6">
        <div className="w-full max-w-md p-4 sm:p-6 rounded-xl bg-slate-800 shadow-lg space-y-4">
          <h1 className="text-2xl font-bold">Hi-Lo-Jack</h1>
          <p className="text-sm opacity-70">4 players, 2-vs-2 partnerships. N–S vs E–W.</p>

          <label className="block">
            <span className="text-xs uppercase tracking-wider opacity-70">Nickname</span>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md bg-slate-700 text-white"
              maxLength={16}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 p-3 rounded-md bg-slate-700/40">
              <h2 className="text-sm font-semibold">Create</h2>
              <label className="block text-xs">
                Target score
                <select
                  value={targetScore}
                  onChange={(e) => setTargetScore(Number(e.target.value) as 7 | 11 | 21)}
                  className="ml-2 px-2 py-0.5 rounded bg-slate-600"
                >
                  <option value={7}>7</option>
                  <option value={11}>11</option>
                  <option value={21}>21</option>
                </select>
              </label>
              <button
                onClick={handleCreate}
                disabled={busy}
                className="w-full px-3 py-2 rounded-md bg-amber-400 text-slate-900 font-semibold disabled:bg-slate-600"
              >
                {busy ? "…" : "Create lobby"}
              </button>
            </div>

            <div className="space-y-2 p-3 rounded-md bg-slate-700/40">
              <h2 className="text-sm font-semibold">Join</h2>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="CODE"
                className="w-full px-2 py-1 rounded bg-slate-600 text-white uppercase font-mono"
                maxLength={6}
              />
              <button
                onClick={handleJoin}
                disabled={busy}
                className="w-full px-3 py-2 rounded-md bg-amber-400 text-slate-900 font-semibold disabled:bg-slate-600"
              >
                {busy ? "…" : "Join lobby"}
              </button>
            </div>
          </div>

          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
      </div>
    );
  }

  // Stage 2: in a game — pick a seat
  const localSeat: Seat | undefined = SEATS.find((s) => enginePlayers[s]?.uid === uid);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-3 sm:p-6">
      <div className="w-full max-w-lg p-4 sm:p-6 rounded-xl bg-slate-800 shadow-lg space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Lobby <span className="font-mono text-amber-300">{gameId}</span></h1>
          <button
            onClick={async () => {
              // Best-effort: release the seat in /players so a friend can take it.
              // (The JOIN_SEAT in /actions stays — re-joining the same game later
              // is fine; the engine will simply reflect the prior seating until
              // a new JOIN_SEAT lands.)
              const mine = SEATS.find((s) => enginePlayers[s]?.uid === uid);
              if (gameId && mine) {
                try { await releaseSeat(gameId, mine, uid); } catch { /* ignore */ }
              }
              setGameId(null);
            }}
            className="text-xs px-2 py-1 rounded bg-slate-700"
          >
            leave
          </button>
        </div>
        <p className="text-sm opacity-70">
          Target {game.meta?.targetScore ?? 21}. Partnerships: N–S vs E–W.
          Share the code <strong>{gameId}</strong> with three friends.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {SEATS.map((seat) => {
            const entry = enginePlayers[seat];
            const isMine = entry?.uid === uid;
            const isBot = entry && isBotUid(entry.uid);
            const teamLabel = seat === "N" || seat === "S" ? "N–S" : "E–W";
            return (
              <div
                key={seat}
                className={`p-2 sm:p-3 rounded-md ${
                  isMine
                    ? "bg-amber-400 text-slate-900"
                    : entry
                    ? "bg-slate-700"
                    : "bg-slate-700/50"
                }`}
              >
                <div className="text-[10px] sm:text-xs uppercase opacity-70">
                  Seat {seat} · team {teamLabel}
                </div>
                <div className="font-semibold text-sm sm:text-base truncate">
                  {entry ? entry.nickname : "open"}
                  {isBot && " 🤖"}
                  {isMine && " (you)"}
                </div>
                <div className="mt-1.5 flex gap-1 flex-wrap">
                  {!entry && (
                    <button
                      onClick={() => handleClaimSeat(seat)}
                      disabled={busy}
                      className="px-2 py-0.5 rounded text-[11px] bg-amber-400 text-slate-900 font-semibold disabled:opacity-50"
                    >
                      Take it
                    </button>
                  )}
                  {!entry && (
                    <button
                      onClick={() => handleAddBot(seat)}
                      disabled={busy}
                      className="px-2 py-0.5 rounded text-[11px] bg-slate-600 text-white disabled:opacity-50"
                    >
                      + Bot
                    </button>
                  )}
                  {entry && isBot && (
                    <button
                      onClick={() => handleRemoveBot(seat)}
                      disabled={busy}
                      className="px-2 py-0.5 rounded text-[11px] bg-slate-600 text-white disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick fill: add bots to any empty seats */}
        {!allFourSeated && (
          <button
            onClick={handleAddBotsToEmpty}
            disabled={busy}
            className="w-full px-3 py-1.5 rounded-md bg-slate-600 text-white text-sm disabled:opacity-50"
          >
            Fill remaining seats with bots
          </button>
        )}

        {allFourSeated ? (
          <button
            onClick={handleStartHand}
            disabled={busy}
            className="w-full px-3 py-2 rounded-md bg-emerald-500 text-slate-900 font-semibold disabled:bg-slate-600"
          >
            Start hand
          </button>
        ) : (
          <div className="text-center text-sm opacity-70">
            {filledSeats}/4 seated · waiting for {4 - filledSeats} more
          </div>
        )}
        {localSeat && (
          <div className="text-xs opacity-70 text-center">
            You're seated at <strong>{localSeat}</strong>.
          </div>
        )}
        {err && <div className="text-rose-400 text-sm">{err}</div>}
      </div>
    </div>
  );
}

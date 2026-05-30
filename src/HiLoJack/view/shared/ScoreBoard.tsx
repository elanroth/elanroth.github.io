import type { GameState } from "../../engine/types";

export function ScoreBoard({ state }: { state: GameState }) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 rounded-md bg-black/40 text-white text-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wider opacity-70">N–S</div>
        <div className={`font-bold ${state.score.NS < 0 ? "text-rose-400" : ""}`}>
          {state.score.NS}
        </div>
      </div>
      <div className="text-xs opacity-50">to {state.targetScore}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wider opacity-70">E–W</div>
        <div className={`font-bold ${state.score.EW < 0 ? "text-rose-400" : ""}`}>
          {state.score.EW}
        </div>
      </div>
    </div>
  );
}

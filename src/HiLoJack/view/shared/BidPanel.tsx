import type { Action, Bid, GameState, Seat } from "../../engine/types";

export function BidPanel({
  state,
  localSeat,
  dispatch,
}: {
  state: GameState;
  localSeat: Seat;
  dispatch: (a: Action) => void;
}) {
  if (state.phase.kind !== "bidding") return null;
  const isMyTurn = state.phase.turn === localSeat;
  const priorBids = state.phase.bids;
  const priorNumeric = Object.values(priorBids).filter((b) => b !== "pass") as number[];
  const high = priorNumeric.length > 0 ? Math.max(...priorNumeric) : 1;

  const allPassed = Object.values(priorBids).every((b) => b === "pass");
  const isDealerStuck =
    localSeat === state.dealerSeat &&
    Object.keys(priorBids).length === 3 &&
    allPassed;

  const buttons: Bid[] = ["pass", 2, 3, 4, 5];

  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-black/30 text-white">
      <div className="text-xs uppercase tracking-wider opacity-70">
        {isMyTurn ? "Your bid" : `Waiting on ${state.phase.turn}`}
      </div>
      <div className="flex gap-2">
        {buttons.map((b) => {
          const isPass = b === "pass";
          const tooLow = !isPass && (b as number) <= high;
          const disabled =
            !isMyTurn || tooLow || (isPass && isDealerStuck);
          return (
            <button
              key={String(b)}
              disabled={disabled}
              onClick={() => dispatch({ type: "BID", seat: localSeat, bid: b })}
              className={`px-3 py-1 rounded-md text-sm font-semibold ${
                disabled ? "bg-slate-700 text-slate-400" : "bg-amber-400 text-slate-900 hover:bg-amber-300"
              }`}
            >
              {isPass ? "Pass" : `${b}`}
            </button>
          );
        })}
      </div>
      {isDealerStuck && (
        <div className="text-[11px] opacity-70">Dealer is stuck — must bid at least 2.</div>
      )}
    </div>
  );
}

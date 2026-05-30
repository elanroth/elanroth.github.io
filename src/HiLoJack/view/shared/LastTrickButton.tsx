import { useState } from "react";
import type { GameState, Seat } from "../../engine/types";
import { CardFace } from "./Card";

// Per §3 of EXECPLAN: only the immediately preceding trick is ever visible.
// Hover/press to reveal; release/un-hover to hide. Hidden entirely if lastTrick is null.
export function LastTrickButton({ state }: { state: GameState; localSeat?: Seat }) {
  const [open, setOpen] = useState(false);
  if (!state.lastTrick) return null;
  return (
    <div className="relative">
      <button
        onMouseDown={() => setOpen(true)}
        onMouseUp={() => setOpen(false)}
        onMouseLeave={() => setOpen(false)}
        onTouchStart={() => setOpen(true)}
        onTouchEnd={() => setOpen(false)}
        className="px-2 py-1 text-xs rounded-md bg-amber-300 text-slate-900 font-semibold shadow"
      >
        last trick
      </button>
      {open && (
        <div className="absolute right-0 mt-1 p-2 rounded-md bg-black/85 text-white shadow-lg flex items-center gap-2 z-50">
          {state.lastTrick.cards.map((p, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="text-[10px] opacity-70">{p.seat}</div>
              <CardFace card={p.card} size="sm" />
            </div>
          ))}
          <div className="text-[10px] opacity-70 ml-2">won by {state.lastTrick.winner}</div>
        </div>
      )}
    </div>
  );
}

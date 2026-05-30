import type { FixturePhase } from "./__fixtures__/midHand";

const PHASES: FixturePhase[] = ["lobby", "bidding", "openingLead", "playing", "scoring", "gameOver"];

export function PhaseSwitcher({
  current,
  onChange,
}: {
  current: FixturePhase;
  onChange: (p: FixturePhase) => void;
}) {
  return (
    <div className="fixed top-2 right-2 z-50 flex flex-wrap gap-1 p-2 rounded-md bg-black/70 text-white text-[11px]">
      <span className="opacity-60 mr-1">dev:</span>
      {PHASES.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2 py-0.5 rounded ${current === p ? "bg-amber-400 text-slate-900 font-semibold" : "bg-slate-700"}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

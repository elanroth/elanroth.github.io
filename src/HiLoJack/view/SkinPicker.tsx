import { useEffect, useState } from "react";

export type SkinId = "A" | "B" | "C";

const STORAGE_KEY = "hilojack_skin";

export function useSkin(): [SkinId, (id: SkinId) => void] {
  const [skin, setSkin] = useState<SkinId>(() => {
    if (typeof window === "undefined") return "A";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "A" || stored === "B" || stored === "C" ? stored : "A";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, skin);
  }, [skin]);
  return [skin, setSkin];
}

const LABELS: Record<SkinId, string> = {
  A: "Felt Table",
  B: "Top-Down Minimal",
  C: "Suit Radar",
};

export function SkinPicker({
  value,
  onChange,
}: {
  value: SkinId;
  onChange: (id: SkinId) => void;
}) {
  return (
    <div className="fixed top-2 left-2 z-50 p-2 rounded bg-black/70 text-white text-[11px] flex items-center gap-1 backdrop-blur-sm">
      <span className="opacity-60 mr-1">skin:</span>
      {(["A", "B", "C"] as SkinId[]).map((id) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={LABELS[id]}
          className={`px-2 py-0.5 rounded ${
            value === id ? "bg-amber-400 text-slate-900 font-semibold" : "bg-slate-700 hover:bg-slate-600"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

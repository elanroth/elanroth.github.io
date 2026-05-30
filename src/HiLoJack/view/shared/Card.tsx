import type { Card as CardT } from "../../engine/types";

const SUIT_GLYPH: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
const SUIT_COLOR: Record<string, string> = {
  C: "text-slate-900",
  S: "text-slate-900",
  D: "text-rose-600",
  H: "text-rose-600",
};

type Size = "xs" | "sm" | "md" | "lg";
const DIMS: Record<Size, string> = {
  xs: "w-8 h-11 text-[10px]",
  sm: "w-10 h-14 text-xs",
  md: "w-14 h-20 text-sm",
  lg: "w-20 h-28 text-lg",
};

export function CardFace({
  card,
  size = "md",
  faceDown = false,
  onClick,
  disabled,
  highlight,
  className = "",
}: {
  card?: CardT;
  size?: Size;
  faceDown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  const base = `${DIMS[size]} rounded-md select-none shadow ${className}`;
  if (faceDown || !card) {
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`${base} bg-gradient-to-br from-indigo-700 to-indigo-950 border border-indigo-300/40 ${
          onClick && !disabled ? "cursor-pointer hover:-translate-y-0.5 transition" : ""
        }`}
      />
    );
  }
  const glyph = SUIT_GLYPH[card.suit];
  const color = SUIT_COLOR[card.suit];
  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`${base} bg-white border ${
        highlight ? "border-amber-400 ring-2 ring-amber-300" : "border-slate-300"
      } flex flex-col items-start justify-between p-1 ${
        onClick && !disabled ? "cursor-pointer hover:-translate-y-0.5 transition" : ""
      } ${disabled ? "opacity-40" : ""}`}
    >
      <div className={`font-bold leading-none ${color}`}>
        {card.rank}
        {glyph}
      </div>
      <div className={`self-end font-bold leading-none ${color}`}>
        {glyph}
        {card.rank}
      </div>
    </div>
  );
}

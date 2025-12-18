import type { Coord } from "./types";

export function add(a: Coord, b: Coord): Coord { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Coord, b: Coord): Coord { return { x: a.x - b.x, y: a.y - b.y }; }

export function clampRect(rect: { a: Coord; b: Coord }): { min: Coord; max: Coord } {
  const min = { x: Math.min(rect.a.x, rect.b.x), y: Math.min(rect.a.y, rect.b.y) };
  const max = { x: Math.max(rect.a.x, rect.b.x), y: Math.max(rect.a.y, rect.b.y) };
  return { min, max };
}

export function snapCoord(pos: Coord): Coord { return { x: Math.round(pos.x), y: Math.round(pos.y) }; }
export function equalsCoord(a: Coord, b: Coord): boolean { return a.x === b.x && a.y === b.y; }
export function formatCoord(c: Coord): string { return `(${c.x},${c.y})`; }

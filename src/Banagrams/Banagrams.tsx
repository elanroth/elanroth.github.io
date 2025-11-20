import React, { useMemo, useState } from 'react';
import { createBag, shuffleArray, drawFromBag } from './utils';
import type { Tile as TileType, Coord } from './types';

function uid(letter: string) {
  return `${letter}_${Math.random().toString(36).slice(2, 9)}`;
}

function Tile({ tile }: { tile: TileType }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', tile.id)}
      className="inline-flex items-center justify-center w-12 h-12 bg-white border rounded shadow select-none mr-2"
      style={{ fontSize: 18, fontWeight: 700 }}
      title={`Tile ${tile.letter}`}
    >
      {tile.letter}
    </div>
  );
}

export default function Banagrams() {
  // Create and shuffle bag once
  const initialBag = useMemo(() => shuffleArray(createBag()), []);
  const [bag, setBag] = useState<string[]>(initialBag);

  // Board is a map keyed by "x,y" -> Tile
  const [board, setBoard] = useState<Record<string, TileType | null>>({});

  // Tiles currently available to place (appear at top when drawn)
  const [queue, setQueue] = useState<TileType[]>([]);

  // Simple grid size for visual board
  const GRID_SIZE = 13;

  function drawTile() {
    if (bag.length === 0) return;
    const { tiles, bag: remaining } = drawFromBag(bag, 1);
    const letter = tiles[0];
    const t: TileType = { id: uid(letter), letter };
    setQueue((q) => [t, ...q]);
    setBag(remaining);
  }

  function placeTileAt(id: string, coord: Coord) {
    // find tile in queue
    const tile = queue.find((t) => t.id === id);
    if (!tile) return;

    const key = `${coord.x},${coord.y}`;
    setBoard((prev) => ({ ...prev, [key]: tile }));
    setQueue((q) => q.filter((t) => t.id !== id));
  }

  function removeTileFromBoard(coord: Coord) {
    const key = `${coord.x},${coord.y}`;
    setBoard((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // ---- UI ----
  return (
    <div className="min-h-screen flex flex-col items-center p-6">
      <h1 className="text-2xl mb-4">Banagrams — Draft</h1>

      <div className="w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <button
              onClick={drawTile}
              className="px-4 py-2 bg-primary text-white rounded mr-2"
            >
              Draw Tile
            </button>
            <button
              onClick={() => setBag(shuffleArray([...bag]))}
              className="px-4 py-2 bg-secondary text-white rounded"
            >
              Shuffle Remaining ({bag.length})
            </button>
          </div>
          <div className="text-sm text-muted-foreground">Queue: {queue.length}</div>
        </div>

        {/* Top queue area */}
        <div className="mb-6 p-4 bg-muted rounded">
          <div className="flex items-center">
            {queue.length === 0 ? (
              <div className="text-muted-foreground">No tiles. Click "Draw Tile".</div>
            ) : (
              queue.map((t) => <Tile key={t.id} tile={t} />)
            )}
          </div>
        </div>

        {/* Board */}
        <div className="flex justify-center">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 40px)`, gap: 6 }}>
            {Array.from({ length: GRID_SIZE }).map((_, y) =>
              Array.from({ length: GRID_SIZE }).map((_, x) => {
                const key = `${x},${y}`;
                const placed = board[key];
                return (
                  <div
                    key={key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData('text/plain');
                      placeTileAt(id, { x, y });
                    }}
                    className="w-10 h-10 bg-white/80 border border-gray-200 rounded flex items-center justify-center"
                    style={{ minWidth: 40, minHeight: 40 }}
                  >
                    {placed ? <div style={{ fontWeight: 700 }}>{placed.letter}</div> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          Click "Draw Tile" to spawn a tile at the top; drag it onto the board.
        </div>
      </div>
    </div>
  );
}

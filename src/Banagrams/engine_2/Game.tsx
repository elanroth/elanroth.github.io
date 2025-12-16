import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createBag, shuffleArray, drawFromBag } from './utils';
import type { Tile as TileType, Coord } from './types';

export default function Banagrams() {

    // Create and shuffle bag once
    const initialBag = useMemo(() => shuffleArray(createBag()), []);
    const [bag, setBag] = useState<string[]>(initialBag);
    
    // Board is a map keyed by "x,y" -> Tile
    const [board, setBoard] = useState<Record<string, TileType | null>>({});
    
    // Tiles currently available to place (appear in holder at bottom)
    const [queue, setQueue] = useState<TileType[]>([]);

    // Simple grid size for visual board (fixed centered grid)
    const GRID_SIZE = 13;

    function Counter() {
    const [n, setN] = useState(6);

    return (
        <button onClick={() => setN(n + 1)}>
        {n}
        </button>
    );
    }

    return <div> {Counter()} </div>

}
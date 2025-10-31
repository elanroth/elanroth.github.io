import React, { useEffect, useRef, useState } from 'react';
import './fibograph.css';
import {
  nextPair,
  pairKey,
  findCycleFrom,
  jarvisMarch,
} from './fibograph_core';

/**
 * FibographVisualizer
 * - Shows an n x n grid of ordered pairs (a,b) with a on X and b on Y.
 * - Draws edges (a,b) -> nextPair(a,b) and can animate a cycle from a clicked vertex
 * - Animation draws one line at a time (configurable delay)
 *
 * Usage: import and add <FibographVisualizer /> anywhere in your app.
 */
export default function FibographVisualizer() {
  const [n, setN] = useState(8);
  const [startA, setStartA] = useState(0);
  const [startB, setStartB] = useState(1);
  const [delayMs, setDelayMs] = useState(300);

  const [vertices, setVertices] = useState([]); // array of [a,b]
  const [edges, setEdges] = useState([]); // array of {from:[a,b], to:[a,b]}
  const [drawnEdges, setDrawnEdges] = useState([]); // edges drawn for animation
  const [animating, setAnimating] = useState(false);
  const [hullSegments, setHullSegments] = useState([]); // segments for hull overlay (pixel coords)
  const [drawnHullSegments, setDrawnHullSegments] = useState([]);
  const timeouts = useRef([]);

  // build vertices and edges when n changes
  useEffect(() => {
    const verts = [];
    const eds = [];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        verts.push([a, b]);
      }
    }
    for (const v of verts) {
      eds.push({ from: v, to: nextPair(v, n) });
    }
    setVertices(verts);
    setEdges(eds);
    setDrawnEdges([]);
    // cleanup any running timeouts
    timeouts.current.forEach((t) => clearTimeout(t));
    timeouts.current = [];
    setAnimating(false);
  }, [n]);

  useEffect(() => {
    return () => {
      timeouts.current.forEach((t) => clearTimeout(t));
      timeouts.current = [];
    };
  }, []);

  // helper: convert pair to grid position
  const svgSize = 640;
  const margin = 40;
  const gridSize = svgSize - margin * 2;
  const cell = n > 1 ? gridSize / (n - 1) : 0;

  function posForPair([a, b]) {
    // a along X (0..n-1 left->right), b along Y (0..n-1 bottom->top)
    const x = margin + a * cell;
    // invert y so that b=0 is bottom
    const y = margin + (n - 1 - b) * cell;
    return [x, y];
  }

  function clearAnimation() {
    timeouts.current.forEach((t) => clearTimeout(t));
    timeouts.current = [];
    setAnimating(false);
  }

  // animate drawing an array of directed edges, one at a time
  // optional onComplete callback runs after the last edge is drawn
  function animateEdges(edgeList, onComplete) {
    clearAnimation();
    setDrawnEdges([]);
    setDrawnHullSegments([]);
    setHullSegments([]);
    setAnimating(true);
    edgeList.forEach((e, i) => {
      const t = setTimeout(() => {
        setDrawnEdges((prev) => [...prev, e]);
        if (i === edgeList.length - 1) {
          setAnimating(false);
          if (typeof onComplete === 'function') onComplete();
        }
      }, i * delayMs);
      timeouts.current.push(t);
    });
  }

  // Given a start pair, compute its cycle and animate it (edges in order).
  // After the cycle animation completes, compute the convex hull of the
  // cycle's vertex positions (in pixel coords) and animate the hull overlay.
  function drawCycleFromPair(pair) {
    const normalized = [((pair[0] % n) + n) % n, ((pair[1] % n) + n) % n];
    const { cycle } = findCycleFrom(normalized, n);
    if (!cycle || cycle.length === 0) return;
    // create edge list for the cycle: cycle[i] -> nextPair(cycle[i])
    const edgeList = cycle.map((p) => ({ from: p, to: nextPair(p, n) }));

    const onComplete = () => {
      // map cycle pairs to pixel coordinates
      const pts = cycle.map((p) => posForPair(p));
      if (pts.length < 3) return;
      const hull = jarvisMarch(pts);
      if (!hull || hull.length === 0) return;
      const segs = [];
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        segs.push({ from: a, to: b });
      }
      setHullSegments(segs);
      // animate hull segments after a short pause
      setTimeout(() => animateHullSegments(segs), 120);
    };

    animateEdges(edgeList, onComplete);
  }

  function animateHullSegments(segs) {
    setDrawnHullSegments([]);
    segs.forEach((s, i) => {
      const t = setTimeout(() => {
        setDrawnHullSegments((prev) => [...prev, s]);
      }, i * Math.max(60, Math.floor(delayMs / 2)));
      timeouts.current.push(t);
    });
  }

  function handleVertexClick(pair) {
    setStartA(pair[0]);
    setStartB(pair[1]);
    drawCycleFromPair(pair);
  }

  function handleDrawStart() {
    drawCycleFromPair([startA, startB]);
  }

  function handleDrawAllEdges() {
    // draw all edges in some order: we'll just animate the edges array
    const shuffled = edges.slice();
    // optional: don't shuffle to keep deterministic
    animateEdges(shuffled);
  }

  return (
    <div className="fibograph-root">
      <div className="controls">
        <label>
          Modulus n:
          <input
            type="number"
            min={1}
            value={n}
            onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <label>
          Start A:
          <input
            type="number"
            value={startA}
            onChange={(e) => setStartA(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Start B:
          <input
            type="number"
            value={startB}
            onChange={(e) => setStartB(Number(e.target.value) || 0)}
          />
        </label>

        <label>
          Delay (ms):
          <input
            type="number"
            min={10}
            value={delayMs}
            onChange={(e) => setDelayMs(Math.max(10, Number(e.target.value) || 10))}
          />
        </label>

        <button onClick={handleDrawStart} disabled={animating}>
          Draw Cycle from Start
        </button>
        <button onClick={() => handleVertexClick([0, 1])} disabled={animating}>
          Quick: Draw Cycle from (0,1)
        </button>
        <button onClick={handleDrawAllEdges} disabled={animating}>
          Animate All Edges
        </button>
        <button
          onClick={() => {
            clearAnimation();
            setDrawnEdges([]);
          }}
        >
          Clear
        </button>
      </div>

      <svg className="fibograph-svg" viewBox={`0 0 ${svgSize} ${svgSize}`}>
        {/* background grid lines (optional) */}
        <rect x={0} y={0} width={svgSize} height={svgSize} fill="#fff" stroke="#ddd" />

        {/* all static edges (light) */}
        {edges.map((e) => {
          const [x1, y1] = posForPair(e.from);
          const [x2, y2] = posForPair(e.to);
          const key = `${pairKey(e.from)}->${pairKey(e.to)}`;
          return (
            <line
              key={key}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#eee"
              strokeWidth={1}
              markerEnd="url(#arrowhead-lite)"
            />
          );
        })}

        {/* drawn edges (animated/highlighted) */}
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#d33" />
          </marker>
          <marker id="arrowhead-lite" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#ddd" />
          </marker>
        </defs>

        {drawnEdges.map((e, i) => {
          const [x1, y1] = posForPair(e.from);
          const [x2, y2] = posForPair(e.to);
          const key = `drawn-${i}-${pairKey(e.from)}->${pairKey(e.to)}`;
          return (
            <line
              key={key}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#d33"
              strokeWidth={2}
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* hull overlay (animated) */}
        {drawnHullSegments.map((s, i) => {
          const [x1, y1] = s.from;
          const [x2, y2] = s.to;
          const key = `hull-${i}-${x1}-${y1}-${x2}-${y2}`;
          return (
            <line
              key={key}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#0a0"
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}

        {/* vertices (clickable) */}
        {vertices.map((v) => {
          const [x, y] = posForPair(v);
          const key = pairKey(v);
          const isStart = v[0] === ((startA % n) + n) % n && v[1] === ((startB % n) + n) % n;
          return (
            <g key={key} className="vertex" onClick={() => handleVertexClick(v)}>
              <circle cx={x} cy={y} r={isStart ? 6 : 4} fill={isStart ? '#2a9' : '#69c'} stroke="#234" />
              <text x={x + 8} y={y + 4} fontSize={10}>
                {`(${v[0]},${v[1]})`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">Click a vertex to animate its cycle (one line at a time).</div>
    </div>
  );
}

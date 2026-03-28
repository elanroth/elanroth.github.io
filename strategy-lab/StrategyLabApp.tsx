import { startTransition, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import { sampleStrategyLabDataset } from "./sampleSimulation";

type Orientation = "H" | "V";

type PlaceAction = {
  kind: "place";
  word: string;
  orientation: Orientation;
  start: [number, number];
  anchor: [number, number] | null;
  anchor_index: number;
  zipf?: number;
};

type DumpAction = {
  kind: "dump";
  letter: string;
};

type ReplayAction = PlaceAction | DumpAction;

type ReplayHistoryStep = {
  turn: number;
  rack: string[];
  bagRemaining: number;
  score: number;
  features: Record<string, number>;
  action: ReplayAction;
};

type ReplayEpisode = {
  success: boolean;
  turns: number;
  dumpsUsed: number;
  bagRemaining: number;
  rackRemaining: number;
  wordsPlayed: string[];
  meanWordZipf: number;
  zeroZipfWords: number;
  openingWord: string | null;
  openingLength: number;
  history: ReplayHistoryStep[];
  failureReason: string | null;
};

type ReplayDataset = {
  name: string;
  fitness: number | null;
  metrics: Record<string, number>;
  episodes: ReplayEpisode[];
  sourceLabel: string;
};

type BoardTile = {
  x: number;
  y: number;
  letter: string;
  isNew: boolean;
  isAnchor: boolean;
};

type ReplayFrame = {
  label: string;
  turn: number;
  board: BoardTile[];
  rackBefore: string[];
  bagBefore: number;
  score: number | null;
  features: Record<string, number>;
  action: ReplayAction | null;
  wordsPlayed: string[];
};

const SHELL_STYLE: CSSProperties = {
  minHeight: "100vh",
  color: "#1f2937",
  background: [
    "radial-gradient(circle at top left, rgba(255, 217, 102, 0.35), transparent 30%)",
    "radial-gradient(circle at top right, rgba(20, 184, 166, 0.18), transparent 28%)",
    "linear-gradient(180deg, #fff8e7 0%, #fffef8 42%, #f8fafc 100%)",
  ].join(", "),
  fontFamily: "\"Avenir Next\", \"Segoe UI\", sans-serif",
};

const PANEL_STYLE: CSSProperties = {
  borderRadius: 24,
  border: "1px solid rgba(120, 53, 15, 0.16)",
  background: "rgba(255, 252, 243, 0.86)",
  boxShadow: "0 24px 60px rgba(146, 64, 14, 0.12)",
  backdropFilter: "blur(10px)",
};

const BUTTON_STYLE: CSSProperties = {
  border: "1px solid rgba(120, 53, 15, 0.18)",
  borderRadius: 999,
  background: "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
  color: "#7c2d12",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.04em",
  padding: "10px 16px",
  textTransform: "uppercase",
};

const EMPTY_EPISODE: ReplayEpisode = {
  success: false,
  turns: 0,
  dumpsUsed: 0,
  bagRemaining: 0,
  rackRemaining: 0,
  wordsPlayed: [],
  meanWordZipf: 0,
  zeroZipfWords: 0,
  openingWord: null,
  openingLength: 0,
  history: [],
  failureReason: "no_data",
};

export function StrategyLabApp() {
  const [dataset, setDataset] = useState<ReplayDataset>(() => normalizeDataset(sampleStrategyLabDataset, "Bundled sample clip"));
  const [selectedEpisodeIndex, setSelectedEpisodeIndex] = useState(0);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedEpisode = dataset.episodes[Math.min(selectedEpisodeIndex, Math.max(0, dataset.episodes.length - 1))] ?? EMPTY_EPISODE;
  const frames = useMemo(() => buildFrames(selectedEpisode), [selectedEpisode]);
  const currentFrame = frames[Math.min(currentFrameIndex, Math.max(0, frames.length - 1))];
  const boardWindow = useMemo(() => computeBoardWindow(currentFrame.board), [currentFrame.board]);
  const topFeatures = useMemo(
    () =>
      Object.entries(currentFrame.features)
        .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]) || left[0].localeCompare(right[0]))
        .slice(0, 8),
    [currentFrame.features],
  );

  useEffect(() => {
    setCurrentFrameIndex(0);
    setIsPlaying(false);
  }, [dataset, selectedEpisodeIndex]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    if (currentFrameIndex >= frames.length - 1) {
      setIsPlaying(false);
      return undefined;
    }
    const handle = window.setTimeout(() => {
      setCurrentFrameIndex((index) => Math.min(index + 1, frames.length - 1));
    }, Math.max(180, 900 / speed));
    return () => window.clearTimeout(handle);
  }, [currentFrameIndex, frames.length, isPlaying, speed]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const next = normalizeDataset(raw, file.name);
      startTransition(() => {
        setDataset(next);
        setSelectedEpisodeIndex(0);
        setCurrentFrameIndex(0);
        setIsPlaying(false);
      });
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not parse the uploaded JSON.");
    } finally {
      event.target.value = "";
    }
  }

  function loadBundledSample() {
    startTransition(() => {
      setDataset(normalizeDataset(sampleStrategyLabDataset, "Bundled sample clip"));
      setSelectedEpisodeIndex(0);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
    });
    setUploadError(null);
  }

  const boardColumns = boardWindow.maxX - boardWindow.minX + 1;
  const boardRows = boardWindow.maxY - boardWindow.minY + 1;
  const cellSize = Math.max(28, Math.min(48, boardColumns > 10 || boardRows > 10 ? 32 : boardColumns > 7 || boardRows > 7 ? 38 : 46));
  const tileByKey = new Map(currentFrame.board.map((tile) => [coordKey(tile.x, tile.y), tile]));

  return (
    <div style={SHELL_STYLE}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 18px 36px", display: "grid", gap: 22 }}>
        <section
          style={{
            ...PANEL_STYLE,
            overflow: "hidden",
            position: "relative",
            padding: "30px 28px",
            background: [
              "radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 28%)",
              "radial-gradient(circle at bottom right, rgba(13, 148, 136, 0.12), transparent 30%)",
              "linear-gradient(160deg, rgba(255, 248, 220, 0.95) 0%, rgba(255, 252, 243, 0.96) 60%, rgba(247, 250, 252, 0.98) 100%)",
            ].join(", "),
          }}
        >
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(120,53,15,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(120,53,15,0.03) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "grid", gap: 22 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 900, color: "#0f766e" }}>Banagrams Strategy Lab</div>
              <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.03, fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif", color: "#7c2d12" }}>
                Replay genetic-strategy runs like film strips instead of log files.
              </h1>
              <p style={{ margin: 0, maxWidth: 820, color: "#5b4636", fontSize: 17, lineHeight: 1.7 }}>
                Load a lab export, scrub through each move, inspect the score features, and see where the policy leans on long openings,
                dense boards, or vowel-balance repair via dumps.
              </p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <button type="button" style={BUTTON_STYLE} onClick={loadBundledSample}>
                Load Bundled Sample
              </button>
              <label
                style={{
                  ...BUTTON_STYLE,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "linear-gradient(180deg, #ecfeff 0%, #ccfbf1 100%)",
                  color: "#115e59",
                }}
              >
                Upload Simulation JSON
                <input type="file" accept="application/json,.json" onChange={handleUpload} style={{ display: "none" }} />
              </label>
              <div style={{ color: "#6b4f3a", fontSize: 14 }}>
                Accepts <code>simulation.json</code> or <code>best_policy_episodes.json</code>.
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <MetricCard label="Dataset" value={dataset.name} accent="#0f766e" />
              <MetricCard label="Episodes" value={String(dataset.episodes.length)} accent="#92400e" />
              <MetricCard label="Fitness" value={formatMaybeNumber(dataset.fitness)} accent="#7c3aed" />
              <MetricCard label="Success Rate" value={formatMaybeNumber(dataset.metrics.success_rate, "0.0%")} accent="#1d4ed8" />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", color: "#6b4f3a", fontSize: 14 }}>
              <span style={{ fontWeight: 800 }}>Source:</span>
              <span>{dataset.sourceLabel}</span>
              {uploadError && <span style={{ color: "#b91c1c", fontWeight: 700 }}>{uploadError}</span>}
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)", gap: 22, alignItems: "start" }}>
          <div style={{ ...PANEL_STYLE, padding: 22, display: "grid", gap: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Replay Board</div>
                <div style={{ fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif", fontSize: 30, color: "#78350f", fontWeight: 700 }}>
                  {currentFrame.label}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" style={BUTTON_STYLE} onClick={() => setCurrentFrameIndex((index) => Math.max(0, index - 1))}>
                  Back
                </button>
                <button type="button" style={BUTTON_STYLE} onClick={() => setIsPlaying((playing) => !playing)}>
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" style={BUTTON_STYLE} onClick={() => setCurrentFrameIndex((index) => Math.min(frames.length - 1, index + 1))}>
                  Next
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={currentFrameIndex}
                onChange={(event) => setCurrentFrameIndex(Number(event.target.value))}
                style={{ width: "100%", accentColor: "#b45309" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 13, color: "#6b4f3a" }}>
                <span>
                  Frame {currentFrameIndex + 1} / {frames.length}
                </span>
                <span>
                  Episode {selectedEpisodeIndex + 1} / {dataset.episodes.length}
                </span>
                <span>Speed {speed.toFixed(1)}x</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[0.75, 1, 1.5, 2].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSpeed(option)}
                    style={{
                      ...BUTTON_STYLE,
                      background: option === speed ? "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)" : "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
                      color: option === speed ? "#fff7ed" : "#7c2d12",
                    }}
                  >
                    {option}x
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 18,
                border: "1px solid rgba(15, 118, 110, 0.16)",
                background: [
                  "radial-gradient(circle at top right, rgba(20, 184, 166, 0.12), transparent 30%)",
                  "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.92) 100%)",
                ].join(", "),
              }}
            >
              <div style={{ overflow: "auto", paddingBottom: 6 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    gridTemplateColumns: `repeat(${boardColumns}, ${cellSize}px)`,
                    width: "max-content",
                    margin: "0 auto",
                  }}
                >
                  {Array.from({ length: boardRows * boardColumns }, (_, index) => {
                    const x = boardWindow.minX + (index % boardColumns);
                    const y = boardWindow.minY + Math.floor(index / boardColumns);
                    const tile = tileByKey.get(coordKey(x, y));
                    return (
                      <div
                        key={coordKey(x, y)}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: 14,
                          border: tile ? "1px solid rgba(120,53,15,0.16)" : "1px dashed rgba(148, 163, 184, 0.28)",
                          background: tile
                            ? tile.isNew
                              ? "linear-gradient(180deg, #fef3c7 0%, #fdba74 100%)"
                              : "linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%)"
                            : "rgba(255,255,255,0.52)",
                          boxShadow: tile ? "0 10px 18px rgba(146,64,14,0.12)" : "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                          outline: tile?.isAnchor ? "2px solid rgba(13,148,136,0.55)" : "none",
                          color: tile ? "#78350f" : "transparent",
                          fontWeight: 900,
                          fontSize: cellSize * 0.48,
                        }}
                      >
                        {tile?.letter ?? "·"}
                        {tile && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 5,
                              right: 7,
                              fontSize: 9,
                              letterSpacing: "0.08em",
                              color: tile.isNew ? "#9a3412" : "#0f766e",
                              textTransform: "uppercase",
                              fontWeight: 900,
                            }}
                          >
                            {tile.isNew ? "new" : tile.isAnchor ? "anchor" : ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <MetricCard label="Bag Before Move" value={String(currentFrame.bagBefore)} accent="#9a3412" />
              <MetricCard label="Rack Before Move" value={currentFrame.rackBefore.join("") || "∅"} accent="#0f766e" />
              <MetricCard label="Move Score" value={formatMaybeNumber(currentFrame.score)} accent="#7c3aed" />
              <MetricCard label="Words Played" value={String(currentFrame.wordsPlayed.length)} accent="#1d4ed8" />
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ ...PANEL_STYLE, padding: 20, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Episode</div>
                  <div style={{ fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif", fontSize: 26, color: "#78350f", fontWeight: 700 }}>
                    #{selectedEpisodeIndex + 1}
                  </div>
                </div>
                <select
                  value={selectedEpisodeIndex}
                  onChange={(event) => setSelectedEpisodeIndex(Number(event.target.value))}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(120, 53, 15, 0.18)",
                    background: "white",
                    color: "#78350f",
                    fontWeight: 700,
                    padding: "10px 12px",
                  }}
                >
                  {dataset.episodes.map((episode, index) => (
                    <option key={`episode-${index}`} value={index}>
                      Episode {index + 1} · {episode.success ? "success" : episode.failureReason ?? "incomplete"}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <MetricCard label="Outcome" value={selectedEpisode.success ? "Success" : selectedEpisode.failureReason ?? "Stopped"} accent={selectedEpisode.success ? "#15803d" : "#b91c1c"} />
                <MetricCard label="Turns" value={String(selectedEpisode.turns)} accent="#92400e" />
                <MetricCard label="Dumps" value={String(selectedEpisode.dumpsUsed)} accent="#0f766e" />
                <MetricCard label="Mean Zipf" value={formatMaybeNumber(selectedEpisode.meanWordZipf)} accent="#1d4ed8" />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Action Focus</div>
                <div style={{ padding: 16, borderRadius: 18, background: "rgba(255,247,237,0.88)", border: "1px solid rgba(120,53,15,0.12)", display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#78350f", fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif" }}>
                    {describeAction(currentFrame.action)}
                  </div>
                  <div style={{ color: "#6b4f3a", fontSize: 14, lineHeight: 1.6 }}>
                    Turn {currentFrame.turn < 0 ? "setup" : currentFrame.turn}. The board shows the post-move state; amber tiles were placed on this frame.
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Top Scoring Features</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {topFeatures.length === 0 && (
                    <div style={{ padding: 14, borderRadius: 16, background: "rgba(255,255,255,0.72)", color: "#6b4f3a", border: "1px dashed rgba(120,53,15,0.18)" }}>
                      No feature scores on the setup frame yet.
                    </div>
                  )}
                  {topFeatures.map(([name, value]) => (
                    <div key={name} style={{ display: "grid", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#6b4f3a" }}>
                        <span style={{ fontWeight: 800 }}>{formatMetricLabel(name)}</span>
                        <span style={{ fontWeight: 700 }}>{value.toFixed(3)}</span>
                      </div>
                      <div style={{ height: 10, borderRadius: 999, background: "rgba(120,53,15,0.08)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, Math.max(12, Math.abs(value) * 16))}%`,
                            borderRadius: 999,
                            background: value >= 0 ? "linear-gradient(90deg, #14b8a6 0%, #0f766e 100%)" : "linear-gradient(90deg, #fb7185 0%, #be123c 100%)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...PANEL_STYLE, padding: 20, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Word Ribbon</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {currentFrame.wordsPlayed.length === 0 && (
                  <span style={{ color: "#6b4f3a", fontSize: 14 }}>No words played yet.</span>
                )}
                {currentFrame.wordsPlayed.map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid rgba(120,53,15,0.12)",
                      background: index === currentFrame.wordsPlayed.length - 1 ? "#fed7aa" : "#fff7ed",
                      color: "#7c2d12",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ ...PANEL_STYLE, padding: 20, display: "grid", gap: 10, maxHeight: 520, overflow: "auto" }}>
              <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Move Timeline</div>
              {selectedEpisode.history.map((step, index) => (
                <button
                  key={`timeline-${index}`}
                  type="button"
                  onClick={() => setCurrentFrameIndex(index + 1)}
                  style={{
                    borderRadius: 18,
                    border: currentFrameIndex === index + 1 ? "1px solid rgba(13,148,136,0.45)" : "1px solid rgba(120,53,15,0.10)",
                    background: currentFrameIndex === index + 1 ? "rgba(204,251,241,0.6)" : "rgba(255,255,255,0.72)",
                    textAlign: "left",
                    padding: "12px 14px",
                    cursor: "pointer",
                    display: "grid",
                    gap: 5,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#0f766e", fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Turn {step.turn}</span>
                    <span style={{ color: "#6b4f3a", fontSize: 12, fontWeight: 700 }}>{step.score.toFixed(2)}</span>
                  </div>
                  <div style={{ fontWeight: 900, color: "#78350f", fontSize: 16 }}>{describeAction(step.action)}</div>
                  <div style={{ color: "#6b4f3a", fontSize: 13 }}>
                    Rack: <strong>{step.rack.join("") || "∅"}</strong> · Bag: <strong>{step.bagRemaining}</strong>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: "14px 16px",
        border: "1px solid rgba(120,53,15,0.10)",
        background: "rgba(255,255,255,0.72)",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 900, color: accent }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#78350f", lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}

function normalizeDataset(raw: unknown, sourceLabel: string): ReplayDataset {
  if (Array.isArray(raw)) {
    const episodes = raw.map((episode) => normalizeEpisode(episode));
    return {
      name: "imported-episodes",
      fitness: null,
      metrics: summarizeEpisodes(episodes),
      episodes,
      sourceLabel,
    };
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Expected a JSON object or an array of episodes.");
  }

  const payload = raw as Record<string, unknown>;
  const episodesValue = payload.episodes;
  if (!Array.isArray(episodesValue)) {
    throw new Error("Expected an `episodes` array in the uploaded JSON.");
  }

  const episodes = episodesValue.map((episode) => normalizeEpisode(episode));
  return {
    name: typeof payload.name === "string" ? payload.name : "imported-simulation",
    fitness: typeof payload.fitness === "number" ? payload.fitness : null,
    metrics: normalizeMetrics(payload.metrics, episodes),
    episodes,
    sourceLabel,
  };
}

function normalizeMetrics(raw: unknown, episodes: ReplayEpisode[]): Record<string, number> {
  if (!raw || typeof raw !== "object") {
    return summarizeEpisodes(episodes);
  }
  const metrics: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      metrics[name] = value;
    }
  }
  return Object.keys(metrics).length > 0 ? metrics : summarizeEpisodes(episodes);
}

function normalizeEpisode(raw: unknown): ReplayEpisode {
  if (!raw || typeof raw !== "object") {
    throw new Error("Episode payload must be an object.");
  }
  const episode = raw as Record<string, unknown>;
  const historyValue = episode.history;
  if (!Array.isArray(historyValue)) {
    throw new Error("Episode is missing its `history` array.");
  }

  return {
    success: Boolean(episode.success),
    turns: toNumber(episode.turns),
    dumpsUsed: toNumber(episode.dumps_used ?? episode.dumpsUsed),
    bagRemaining: toNumber(episode.bag_remaining ?? episode.bagRemaining),
    rackRemaining: toNumber(episode.rack_remaining ?? episode.rackRemaining),
    wordsPlayed: normalizeStringArray(episode.words_played ?? episode.wordsPlayed),
    meanWordZipf: toNumber(episode.mean_word_zipf ?? episode.meanWordZipf),
    zeroZipfWords: toNumber(episode.zero_zipf_words ?? episode.zeroZipfWords),
    openingWord: typeof episode.opening_word === "string" ? episode.opening_word : typeof episode.openingWord === "string" ? episode.openingWord : null,
    openingLength: toNumber(episode.opening_length ?? episode.openingLength),
    failureReason:
      typeof episode.failure_reason === "string"
        ? episode.failure_reason
        : typeof episode.failureReason === "string"
          ? episode.failureReason
          : null,
    history: historyValue.map((item) => normalizeHistoryStep(item)),
  };
}

function normalizeHistoryStep(raw: unknown): ReplayHistoryStep {
  if (!raw || typeof raw !== "object") {
    throw new Error("History step must be an object.");
  }
  const step = raw as Record<string, unknown>;
  return {
    turn: toNumber(step.turn),
    rack: normalizeStringArray(step.rack),
    bagRemaining: toNumber(step.bag_remaining ?? step.bagRemaining),
    score: toNumber(step.score),
    features: normalizeNumericRecord(step.features),
    action: normalizeAction(step.action),
  };
}

function normalizeAction(raw: unknown): ReplayAction {
  if (!raw || typeof raw !== "object") {
    throw new Error("Action payload must be an object.");
  }
  const action = raw as Record<string, unknown>;
  if (action.kind === "dump") {
    return {
      kind: "dump",
      letter: typeof action.letter === "string" ? action.letter : "?",
    };
  }
  const start = normalizeCoord(action.start);
  return {
    kind: "place",
    word: typeof action.word === "string" ? action.word : "",
    orientation: action.orientation === "V" ? "V" : "H",
    start,
    anchor: normalizeOptionalCoord(action.anchor),
    anchor_index: toNumber(action.anchor_index ?? action.anchorIndex),
    zipf: typeof action.zipf === "number" ? action.zipf : undefined,
  };
}

function summarizeEpisodes(episodes: ReplayEpisode[]): Record<string, number> {
  if (episodes.length === 0) {
    return {};
  }
  return {
    success_rate: average(episodes.map((episode) => (episode.success ? 1 : 0))),
    avg_turns: average(episodes.map((episode) => episode.turns)),
    avg_dumps: average(episodes.map((episode) => episode.dumpsUsed)),
    avg_bag_remaining: average(episodes.map((episode) => episode.bagRemaining)),
    avg_rack_remaining: average(episodes.map((episode) => episode.rackRemaining)),
    avg_word_zipf: average(episodes.map((episode) => episode.meanWordZipf)),
    avg_opening_length: average(episodes.map((episode) => episode.openingLength)),
    avg_zero_zipf_words: average(episodes.map((episode) => episode.zeroZipfWords)),
    avg_words_played: average(episodes.map((episode) => episode.wordsPlayed.length)),
  };
}

function buildFrames(episode: ReplayEpisode): ReplayFrame[] {
  const board = new Map<string, { x: number; y: number; letter: string }>();
  const wordsPlayed: string[] = [];
  const initialRack = episode.history[0]?.rack ?? [];
  const initialBag = episode.history[0]?.bagRemaining ?? episode.bagRemaining;
  const frames: ReplayFrame[] = [
    {
      label: "Opening rack",
      turn: -1,
      board: [],
      rackBefore: initialRack,
      bagBefore: initialBag,
      score: null,
      features: {},
      action: null,
      wordsPlayed: [],
    },
  ];

  for (const step of episode.history) {
    const newlyPlaced = new Set<string>();
    let anchorKeyValue: string | null = null;
    if (step.action.kind === "place") {
      if (step.action.anchor) {
        anchorKeyValue = coordKey(step.action.anchor[0], step.action.anchor[1]);
      }
      const delta = step.action.orientation === "H" ? [1, 0] : [0, 1];
      for (let index = 0; index < step.action.word.length; index += 1) {
        const x = step.action.start[0] + delta[0] * index;
        const y = step.action.start[1] + delta[1] * index;
        if (step.action.anchor && index === step.action.anchor_index) {
          continue;
        }
        const key = coordKey(x, y);
        board.set(key, { x, y, letter: step.action.word[index] ?? "" });
        newlyPlaced.add(key);
      }
      wordsPlayed.push(step.action.word);
    }

    const snapshot = Array.from(board.values())
      .sort((left, right) => left.y - right.y || left.x - right.x)
      .map((tile) => ({
        ...tile,
        isNew: newlyPlaced.has(coordKey(tile.x, tile.y)),
        isAnchor: anchorKeyValue === coordKey(tile.x, tile.y),
      }));

    frames.push({
      label: describeAction(step.action),
      turn: step.turn,
      board: snapshot,
      rackBefore: step.rack,
      bagBefore: step.bagRemaining,
      score: step.score,
      features: step.features,
      action: step.action,
      wordsPlayed: [...wordsPlayed],
    });
  }

  return frames;
}

function computeBoardWindow(board: BoardTile[]) {
  if (board.length === 0) {
    return { minX: -3, maxX: 3, minY: -3, maxY: 3 };
  }
  let minX = board[0].x;
  let maxX = board[0].x;
  let minY = board[0].y;
  let maxY = board[0].y;
  for (const tile of board) {
    minX = Math.min(minX, tile.x);
    maxX = Math.max(maxX, tile.x);
    minY = Math.min(minY, tile.y);
    maxY = Math.max(maxY, tile.y);
  }
  minX -= 1;
  maxX += 1;
  minY -= 1;
  maxY += 1;

  while (maxX - minX + 1 < 7) {
    minX -= 1;
    maxX += 1;
  }
  while (maxY - minY + 1 < 7) {
    minY -= 1;
    maxY += 1;
  }

  return { minX, maxX, minY, maxY };
}

function describeAction(action: ReplayAction | null): string {
  if (action === null) {
    return "Setup";
  }
  if (action.kind === "dump") {
    return `Dump ${action.letter}`;
  }
  const direction = action.orientation === "H" ? "across" : "down";
  return `${action.word} ${direction}`;
}

function formatMetricLabel(name: string): string {
  return name.replaceAll("_", " ");
}

function formatMaybeNumber(value: number | null | undefined, mode: "plain" | "0.0%" = "plain"): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  if (mode === "0.0%") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}

function normalizeNumericRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[name] = value;
    }
  }
  return out;
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string");
}

function normalizeCoord(raw: unknown): [number, number] {
  if (!Array.isArray(raw) || raw.length < 2) {
    return [0, 0];
  }
  return [toNumber(raw[0]), toNumber(raw[1])];
}

function normalizeOptionalCoord(raw: unknown): [number, number] | null {
  if (raw == null) {
    return null;
  }
  return normalizeCoord(raw);
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function coordKey(x: number, y: number): string {
  return `${x}:${y}`;
}

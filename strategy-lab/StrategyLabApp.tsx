import { startTransition, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import { sampleStrategyLabDataset } from "./sampleSimulation";

type Orientation = "H" | "V";
type LaunchCommand = "train_ga" | "simulate";
type CommandFilter = "all" | LaunchCommand | "analyze_snapshots";
type DurationFilter = "all" | "short" | "medium" | "long" | "manual" | "legacy";
type PolicyKey = "baseline-random" | "baseline-strategy" | "baseline-frequency";

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

type RunSummary = {
  id: string;
  directoryName: string;
  title: string;
  command: "train_ga" | "simulate" | "analyze_snapshots";
  durationPreset: "short" | "medium" | "long" | "manual" | "legacy";
  createdAt: string;
  modifiedAt: string;
  hasUpload: boolean;
  uploadFile: string | null;
  relativePath: string;
  summary: {
    fitness: number | null;
    successRate: number | null;
    episodeCount: number | null;
  };
};

type JobProgress = {
  phase: string;
  detail: string;
  ratio: number;
  completedUnits: number;
  totalUnits: number;
  elapsedSeconds: number;
  etaSeconds: number;
  targetSeconds: number | null;
  progressText: string;
};

type RunningJob = {
  id: string;
  command: LaunchCommand;
  durationPreset: "short" | "medium" | "long" | "manual";
  policy: PolicyKey | null;
  status: "running" | "failed";
  pid: number | null;
  startedAt: string;
  finishedAt: string | null;
  lastMessage: string;
  progress: JobProgress | null;
  runName: string | null;
  batchLabel: string | null;
};

type RunsResponse = {
  savedRuns: RunSummary[];
  runningJobs: RunningJob[];
  artifactsRoot: string;
  serverTime: string;
};

type LibraryMode = "browse" | "compare";
type RunSortMode = "newest" | "fitness" | "success";

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
  border: "1px solid rgba(120, 53, 15, 0.12)",
  background: "rgba(255, 255, 255, 0.84)",
  boxShadow: "0 12px 30px rgba(146, 64, 14, 0.08)",
  backdropFilter: "blur(6px)",
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

const COMPACT_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  padding: "8px 12px",
  fontSize: 12,
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(120, 53, 15, 0.18)",
  background: "rgba(255,255,255,0.84)",
  color: "#78350f",
  fontSize: 14,
  padding: "12px 14px",
  outline: "none",
};

const SELECT_STYLE: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(120, 53, 15, 0.18)",
  background: "rgba(255,255,255,0.92)",
  color: "#78350f",
  fontWeight: 700,
  padding: "11px 12px",
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

const COMPARE_STORAGE_KEY = "strategy-lab-compared-runs";
const EST_TIMEZONE = "America/New_York";

export function StrategyLabApp() {
  const [dataset, setDataset] = useState<ReplayDataset>(() => normalizeDataset(sampleStrategyLabDataset, "Bundled sample clip"));
  const [selectedEpisodeIndex, setSelectedEpisodeIndex] = useState(0);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<RunSummary[]>([]);
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [artifactsRoot, setArtifactsRoot] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [launchCommand, setLaunchCommand] = useState<LaunchCommand>("train_ga");
  const [launchPolicy, setLaunchPolicy] = useState<PolicyKey>("baseline-frequency");
  const [batchCount, setBatchCount] = useState(1);
  const [launchingKey, setLaunchingKey] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [commandFilter, setCommandFilter] = useState<CommandFilter>("all");
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("browse");
  const [comparedRunIds, setComparedRunIds] = useState<string[]>([]);
  const [runSortMode, setRunSortMode] = useState<RunSortMode>("newest");

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
  const selectedRun = selectedRunId ? savedRuns.find((run) => run.id === selectedRunId) ?? null : null;
  const comparedRuns = useMemo(
    () => comparedRunIds.map((runId) => savedRuns.find((run) => run.id === runId)).filter((run): run is RunSummary => Boolean(run)),
    [comparedRunIds, savedRuns],
  );

  const filteredSavedRuns = useMemo(() => {
    const filtered = savedRuns.filter((run) =>
      matchesFilters(`${run.title} ${formatRunTitle(run)}`, run.command, run.durationPreset, searchText, commandFilter, durationFilter),
    );
    return filtered.sort((left, right) => {
      if (runSortMode === "fitness") {
        return (right.summary.fitness ?? -Infinity) - (left.summary.fitness ?? -Infinity);
      }
      if (runSortMode === "success") {
        return (right.summary.successRate ?? -Infinity) - (left.summary.successRate ?? -Infinity);
      }
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
  }, [savedRuns, searchText, commandFilter, durationFilter, runSortMode]);
  const filteredRunningJobs = useMemo(
    () =>
      runningJobs.filter((job) =>
        matchesFilters(
          `${formatCommand(job.command)} ${job.durationPreset} ${job.lastMessage}`,
          job.command,
          job.durationPreset,
          searchText,
          commandFilter,
          durationFilter,
        ),
      ),
    [runningJobs, searchText, commandFilter, durationFilter],
  );

  useEffect(() => {
    setCurrentFrameIndex(0);
    setIsPlaying(false);
  }, [dataset, selectedEpisodeIndex]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setComparedRunIds(parsed.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      setComparedRunIds([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(comparedRunIds));
  }, [comparedRunIds]);

  useEffect(() => {
    setComparedRunIds((current) => current.filter((runId) => savedRuns.some((run) => run.id === runId)));
  }, [savedRuns]);

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

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/runs");
        if (!response.ok) {
          throw new Error(`Could not load saved runs (${response.status}).`);
        }
        const payload = (await response.json()) as RunsResponse;
        if (cancelled) return;
        setSavedRuns(payload.savedRuns ?? []);
        setRunningJobs(payload.runningJobs ?? []);
        setArtifactsRoot(payload.artifactsRoot ?? null);
        setRunsError(null);
      } catch (error) {
        if (cancelled) return;
        setRunsError(error instanceof Error ? error.message : "Could not load the local run browser.");
      }
    }

    void refresh();
    const handle = window.setInterval(() => {
      void refresh();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, []);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const next = normalizeDataset(raw, file.name);
      startTransition(() => {
        setDataset(next);
        setSelectedRunId(null);
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
      setSelectedRunId(null);
      setSelectedEpisodeIndex(0);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
    });
    setUploadError(null);
  }

  async function openSavedRun(run: RunSummary) {
    if (!run.hasUpload) {
      setUploadError("That run does not include a replayable upload file.");
      return;
    }
    try {
      const response = await fetch(`/api/run-data?id=${encodeURIComponent(run.id)}`);
      if (!response.ok) {
        throw new Error(`Could not load ${formatRunTitle(run)}.`);
      }
      const raw = (await response.json()) as unknown;
      const next = normalizeDataset(raw, formatRunTitle(run));
      startTransition(() => {
        setDataset(next);
        setSelectedRunId(run.id);
        setSelectedEpisodeIndex(0);
        setCurrentFrameIndex(0);
        setIsPlaying(false);
      });
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not load that run.");
    }
  }

  async function launchBatch(durationPreset: "short" | "medium" | "long") {
    const requestKey = `${launchCommand}-${durationPreset}-${batchCount}`;
    setLaunchingKey(requestKey);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: launchCommand,
          durationPreset,
          policy: launchCommand === "simulate" ? launchPolicy : undefined,
          count: batchCount,
        }),
      });
      const payload = (await response.json()) as { error?: string; jobs?: RunningJob[] };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start the job.");
      }
      if (payload.jobs && payload.jobs.length > 0) {
        setRunningJobs((jobs) => {
          const next = payload.jobs.concat(jobs);
          return next.filter((job, index, list) => list.findIndex((item) => item.id === job.id) === index);
        });
      }
      setRunsError(null);
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : "Could not start the job.");
    } finally {
      setLaunchingKey(null);
    }
  }

  function toggleComparedRun(runId: string) {
    setComparedRunIds((current) => (current.includes(runId) ? current.filter((id) => id !== runId) : [...current, runId]));
  }

  function compareTopRuns(count: number) {
    const top = filteredSavedRuns.slice(0, Math.max(1, count)).map((run) => run.id);
    setComparedRunIds(top);
    setLibraryMode("compare");
  }

  const boardColumns = boardWindow.maxX - boardWindow.minX + 1;
  const boardRows = boardWindow.maxY - boardWindow.minY + 1;
  const cellSize = Math.max(28, Math.min(48, boardColumns > 10 || boardRows > 10 ? 32 : boardColumns > 7 || boardRows > 7 ? 38 : 46));
  const tileByKey = new Map(currentFrame.board.map((tile) => [coordKey(tile.x, tile.y), tile]));

  return (
    <div style={SHELL_STYLE}>
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "28px 18px 36px", display: "grid", gap: 22 }}>
        <section
          style={{
            ...PANEL_STYLE,
            overflow: "hidden",
            position: "relative",
            padding: "20px 22px",
            background: [
              "radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 28%)",
              "radial-gradient(circle at bottom right, rgba(13, 148, 136, 0.12), transparent 30%)",
              "linear-gradient(160deg, rgba(255, 248, 220, 0.95) 0%, rgba(255, 252, 243, 0.96) 60%, rgba(247, 250, 252, 0.98) 100%)",
            ].join(", "),
          }}
        >
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(120,53,15,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(120,53,15,0.03) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "grid", gap: 22, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 900, color: "#0f766e" }}>Banagrams Strategy Lab</div>
                <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05, fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif", color: "#7c2d12" }}>
                  Launch, track, and replay strategy runs without leaving the lab.
                </h1>
                <p style={{ margin: 0, maxWidth: 760, color: "#5b4636", fontSize: 15, lineHeight: 1.5 }}>
                  Every saved run is now browseable in the UI. Start short, medium, or long jobs from here, watch them move through the running queue, then open the finished replay with one click.
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
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <CompactStat label="Dataset" value={dataset.name} accent="#0f766e" />
                <CompactStat label="Episodes" value={String(dataset.episodes.length)} accent="#92400e" />
                <CompactStat label="Fitness" value={formatMaybeNumber(dataset.fitness)} accent="#7c3aed" />
                <CompactStat label="Success" value={formatMaybeNumber(dataset.metrics.success_rate, "0.0%") } accent="#1d4ed8" />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", color: "#6b4f3a", fontSize: 14 }}>
                <span style={{ fontWeight: 800 }}>Current Source:</span>
                <span>{selectedRun ? formatRunTitle(selectedRun) : formatSourceLabel(dataset.sourceLabel)}</span>
                {uploadError && <span style={{ color: "#b91c1c", fontWeight: 700 }}>{uploadError}</span>}
              </div>
            </div>

            <div style={{ ...PANEL_STYLE, padding: 20, display: "grid", gap: 14, alignSelf: "start", background: "rgba(255, 255, 255, 0.72)" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Launch Jobs</div>
                <div style={{ fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif", fontSize: 28, color: "#78350f", fontWeight: 700 }}>
                  Start runs from the browser
                </div>
                <div style={{ color: "#6b4f3a", fontSize: 14, lineHeight: 1.6 }}>
                  Jobs launched here can run in parallel. The running queue refreshes automatically, and finished runs drop into the saved library below.
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Command</span>
                  <select value={launchCommand} onChange={(event) => setLaunchCommand(event.target.value as LaunchCommand)} style={SELECT_STYLE}>
                    <option value="train_ga">Train GA</option>
                    <option value="simulate">Simulate</option>
                  </select>
                </label>

                {launchCommand === "simulate" && (
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Simulation Policy</span>
                    <select value={launchPolicy} onChange={(event) => setLaunchPolicy(event.target.value as PolicyKey)} style={SELECT_STYLE}>
                      <option value="baseline-frequency">Baseline Frequency</option>
                      <option value="baseline-strategy">Baseline Strategy</option>
                      <option value="baseline-random">Baseline Random</option>
                    </select>
                  </label>
                )}

                <div style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Presets</span>
                  <label style={{ display: "grid", gap: 6, maxWidth: 160 }}>
                    <span style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Batch Count</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={batchCount}
                      onChange={(event) => setBatchCount(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
                      style={{ ...INPUT_STYLE, padding: "10px 12px" }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["short", "medium", "long"] as const).map((preset) => {
                      const buttonKey = `${launchCommand}-${preset}-${batchCount}`;
                      return (
                        <button
                          key={buttonKey}
                          type="button"
                          onClick={() => void launchBatch(preset)}
                          disabled={launchingKey === buttonKey}
                          style={{
                            ...BUTTON_STYLE,
                            minWidth: 104,
                            opacity: launchingKey === buttonKey ? 0.6 : 1,
                            background: preset === "medium"
                              ? "linear-gradient(180deg, #fef3c7 0%, #fdba74 100%)"
                              : preset === "long"
                                ? "linear-gradient(180deg, #fde68a 0%, #f59e0b 100%)"
                                : "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
                          }}
                        >
                          {preset === "medium" ? "Med" : preset[0].toUpperCase() + preset.slice(1)} x{batchCount}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 18, background: "rgba(255,247,237,0.86)", border: "1px solid rgba(120,53,15,0.12)", color: "#6b4f3a", fontSize: 13, lineHeight: 1.6 }}>
                {launchCommand === "train_ga"
                  ? "Train GA presets still target roughly 1 minute, 10 minutes, and 30 minutes on this machine."
                  : "Simulate presets use progressively larger episode suites so the progress bar reflects completed episodes instead of elapsed wall time."}
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(330px, 0.92fr) minmax(0, 1.6fr)", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...PANEL_STYLE, padding: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Run Library</div>
                  <div style={{ fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif", fontSize: 24, color: "#78350f", fontWeight: 700 }}>
                    Watch and compare runs
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <FilterChip label="Browse" active={libraryMode === "browse"} onClick={() => setLibraryMode("browse")} />
                  <FilterChip label={`Compare (${comparedRuns.length})`} active={libraryMode === "compare"} onClick={() => setLibraryMode("compare")} />
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Filter by title, command, or note"
                  style={{ ...INPUT_STYLE, padding: "9px 11px", fontSize: 13 }}
                />
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["all", "train_ga", "simulate", "analyze_snapshots"] as const).map((option) => (
                      <FilterChip
                        key={option}
                        label={option === "all" ? "All Commands" : formatCommand(option)}
                        active={commandFilter === option}
                        onClick={() => setCommandFilter(option)}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["all", "short", "medium", "long", "manual", "legacy"] as const).map((option) => (
                      <FilterChip
                        key={option}
                        label={option === "all" ? "All Lengths" : formatPreset(option)}
                        active={durationFilter === option}
                        onClick={() => setDurationFilter(option)}
                      />
                    ))}
                  </div>
                </div>
                {runsError && (
                  <div style={{ padding: 14, borderRadius: 16, background: "rgba(254,226,226,0.88)", border: "1px solid rgba(185,28,28,0.14)", color: "#991b1b", fontSize: 13, lineHeight: 1.6 }}>
                    {runsError} The run browser and launcher require the standalone strategy-lab dev or preview server.
                  </div>
                )}
                {!runsError && !artifactsRoot && (
                  <div style={{ color: "#6b4f3a", fontSize: 12 }}>Run API currently unavailable.</div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: "#6b4f3a", fontSize: 12, fontWeight: 800 }}>Sort:</span>
                  <FilterChip label="Newest" active={runSortMode === "newest"} onClick={() => setRunSortMode("newest")} />
                  <FilterChip label="Best Fitness" active={runSortMode === "fitness"} onClick={() => setRunSortMode("fitness")} />
                  <FilterChip label="Best Success" active={runSortMode === "success"} onClick={() => setRunSortMode("success")} />
                </div>
                {libraryMode === "compare" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "#6b4f3a", fontSize: 12, fontWeight: 800 }}>Quick Select:</span>
                    <button type="button" style={COMPACT_BUTTON_STYLE} onClick={() => compareTopRuns(3)}>Top 3</button>
                    <button type="button" style={COMPACT_BUTTON_STYLE} onClick={() => compareTopRuns(5)}>Top 5</button>
                    <button
                      type="button"
                      style={{ ...COMPACT_BUTTON_STYLE, background: "linear-gradient(180deg, #fef2f2 0%, #fecaca 100%)", color: "#7f1d1d" }}
                      onClick={() => setComparedRunIds([])}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>

            {libraryMode === "compare" && <ComparePanel runs={comparedRuns} />}

            <div style={{ ...PANEL_STYLE, padding: 14, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Running</div>
                <div style={{ color: "#6b4f3a", fontSize: 13 }}>{filteredRunningJobs.length} visible</div>
              </div>

              {filteredRunningJobs.length === 0 && (
                <div style={{ padding: 12, borderRadius: 14, border: "1px dashed rgba(120,53,15,0.16)", color: "#6b4f3a", background: "rgba(255,255,255,0.66)", fontSize: 13 }}>
                  No running jobs match the current filters.
                </div>
              )}

              {filteredRunningJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            <div style={{ ...PANEL_STYLE, padding: 14, display: "grid", gap: 10, maxHeight: 560, overflow: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Saved Runs</div>
                <div style={{ color: "#6b4f3a", fontSize: 13 }}>{filteredSavedRuns.length} visible</div>
              </div>

              {filteredSavedRuns.length === 0 && (
                <div style={{ padding: 12, borderRadius: 14, border: "1px dashed rgba(120,53,15,0.16)", color: "#6b4f3a", background: "rgba(255,255,255,0.66)", fontSize: 13 }}>
                  No saved runs match the current filters.
                </div>
              )}

              {filteredSavedRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  isSelected={selectedRunId === run.id}
                  compareMode={libraryMode === "compare"}
                  isCompared={comparedRunIds.includes(run.id)}
                  onToggleCompare={() => toggleComparedRun(run.id)}
                  onClick={() => {
                    if (libraryMode === "compare") {
                      toggleComparedRun(run.id);
                      return;
                    }
                    void openSavedRun(run);
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 22 }}>
            <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <MetricCard label="Open Episode" value={`#${selectedEpisodeIndex + 1}`} accent="#9a3412" />
              <MetricCard label="Frames" value={String(frames.length)} accent="#0f766e" />
              <MetricCard label="Opening Word" value={selectedEpisode.openingWord ?? "—"} accent="#7c3aed" />
              <MetricCard label="Mean Zipf" value={formatMaybeNumber(selectedEpisode.meanWordZipf)} accent="#1d4ed8" />
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 22, alignItems: "start" }}>
              <div style={{ ...PANEL_STYLE, padding: 22, display: "grid", gap: 18 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Replay Board</div>
                    <div
                      title={currentFrame.label}
                      style={{
                        fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif",
                        fontSize: 30,
                        color: "#78350f",
                        fontWeight: 700,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {currentFrame.label}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button type="button" style={COMPACT_BUTTON_STYLE} onClick={() => setCurrentFrameIndex((index) => Math.max(0, index - 1))}>
                      Back
                    </button>
                    <button type="button" style={COMPACT_BUTTON_STYLE} onClick={() => setIsPlaying((playing) => !playing)}>
                      {isPlaying ? "Pause" : "Play"}
                    </button>
                    <button type="button" style={COMPACT_BUTTON_STYLE} onClick={() => setCurrentFrameIndex((index) => Math.min(frames.length - 1, index + 1))}>
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
                          ...COMPACT_BUTTON_STYLE,
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
                      style={{ ...SELECT_STYLE, maxWidth: "100%", width: "100%", minWidth: 0 }}
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

function CompactStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "10px 12px",
        border: "1px solid rgba(120,53,15,0.1)",
        background: "rgba(255,255,255,0.74)",
        display: "grid",
        gap: 3,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 900, color: accent }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#78350f", lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...BUTTON_STYLE,
        padding: "6px 10px",
        fontSize: 10,
        background: active ? "linear-gradient(180deg, #14b8a6 0%, #0f766e 100%)" : "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
        color: active ? "#f0fdfa" : "#7c2d12",
      }}
    >
      {label}
    </button>
  );
}

function ComparePanel({ runs }: { runs: RunSummary[] }) {
  const averageFitness = runs.length > 0
    ? runs.reduce((total, run) => total + (run.summary.fitness ?? 0), 0) / runs.length
    : null;
  const averageSuccess = runs.length > 0
    ? runs.reduce((total, run) => total + (run.summary.successRate ?? 0), 0) / runs.length
    : null;
  const bestRun = runs
    .filter((run) => run.summary.fitness != null)
    .sort((left, right) => (right.summary.fitness ?? -Infinity) - (left.summary.fitness ?? -Infinity))[0] ?? null;
  const sparklinePoints = buildSparklinePoints(runs.map((run) => run.summary.fitness).filter((value): value is number => value != null));

  return (
    <div style={{ ...PANEL_STYLE, padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 900, color: "#9a3412" }}>Compare Summary</div>
        <div style={{ color: "#6b4f3a", fontSize: 12 }}>{runs.length} selected</div>
      </div>
      {runs.length === 0 && <div style={{ color: "#6b4f3a", fontSize: 13 }}>Select runs to compare fitness and success trends.</div>}
      {runs.length > 0 && (
        <>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <MiniStat label="Avg Fitness" value={formatMaybeNumber(averageFitness)} />
            <MiniStat label="Avg Success" value={formatMaybeNumber(averageSuccess, "0.0%")} />
            <MiniStat label="Best Run" value={bestRun ? truncateText(formatRunTitle(bestRun), 14) : "—"} />
          </div>
          <div style={{ borderRadius: 12, border: "1px solid rgba(120,53,15,0.1)", background: "rgba(255,255,255,0.72)", padding: "8px 10px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9a3412" }}>Fitness Trend</div>
            {sparklinePoints ? (
              <svg viewBox="0 0 220 44" style={{ width: "100%", height: 44, overflow: "visible" }} aria-label="Fitness trend sparkline">
                <polyline
                  fill="none"
                  stroke="#0f766e"
                  strokeWidth="2.5"
                  points={sparklinePoints}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div style={{ color: "#6b4f3a", fontSize: 12 }}>No fitness points yet.</div>
            )}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {runs.slice(0, 8).map((run) => (
              <div key={run.id} style={{ display: "grid", gap: 6, borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(120,53,15,0.1)", background: "rgba(255,255,255,0.7)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "#78350f", fontWeight: 800, fontSize: 13 }}>{truncateText(formatRunTitle(run), 34)}</span>
                  <span style={{ color: "#6b4f3a", fontSize: 12 }}>{formatDate(run.createdAt)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(120,53,15,0.08)" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(8, Math.min(100, ((run.summary.successRate ?? 0) * 100)))}%`,
                      borderRadius: 999,
                      background: "linear-gradient(90deg, #14b8a6 0%, #0f766e 100%)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RunCard({
  run,
  isSelected,
  compareMode,
  isCompared,
  onToggleCompare,
  onClick,
}: {
  run: RunSummary;
  isSelected: boolean;
  compareMode: boolean;
  isCompared: boolean;
  onToggleCompare: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 16,
        border: isCompared || isSelected ? "1px solid rgba(13,148,136,0.45)" : "1px solid rgba(120,53,15,0.12)",
        background: isCompared || isSelected ? "rgba(204,251,241,0.42)" : "rgba(255,255,255,0.72)",
        padding: 12,
        textAlign: "left",
        cursor: "pointer",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ color: "#78350f", fontWeight: 900, fontSize: 16 }}>{formatRunTitle(run)}</div>
          <div style={{ color: "#6b4f3a", fontSize: 12 }}>{formatDate(run.createdAt)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {compareMode && (
            <input
              type="checkbox"
              checked={isCompared}
              onChange={onToggleCompare}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Compare ${formatRunTitle(run)}`}
            />
          )}
          <Tag label={formatCommand(run.command)} tone="#0f766e" />
          <Tag label={formatPreset(run.durationPreset)} tone="#9a3412" />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <MiniStat compact label="Fitness" value={formatMaybeNumber(run.summary.fitness)} />
        <MiniStat compact label="Success" value={formatMaybeNumber(run.summary.successRate, "0.0%") } />
        <MiniStat compact label="Episodes" value={run.summary.episodeCount == null ? "—" : String(run.summary.episodeCount)} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", flexWrap: "wrap", color: "#6b4f3a", fontSize: 12 }}>
        <span style={{ fontWeight: 800, color: run.hasUpload ? "#0f766e" : "#b91c1c" }}>{run.hasUpload ? "Replay ready" : "No upload file"}</span>
      </div>
    </button>
  );
}

function JobCard({ job }: { job: RunningJob }) {
  const ratio = job.progress ? Math.max(0.02, Math.min(1, job.progress.ratio)) : 0.12;

  return (
    <div
      style={{
        borderRadius: 16,
        border: job.status === "failed" ? "1px solid rgba(185,28,28,0.18)" : "1px solid rgba(120,53,15,0.12)",
        background: job.status === "failed" ? "rgba(254,242,242,0.88)" : "rgba(255,255,255,0.72)",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ color: "#78350f", fontWeight: 900, fontSize: 16 }}>
            {formatCommand(job.command)} · {formatPreset(job.durationPreset)}
          </div>
          <div style={{ color: "#6b4f3a", fontSize: 12 }}>{formatDate(job.startedAt)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Tag label={job.status === "failed" ? "Failed" : "Running"} tone={job.status === "failed" ? "#b91c1c" : "#0f766e"} />
          {job.batchLabel && <Tag label={job.batchLabel} tone="#475569" />}
          {job.policy && <Tag label={job.policy.replace("baseline-", "")} tone="#9a3412" />}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ height: 12, borderRadius: 999, overflow: "hidden", background: "rgba(120,53,15,0.08)" }}>
          <div
            style={{
              height: "100%",
              width: `${ratio * 100}%`,
              borderRadius: 999,
              background: job.status === "failed" ? "linear-gradient(90deg, #fda4af 0%, #e11d48 100%)" : "linear-gradient(90deg, #14b8a6 0%, #0f766e 100%)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: "#6b4f3a", fontSize: 12 }}>
          <span>{job.progress?.progressText ?? job.lastMessage}</span>
          <span>ETA {formatDuration(job.progress?.etaSeconds)}</span>
        </div>
      </div>
    </div>
  );
}

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.82)",
        border: `1px solid ${tone}22`,
        color: tone,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function MiniStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div
      style={{
        borderRadius: compact ? 12 : 16,
        background: "rgba(255,247,237,0.78)",
        border: "1px solid rgba(120,53,15,0.08)",
        padding: compact ? "8px 10px" : "10px 12px",
        display: "grid",
        gap: compact ? 3 : 4,
      }}
    >
      <div style={{ color: "#9a3412", fontSize: compact ? 10 : 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "#78350f", fontSize: compact ? 14 : 16, fontWeight: 900 }}>{value}</div>
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

function formatCommand(command: CommandFilter): string {
  if (command === "train_ga") return "Train GA";
  if (command === "simulate") return "Simulate";
  if (command === "analyze_snapshots") return "Snapshot Analysis";
  return "All";
}

function formatPreset(preset: DurationFilter): string {
  if (preset === "medium") return "Med";
  if (preset === "legacy") return "Legacy";
  if (preset === "manual") return "Manual";
  if (preset === "all") return "All";
  return preset[0].toUpperCase() + preset.slice(1);
}

function formatRunTitle(run: Pick<RunSummary, "title" | "command" | "durationPreset" | "createdAt">): string {
  const raw = run.title.trim();
  if (!raw) {
    return `${formatCommand(run.command)} ${formatPreset(run.durationPreset)}`;
  }

  // Most auto-generated run folders include dense timestamps and separators.
  const normalized = raw.toLowerCase();
  const looksGenerated =
    /\d{6,}/.test(normalized) ||
    /\d{2}-\d{2}-\d{2}\s\d{2}-\d{2}/.test(normalized) ||
    normalized.startsWith("train-") ||
    normalized.startsWith("simulate-") ||
    normalized.includes("_ga-");

  if (!looksGenerated) {
    return raw;
  }

  return `${formatCommand(run.command)} ${formatPreset(run.durationPreset)} · ${formatDate(run.createdAt)}`;
}

function formatSourceLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "Loaded data";
  }
  const lower = trimmed.toLowerCase();
  if (lower.endsWith(".json")) {
    return "Uploaded JSON";
  }
  if (lower.startsWith("bundled sample")) {
    return "Bundled sample";
  }
  if (lower === "imported-episodes" || lower === "imported-simulation") {
    return "Imported run";
  }
  return trimmed;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  const datePart = parsed.toLocaleDateString("en-US", {
    timeZone: EST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = parsed.toLocaleTimeString("en-US", {
    timeZone: EST_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(" AM", "a").replace(" PM", "p");
  return `${datePart} ${timePart} EST`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}

function buildSparklinePoints(values: number[]): string | null {
  if (values.length < 2) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 220;
  const height = 44;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return "—";
  }
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function matchesFilters(
  text: string,
  command: CommandFilter,
  durationPreset: DurationFilter,
  searchText: string,
  commandFilter: CommandFilter,
  durationFilter: DurationFilter,
): boolean {
  const needle = searchText.trim().toLowerCase();
  if (commandFilter !== "all" && command !== commandFilter) {
    return false;
  }
  if (durationFilter !== "all" && durationPreset !== durationFilter) {
    return false;
  }
  if (!needle) {
    return true;
  }
  return text.toLowerCase().includes(needle);
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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  alphabetLetters,
  analyzePatternsWithProgress,
  buildIndexes,
  buildWordRecords,
  formatNumber,
  normalizePattern,
  normalizeWord,
  runQuery,
  type AnalysisProgressUpdate,
  type AnalysisResult,
  type PatternStats,
  type RankedWord,
  type SortDirection,
  type SortKey,
  type WordRecord,
} from "./datastructure";

type LoadMetrics = {
  wordFetchMs: number;
  wordDecompressMs: number;
  wordParseMs: number;
  wordCount: number;
  wordRejected: number;
  zipfFetchMs: number;
  zipfDecompressMs: number;
  zipfParseMs: number;
  zipfCount: number;
  attachMs: number;
  indexMs: number;
};

type HintCell = {
  letter: string;
  total: number;
};

const DEFAULT_TOP_N = 20;
const WORDLIST_PATH = "wordswords/wordlist.txt";
const ZIPF_PATH = "wordswords/zipf.tsv";
const USE_ZIPF = true;
const ANALYSIS_MAX_N = 8;

function getAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(`${base}${path}`, window.location.origin).toString();
}

async function fetchTextMaybeGzip(url: string) {
  const fetchStart = performance.now();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const buf = await resp.arrayBuffer();
  const fetchMs = performance.now() - fetchStart;

  const decompressStart = performance.now();
  let text = "";
  if (url.endsWith(".gz") && "DecompressionStream" in window) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  const decompressMs = performance.now() - decompressStart;
  return { text, fetchMs, decompressMs, byteLength: buf.byteLength };
}

function parseWordList(text: string) {
  const raw = text.split(/\r?\n/);
  const words: string[] = [];
  let rejected = 0;
  for (const line of raw) {
    const word = normalizeWord(line);
    if (!word) continue;
    if (!/^[a-z]+$/.test(word)) {
      rejected += 1;
      continue;
    }
    words.push(word);
  }
  return { words, rejected };
}

function parseZipf(text: string) {
  const map = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [word, zipfRaw] = trimmed.split(/\t|\s{2,}/);
    if (!word || !zipfRaw) continue;
    const zipf = Number(zipfRaw);
    if (!Number.isFinite(zipf)) continue;
    map.set(word.toLowerCase(), zipf);
  }
  return map;
}

function LogPanel({ metrics }: { metrics: LoadMetrics | null }) {
  if (!metrics) return null;
  const totalMs =
    metrics.wordFetchMs +
    metrics.wordDecompressMs +
    metrics.wordParseMs +
    metrics.zipfFetchMs +
    metrics.zipfDecompressMs +
    metrics.zipfParseMs +
    metrics.attachMs +
    metrics.indexMs;
  const stagePairs = [
    { label: "wordlist fetch", ms: metrics.wordFetchMs },
    { label: "wordlist decompress", ms: metrics.wordDecompressMs },
    { label: "wordlist parse", ms: metrics.wordParseMs },
    { label: "zipf fetch", ms: metrics.zipfFetchMs },
    { label: "zipf decompress", ms: metrics.zipfDecompressMs },
    { label: "zipf parse", ms: metrics.zipfParseMs },
    { label: "attach", ms: metrics.attachMs },
    { label: "index", ms: metrics.indexMs },
  ];
  const slowest = [...stagePairs].sort((a, b) => b.ms - a.ms)[0];
  const rows = [
    { label: "wordlist fetch", value: `${metrics.wordFetchMs.toFixed(1)} ms` },
    { label: "wordlist decompress", value: `${metrics.wordDecompressMs.toFixed(1)} ms` },
    { label: "wordlist parse", value: `${metrics.wordParseMs.toFixed(1)} ms` },
    { label: "word count", value: `${metrics.wordCount}` },
    { label: "word rejected", value: `${metrics.wordRejected}` },
    { label: "zipf fetch", value: `${metrics.zipfFetchMs.toFixed(1)} ms` },
    { label: "zipf decompress", value: `${metrics.zipfDecompressMs.toFixed(1)} ms` },
    { label: "zipf parse", value: `${metrics.zipfParseMs.toFixed(1)} ms` },
    { label: "zipf entries", value: `${metrics.zipfCount}` },
    { label: "attach", value: `${metrics.attachMs.toFixed(1)} ms` },
    { label: "index", value: `${metrics.indexMs.toFixed(1)} ms` },
    { label: "total prep", value: `${totalMs.toFixed(1)} ms` },
    { label: "slowest stage", value: `${slowest.label} (${slowest.ms.toFixed(1)} ms)` },
  ];
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.4)", borderRadius: 14, padding: 16, background: "rgba(15,23,42,0.75)", color: "#e2e8f0" }}>
      <div style={{ fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12, color: "#f8fafc" }}>Structured Logs</div>
      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)", color: "#cbd5f5", fontSize: 12 }}>
        {`Loaded ${formatNumber(metrics.wordCount)} words in ${totalMs.toFixed(1)} ms`}
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "#94a3b8" }}>{row.label}</span>
            <span style={{ fontWeight: 700 }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultRow({ item, idx }: { item: RankedWord; idx: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr 80px 70px",
        alignItems: "center",
        padding: "6px 12px",
        borderBottom: "1px solid rgba(148,163,184,0.2)",
        background: idx % 2 === 0 ? "rgba(15,23,42,0.35)" : "rgba(15,23,42,0.2)",
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>{idx + 1}</div>
      <div style={{ fontWeight: 700, color: "#f8fafc", letterSpacing: "0.04em" }}>{item.word}</div>
      <div style={{ textAlign: "right", color: "#38bdf8", fontWeight: 700 }}>{item.zipf.toFixed(2)}</div>
      <div style={{ textAlign: "right", color: "#fbbf24", fontWeight: 700 }}>{item.gap}</div>
    </div>
  );
}

export function WordsWordsApp() {
  const [activeTab, setActiveTab] = useState<"finder" | "analysis">("finder");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [records, setRecords] = useState<WordRecord[]>([]);
  const [metrics, setMetrics] = useState<LoadMetrics | null>(null);
  const [pattern, setPattern] = useState("");
  const [debouncedPattern, setDebouncedPattern] = useState("");
  const [results, setResults] = useState<RankedWord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showHints, setShowHints] = useState(true);
  const [restrictiveMode, setRestrictiveMode] = useState(false);
  const [hints, setHints] = useState<HintCell[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [analysisN, setAnalysisN] = useState(3);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<number, AnalysisResult>>({});
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressUpdate>({ stage: "init", progress: 0 });
  const [analysisSections, setAnalysisSections] = useState<string[]>([
    "most",
    "fewest",
    "zipf",
    "hard",
    "rare",
    "branch-one",
    "branch-high",
    "alternating",
    "structure",
    "vowels",
  ]);

  const activeProcedure = "automaton";

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedPattern(pattern);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [pattern]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const wordUrl = getAssetUrl(WORDLIST_PATH);
        const zipfUrl = getAssetUrl(ZIPF_PATH);

        const wordFetch = await fetchTextMaybeGzip(wordUrl);
        const wordParseStart = performance.now();
        const { words, rejected } = parseWordList(wordFetch.text);
        const wordParseMs = performance.now() - wordParseStart;

        let zipfFetchMs = 0;
        let zipfDecompressMs = 0;
        let zipfParseMs = 0;
        let zipfCount = 0;
        let zipfMap = new Map<string, number>();

        if (USE_ZIPF) {
          const zipfFetch = await fetchTextMaybeGzip(zipfUrl);
          zipfFetchMs = zipfFetch.fetchMs;
          zipfDecompressMs = zipfFetch.decompressMs;
          const zipfParseStart = performance.now();
          zipfMap = parseZipf(zipfFetch.text);
          zipfParseMs = performance.now() - zipfParseStart;
          zipfCount = zipfMap.size;
        }

        const attachStart = performance.now();
        const built = buildWordRecords(words, zipfMap);
        const attachMs = performance.now() - attachStart;

        const indexStart = performance.now();
        buildIndexes(built);
        const indexMs = performance.now() - indexStart;

        const nextMetrics: LoadMetrics = {
          wordFetchMs: wordFetch.fetchMs,
          wordDecompressMs: wordFetch.decompressMs,
          wordParseMs,
          wordCount: words.length,
          wordRejected: rejected,
          zipfFetchMs,
          zipfDecompressMs,
          zipfParseMs,
          zipfCount,
          attachMs,
          indexMs,
        };

        console.groupCollapsed("[wordswords:load]");
        console.log("wordlist", { url: wordUrl, bytes: wordFetch.byteLength, words: words.length, rejected });
        console.log("zipf", USE_ZIPF ? { url: zipfUrl, entries: zipfMap.size } : { disabled: true });
        console.table([
          { stage: "fetch wordlist", ms: nextMetrics.wordFetchMs.toFixed(1) },
          { stage: "decompress wordlist", ms: nextMetrics.wordDecompressMs.toFixed(1) },
          { stage: "parse wordlist", ms: nextMetrics.wordParseMs.toFixed(1) },
          { stage: "fetch zipf", ms: nextMetrics.zipfFetchMs.toFixed(1) },
          { stage: "decompress zipf", ms: nextMetrics.zipfDecompressMs.toFixed(1) },
          { stage: "parse zipf", ms: nextMetrics.zipfParseMs.toFixed(1) },
          { stage: "attach", ms: nextMetrics.attachMs.toFixed(1) },
          { stage: "index", ms: nextMetrics.indexMs.toFixed(1) },
        ]);
        console.groupEnd();

        if (!cancelled) {
          setRecords(built);
          setMetrics(nextMetrics);
          setStatus("ready");
        }
      } catch (err) {
        console.log("[wordswords:error]", { error: String(err) });
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "analysis") return;
    if (status !== "ready" || records.length === 0) return;
    const cached = analysisCache[analysisN];
    if (cached) {
      setAnalysis(cached);
      setAnalysisStatus("ready");
      return;
    }
    let cancelled = false;
    setAnalysisStatus("loading");
    const handle = window.setTimeout(async () => {
      try {
        const result = await analyzePatternsWithProgress(records, analysisN, (update) => {
          if (!cancelled) setAnalysisProgress(update);
        });
        if (!cancelled) {
          setAnalysis(result);
          setAnalysisCache((prev) => ({ ...prev, [analysisN]: result }));
          setAnalysisStatus("ready");
        }
      } catch (err) {
        console.log("[wordswords:analysis-error]", { error: String(err) });
        if (!cancelled) setAnalysisStatus("error");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [activeTab, analysisCache, analysisN, records, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const normalized = normalizePattern(debouncedPattern);
    if (!normalized) {
      setResults([]);
      setTotalCount(0);
      return;
    }
    const run = runQuery(records, normalized, topN, activeProcedure, sortKey, sortDirection, restrictiveMode);
    setResults(run.results);
    setTotalCount(run.total);
  }, [records, debouncedPattern, status, activeProcedure, topN, sortKey, sortDirection, restrictiveMode]);

  useEffect(() => {
    if (!showHints || status !== "ready") {
      setHints([]);
      return;
    }
    const base = normalizePattern(debouncedPattern);
    if (!base) {
      setHints([]);
      return;
    }
    let cancelled = false;
    const run = () => {
      const next = alphabetLetters().map((letter) => {
        const res = runQuery(records, base + letter, topN, activeProcedure, sortKey, sortDirection, restrictiveMode);
        return { letter, total: res.total };
      });
      if (!cancelled) setHints(next);
    };
    const handle = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [debouncedPattern, records, showHints, status, activeProcedure, topN, sortKey, sortDirection, restrictiveMode]);

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "zipf" ? "desc" : "asc");
    }
  };

  const sortLabel = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  const listHeight = 420;
  const rowHeight = 44;
  const totalHeight = results.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endIndex = Math.min(results.length, startIndex + Math.ceil(listHeight / rowHeight) + 6);
  const visible = results.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  const heroTagline = useMemo(() => {
    if (status === "loading") return "Loading dictionaries...";
    if (status === "error") return "Could not load word data.";
    if (records.length === 0) return "Word list is empty. Drop your SCOWL/ENABLE list into public/wordswords/wordlist.txt";
    return "Subsequence search with a rank-aware heap.";
  }, [status, records.length]);

  const analysisStageOrder: Array<AnalysisProgressUpdate["stage"]> = ["init", "collect", "branch", "finalize"];
  const analysisStageLabels: Record<AnalysisProgressUpdate["stage"], string> = {
    init: "Initialize pattern buckets",
    collect: "Scan words + build counts",
    branch: "Compute branching factors",
    finalize: "Finalize stats + rankings",
  };
  const analysisStageIndex = analysisStageOrder.indexOf(analysisProgress.stage);
  const analysisOverall = Math.min(
    1,
    Math.max(0, (analysisStageIndex + analysisProgress.progress) / analysisStageOrder.length)
  );
  const analysisPatternsFound = analysisProgress.patternsFound ?? 0;

  const analysisStats = analysis?.byN[analysisN] ?? [];
  const totalPatterns = analysis?.totalPatterns[analysisN] ?? 0;
  const nonZeroPatterns = analysis?.nonZeroPatterns[analysisN] ?? 0;

  const topByCount = [...analysisStats].sort((a, b) => b.count - a.count).slice(0, 5);
  const fewestNonZero = [...analysisStats].sort((a, b) => a.count - b.count).slice(0, 5);
  const topByZipf = [...analysisStats].sort((a, b) => b.topZipf - a.topZipf).slice(0, 5);
  const hardest = [...analysisStats]
    .sort((a, b) => (a.count !== b.count ? a.count - b.count : a.topZipf - b.topZipf))
    .slice(0, 5);
  const rareLetterPatterns = [...analysisStats].filter((s) => s.hasRare).sort((a, b) => b.count - a.count).slice(0, 5);
  const branchingOne = [...analysisStats].filter((s) => s.branchCount === 1).sort((a, b) => a.count - b.count).slice(0, 5);
  const branchingHigh = [...analysisStats].sort((a, b) => b.branchCount - a.branchCount).slice(0, 5);
  const alternating = [...analysisStats].filter((s) => s.isAlternating).sort((a, b) => b.count - a.count).slice(0, 5);

  const vowelBuckets = useMemo(() => {
    const buckets: Record<number, PatternStats[]> = {};
    for (const stats of analysisStats) {
      if (!buckets[stats.vowelCount]) buckets[stats.vowelCount] = [];
      buckets[stats.vowelCount].push(stats);
    }
    for (const key of Object.keys(buckets)) {
      buckets[Number(key)].sort((a, b) => b.count - a.count);
    }
    return buckets;
  }, [analysisStats]);

  const structureBuckets = useMemo(() => {
    const buckets = new Map<string, PatternStats[]>();
    for (const stats of analysisStats) {
      const list = buckets.get(stats.structure) ?? [];
      list.push(stats);
      buckets.set(stats.structure, list);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => b.count - a.count);
    }
    return buckets;
  }, [analysisStats]);

  const renderPatternRow = (stats: PatternStats) => {
    const topWords = stats.topWords.map((w) => w.word).join(", ");
    return (
      <div
        key={stats.pattern}
        style={{
          display: "grid",
          gridTemplateColumns: "80px 1fr 130px 120px 110px 120px",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(15,23,42,0.45)",
          border: "1px solid rgba(148,163,184,0.25)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.08em" }}>{stats.pattern.toUpperCase()}</div>
        <div style={{ display: "grid", gap: 4, fontSize: 12, color: "#cbd5f5" }}>
          <div>{`Top: ${topWords || "-"}`}</div>
          <div>{`Best gap: ${stats.bestGapWord || "-"} (${stats.bestGap === Number.POSITIVE_INFINITY ? "-" : stats.bestGap})`}</div>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{`Matches ${formatNumber(stats.count)}`}</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{`Median gap ${stats.medianGap}`}</div>
        <div style={{ fontSize: 12, color: stats.branchCount === 1 ? "#fbbf24" : "#94a3b8", fontWeight: stats.branchCount === 1 ? 800 : 600 }}>
          {`Branch ${stats.branchCount}`}
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveTab("finder");
            setPattern(stats.pattern);
            setDebouncedPattern(stats.pattern);
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(56,189,248,0.4)",
            background: "rgba(56,189,248,0.12)",
            color: "#e2e8f0",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          View in Finder
        </button>
      </div>
    );
  };

  const renderSection = (title: string, items: PatternStats[], subtitle?: string) => (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 12, color: "#94a3b8" }}>{subtitle}</span>}
      </div>
      <div style={{ display: "grid", gap: 8 }}>{items.slice(0, 5).map(renderPatternRow)}</div>
    </section>
  );

  const analysisSectionOptions = [
    { id: "most", label: "Most matches" },
    { id: "fewest", label: "Fewest non-zero" },
    { id: "zipf", label: "Highest top Zipf" },
    { id: "hard", label: "Hardest" },
    { id: "rare", label: "Rare letters" },
    { id: "branch-one", label: "Branch = 1" },
    { id: "branch-high", label: "Branch high" },
    { id: "alternating", label: "Alternating VC" },
    { id: "structure", label: "Structure buckets" },
    { id: "vowels", label: "Vowel buckets" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at 10% 10%, rgba(56,189,248,0.35), transparent 45%), radial-gradient(circle at 80% 0%, rgba(251,191,36,0.25), transparent 40%), linear-gradient(180deg, #0f172a 0%, #020617 100%)", color: "#e2e8f0", fontFamily: "'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&display=swap');
        @keyframes riseIn { from { transform: translateY(18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
      `}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "36px 18px 60px", display: "grid", gap: 24 }}>
        <header style={{ display: "grid", gap: 12, animation: "riseIn 0.6s ease" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, letterSpacing: "0.5em", textTransform: "uppercase", color: "#94a3b8" }}>WordsWords</div>
              <h1 style={{ fontSize: 34, margin: "6px 0 0", fontWeight: 800 }}>Zipf-ranked subsequence search</h1>
            </div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 16, maxWidth: 720 }}>{heroTagline}</div>
        </header>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["finder", "analysis"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.4)",
                background: activeTab === tab ? "rgba(56,189,248,0.25)" : "rgba(15,23,42,0.6)",
                color: activeTab === tab ? "#f8fafc" : "#94a3b8",
                fontWeight: 800,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
          <div style={{ display: "grid", gap: 16 }}>
            {activeTab === "finder" && (
              <div style={{ display: "grid", gap: 12, padding: 18, borderRadius: 16, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)" }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                  <input
                    value={pattern}
                    onChange={(event) => setPattern(event.target.value)}
                    placeholder="Type a pattern like star or melt"
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.4)",
                      background: "rgba(2,6,23,0.8)",
                      color: "#f8fafc",
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                  />
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, auto)", alignItems: "center" }}>
                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>Top N</div>
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={topN}
                      onChange={(event) => setTopN(Number(event.target.value) || DEFAULT_TOP_N)}
                      style={{ width: 80, padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.4)", background: "rgba(2,6,23,0.8)", color: "#f8fafc" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>{`Matches: ${formatNumber(totalCount)} | Showing ${results.length}`}</div>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#94a3b8" }}>
                    <input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} />
                    Next-letter hints
                  </label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#94a3b8" }}>
                    <input type="checkbox" checked={restrictiveMode} onChange={(event) => setRestrictiveMode(event.target.checked)} />
                    Restrictive mode
                  </label>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Zipf scores come from wordfreq; higher values mean a word is more common in everyday text.
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Restrictive mode only accepts words where the first appearance of each pattern letter already follows the pattern order.
                </div>
              </div>
            )}

            {activeTab === "analysis" && (
              <div style={{ display: "grid", gap: 12, padding: 18, borderRadius: 16, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>Pattern Analysis</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {analysisStatus === "loading" && "Crunching patterns..."}
                      {analysisStatus === "ready" && `Patterns with matches: ${formatNumber(nonZeroPatterns)} / ${formatNumber(totalPatterns)}`}
                      {analysisStatus === "error" && "Analysis failed to load."}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAnalysisN(value)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(148,163,184,0.4)",
                          background: analysisN === value ? "rgba(56,189,248,0.25)" : "rgba(2,6,23,0.8)",
                          color: analysisN === value ? "#f8fafc" : "#94a3b8",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {`n=${value}`}
                      </button>
                    ))}
                  </div>
                </div>
                {analysisStatus === "ready" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {analysisSectionOptions.map((option) => {
                      const active = analysisSections.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setAnalysisSections((prev) =>
                              prev.includes(option.id) ? prev.filter((id) => id !== option.id) : [...prev, option.id]
                            );
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(148,163,184,0.4)",
                            background: active ? "rgba(56,189,248,0.2)" : "rgba(2,6,23,0.7)",
                            color: active ? "#f8fafc" : "#94a3b8",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {analysisStatus === "loading" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(analysisOverall * 100).toFixed(1)}%`, background: "linear-gradient(90deg, #38bdf8, #fbbf24)", transition: "width 120ms ease" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                      <div style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#cbd5f5" }}>
                        {`Patterns found: ${formatNumber(analysisPatternsFound)}`}
                      </div>
                      {analysisProgress.branchPrefixes !== undefined && (
                        <div style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#cbd5f5" }}>
                          {`Branch prefixes: ${formatNumber(analysisProgress.branchPrefixes)}`}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#94a3b8" }}>
                      {analysisStageOrder.map((stage, index) => {
                        const statusLabel = index < analysisStageIndex ? "[x]" : index === analysisStageIndex ? "[>]" : "[ ]";
                        const active = index === analysisStageIndex;
                        const meta = active && analysisProgress.total ? ` (${formatNumber(analysisProgress.processed ?? 0)}/${formatNumber(analysisProgress.total)})` : "";
                        return (
                          <div key={stage} style={{ display: "flex", justifyContent: "space-between", gap: 10, color: active ? "#f8fafc" : "#94a3b8" }}>
                            <span>{`${statusLabel} ${analysisStageLabels[stage]}`}</span>
                            <span>{active ? `${Math.round(analysisProgress.progress * 100)}%${meta}` : ""}</span>
                          </div>
                        );
                      })}
                      {analysisProgress.currentWord && analysisProgress.stage === "collect" && (
                        <div style={{ color: "#cbd5f5" }}>{`Scanning: ${analysisProgress.currentWord}`}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "finder" && showHints && hints.length > 0 && (
              <div style={{ display: "grid", gap: 10, padding: 14, borderRadius: 14, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.45)" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#94a3b8" }}>Next-letter hints (fewer matches glow)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(28px, 1fr))", gap: 6 }}>
                  {hints.map((hint) => {
                    const accent = hint.total <= 1 ? "#fbbf24" : hint.total <= 4 ? "#38bdf8" : "#64748b";
                    return (
                      <div
                        key={hint.letter}
                        style={{
                          padding: "6px 0",
                          borderRadius: 8,
                          textAlign: "center",
                          background: "rgba(2,6,23,0.8)",
                          color: accent,
                          fontWeight: 800,
                          border: `1px solid ${accent}33`,
                        }}
                        title={`${hint.letter.toUpperCase()} yields ${hint.total} matches`}
                      >
                        {hint.letter.toUpperCase()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "finder" && (
              <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(148,163,184,0.35)", background: "rgba(2,6,23,0.7)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 80px 70px", padding: "10px 12px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.25)" }}>
                  <div>#</div>
                  <button
                    type="button"
                    onClick={() => toggleSort("word")}
                    style={{
                      background: sortKey === "word" ? "rgba(56,189,248,0.18)" : "none",
                      border: sortKey === "word" ? "1px solid rgba(56,189,248,0.4)" : "1px solid transparent",
                      color: sortKey === "word" ? "#f8fafc" : "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "4px 6px",
                      borderRadius: 8,
                      font: "inherit",
                      fontWeight: sortKey === "word" ? 800 : 600,
                    }}
                  >
                    {`Word${sortLabel("word")}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSort("zipf")}
                    style={{
                      background: sortKey === "zipf" ? "rgba(56,189,248,0.18)" : "none",
                      border: sortKey === "zipf" ? "1px solid rgba(56,189,248,0.4)" : "1px solid transparent",
                      color: sortKey === "zipf" ? "#f8fafc" : "inherit",
                      textAlign: "right",
                      cursor: "pointer",
                      padding: "4px 6px",
                      borderRadius: 8,
                      font: "inherit",
                      fontWeight: sortKey === "zipf" ? 800 : 600,
                    }}
                  >
                    {`Zipf${sortLabel("zipf")}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSort("gap")}
                    style={{
                      background: sortKey === "gap" ? "rgba(56,189,248,0.18)" : "none",
                      border: sortKey === "gap" ? "1px solid rgba(56,189,248,0.4)" : "1px solid transparent",
                      color: sortKey === "gap" ? "#f8fafc" : "inherit",
                      textAlign: "right",
                      cursor: "pointer",
                      padding: "4px 6px",
                      borderRadius: 8,
                      font: "inherit",
                      fontWeight: sortKey === "gap" ? 800 : 600,
                    }}
                  >
                    {`Gap${sortLabel("gap")}`}
                  </button>
                </div>
                <div
                  ref={listRef}
                  onScroll={(event) => setScrollTop((event.target as HTMLDivElement).scrollTop)}
                  style={{ height: listHeight, overflow: "auto" }}
                >
                  <div style={{ height: totalHeight, position: "relative" }}>
                    <div style={{ transform: `translateY(${offsetY}px)` }}>
                      {visible.map((item, idx) => (
                        <ResultRow key={`${item.word}-${idx}`} item={item} idx={startIndex + idx} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "analysis" && analysisStatus === "ready" && (
              <div style={{ display: "grid", gap: 16 }}>
                {analysisSections.includes("most") && renderSection("Most matches", topByCount)}
                {analysisSections.includes("fewest") && renderSection("Fewest non-zero matches", fewestNonZero, "Includes singletons")}
                {analysisSections.includes("zipf") && renderSection("Highest top Zipf word", topByZipf)}
                {analysisSections.includes("hard") && renderSection("Hardest patterns", hardest, "Low count + low top Zipf")}
                {analysisSections.includes("rare") && renderSection("Rare-letter patterns (J/Q/X/Z)", rareLetterPatterns)}
                {analysisSections.includes("branch-one") && renderSection("Branching factor = 1", branchingOne)}
                {analysisSections.includes("branch-high") && renderSection("Highest branching factor", branchingHigh)}
                {analysisSections.includes("alternating") && renderSection("Alternating vowel/consonant", alternating)}
                {analysisSections.includes("structure") && (
                  <section style={{ display: "grid", gap: 10 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Structure buckets</h3>
                    <div style={{ display: "grid", gap: 12 }}>
                      {Array.from(structureBuckets.entries()).map(([key, list]) => (
                        <div key={key} style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>{key}</div>
                          <div style={{ display: "grid", gap: 8 }}>{list.slice(0, 5).map(renderPatternRow)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {analysisSections.includes("vowels") && (
                  <section style={{ display: "grid", gap: 10 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Vowel count buckets</h3>
                    <div style={{ display: "grid", gap: 12 }}>
                      {Object.keys(vowelBuckets).map((key) => (
                        <div key={key} style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>{`${key} vowels`}</div>
                          <div style={{ display: "grid", gap: 8 }}>{vowelBuckets[Number(key)].slice(0, 5).map(renderPatternRow)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <LogPanel metrics={metrics} />

            <div style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)" }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#94a3b8" }}>Assets</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#cbd5f5" }}>Word list: {WORDLIST_PATH}</div>
              <div style={{ fontSize: 13, color: "#cbd5f5" }}>Zipf map: {ZIPF_PATH}</div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  alphabetLetters,
  buildBenchmarkPatterns,
  buildIndexes,
  buildWordRecords,
  formatNumber,
  normalizePattern,
  normalizeWord,
  runBenchmark,
  runQuery,
  type BenchmarkReport,
  type Procedure,
  type RankedWord,
  type SortMode,
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

const DEFAULT_TOP_N = 80;
const WORDLIST_PATH = "wordswords/wordlist.txt";
const ZIPF_PATH = "wordswords/zipf.tsv";
const USE_ZIPF = true;
const BENCHMARK_TOP_N = 80;

const BENCHMARK_OPTIONS = {
  warmupIters: 2,
  measuredIters: 5,
};

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

function LogPanel({ metrics, report }: { metrics: LoadMetrics | null; report: BenchmarkReport | null }) {
  if (!metrics) return null;
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
  ];
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.4)", borderRadius: 14, padding: 16, background: "rgba(15,23,42,0.75)", color: "#e2e8f0" }}>
      <div style={{ fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12, color: "#f8fafc" }}>Structured Logs</div>
      <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "#94a3b8" }}>{row.label}</span>
            <span style={{ fontWeight: 700 }}>{row.value}</span>
          </div>
        ))}
        {report && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "#94a3b8" }}>benchmark best</span>
            <span style={{ fontWeight: 700 }}>{report.bestProcedure}</span>
          </div>
        )}
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
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [records, setRecords] = useState<WordRecord[]>([]);
  const [metrics, setMetrics] = useState<LoadMetrics | null>(null);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [pattern, setPattern] = useState("");
  const [debouncedPattern, setDebouncedPattern] = useState("");
  const [results, setResults] = useState<RankedWord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [procedureMode, setProcedureMode] = useState<"auto" | Procedure>("auto");
  const [sortMode, setSortMode] = useState<SortMode>("gap");
  const [showHints, setShowHints] = useState(true);
  const [hints, setHints] = useState<HintCell[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const activeProcedure: Procedure = procedureMode === "auto" ? report?.bestProcedure ?? "automaton" : procedureMode;

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
    if (status !== "ready") return;
    const patterns = buildBenchmarkPatterns(records);
    const run = runBenchmark(records, patterns, {
      warmupIters: BENCHMARK_OPTIONS.warmupIters,
      measuredIters: BENCHMARK_OPTIONS.measuredIters,
      topN: BENCHMARK_TOP_N,
      procedures: ["baseline", "automaton"],
    });
    setReport(run);
    console.log("[wordswords:benchmark]", run);
  }, [records, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const normalized = normalizePattern(debouncedPattern);
    if (!normalized) {
      setResults([]);
      setTotalCount(0);
      return;
    }
    const run = runQuery(records, normalized, topN, activeProcedure, sortMode);
    setResults(run.results);
    setTotalCount(run.total);
  }, [records, debouncedPattern, status, activeProcedure, topN, sortMode]);

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
        const res = runQuery(records, base + letter, topN, activeProcedure, sortMode);
        return { letter, total: res.total };
      });
      if (!cancelled) setHints(next);
    };
    const handle = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [debouncedPattern, records, showHints, status, activeProcedure, topN, sortMode]);

  const listHeight = 420;
  const rowHeight = 44;
  const totalHeight = results.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endIndex = Math.min(results.length, startIndex + Math.ceil(listHeight / rowHeight) + 6);
  const visible = results.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  const heroTagline = useMemo(() => {
    if (status === "loading") return "Loading dictionaries and benchmarks...";
    if (status === "error") return "Could not load word data.";
    if (records.length === 0) return "Word list is empty. Drop your SCOWL/ENABLE list into public/wordswords/wordlist.txt";
    return "Subsequence search with a rank-aware heap and dual procedures.";
  }, [status, records.length]);

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
            <div style={{ padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)" }}>
              <span style={{ fontWeight: 700, color: "#38bdf8" }}>Procedure:</span> <span style={{ fontWeight: 800 }}>{activeProcedure}</span>
            </div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 16, maxWidth: 720 }}>{heroTagline}</div>
        </header>

        <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
          <div style={{ display: "grid", gap: 16 }}>
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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>Procedure</label>
                  <select
                    value={procedureMode}
                    onChange={(event) => setProcedureMode(event.target.value as "auto" | Procedure)}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.4)", background: "rgba(2,6,23,0.8)", color: "#f8fafc" }}
                  >
                    <option value="auto">Auto</option>
                    <option value="baseline">Baseline scan</option>
                    <option value="automaton">NextPos automaton</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>Sort</label>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.4)", background: "rgba(2,6,23,0.8)", color: "#f8fafc" }}
                  >
                    <option value="gap">Gap first</option>
                    <option value="zipf">Zipf first</option>
                  </select>
                </div>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#94a3b8" }}>
                  <input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} />
                  Next-letter hints
                </label>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Zipf scores use wordfreq&apos;s zipf_frequency: $\log_{10}$ of occurrences per billion words, higher means more common.
              </div>
            </div>

            {showHints && hints.length > 0 && (
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

            <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(148,163,184,0.35)", background: "rgba(2,6,23,0.7)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 80px 70px", padding: "10px 12px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.25)" }}>
                <div>#</div>
                <div>Word</div>
                <div style={{ textAlign: "right" }}>Zipf</div>
                <div style={{ textAlign: "right" }}>Gap</div>
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
          </div>

          <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(148,163,184,0.35)", background: "linear-gradient(120deg, rgba(56,189,248,0.12), rgba(14,116,144,0.18), rgba(15,23,42,0.6))", backgroundSize: "200% 200%", animation: "shimmer 8s ease infinite" }}>
              <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "#94a3b8" }}>Benchmark</div>
              <div style={{ marginTop: 8, fontWeight: 800, fontSize: 18 }}>Procedure bakeoff</div>
              <div style={{ color: "#cbd5f5", fontSize: 13, marginTop: 6 }}>
                Warmup: {BENCHMARK_OPTIONS.warmupIters} · Measured: {BENCHMARK_OPTIONS.measuredIters} · Top N: {BENCHMARK_TOP_N}
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {report ? (
                  report.results.map((entry) => (
                    <div key={entry.procedure} style={{ padding: 10, borderRadius: 12, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.25)" }}>
                      <div style={{ fontWeight: 800, color: entry.procedure === report.bestProcedure ? "#38bdf8" : "#f8fafc" }}>{entry.procedure}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{`median ${entry.medianMsPerQuery.toFixed(3)} ms/query · avg ${entry.avgMsPerQuery.toFixed(3)} ms/query`}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{`median matches ${formatNumber(entry.medianMatches)} · avg ${formatNumber(entry.avgMatches)}`}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>Benchmark pending.</div>
                )}
              </div>
            </div>

            <LogPanel metrics={metrics} report={report} />

            <div style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)" }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#94a3b8" }}>Assets</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#cbd5f5" }}>Word list: {WORDLIST_PATH}</div>
              <div style={{ fontSize: 13, color: "#cbd5f5" }}>Zipf map: {ZIPF_PATH}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Swap these files with compressed outputs to keep Pages fast.</div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

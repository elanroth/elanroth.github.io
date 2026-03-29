import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const savedRunsRoot = path.join(repoRoot, "research", "banagrams_strategy_lab", "artifacts", "saved_runs");
const EVENT_PREFIX = "__BANAGRAMS_STRATEGY_LAB_EVENT__ ";
const installedMiddleware = new WeakSet();
const jobs = new Map();

export function strategyLabRunApiPlugin() {
  return {
    name: "strategy-lab-run-api",
    configureServer(server) {
      attachApi(server.middlewares);
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares);
    },
  };
}

function attachApi(middlewares) {
  if (installedMiddleware.has(middlewares)) {
    return;
  }
  installedMiddleware.add(middlewares);
  middlewares.use(async (req, res, next) => {
    if (!req.url) {
      next();
      return;
    }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/runs" && req.method === "GET") {
      await handleListRuns(res);
      return;
    }
    if (url.pathname === "/api/jobs" && req.method === "POST") {
      await handleLaunchJob(req, res);
      return;
    }
    if (url.pathname === "/api/run-data" && req.method === "GET") {
      await handleRunData(url, res);
      return;
    }
    next();
  });
}

async function handleListRuns(res) {
  const savedRuns = await listSavedRuns();
  const runningJobs = Array.from(jobs.values())
    .filter((job) => job.status === "running" || job.status === "failed")
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .map(serializeJob);
  sendJson(res, 200, {
    savedRuns,
    runningJobs,
    artifactsRoot: path.relative(repoRoot, savedRunsRoot),
    serverTime: new Date().toISOString(),
  });
}

async function handleLaunchJob(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON body." });
    return;
  }

  const command = payload.command === "simulate" ? "simulate" : payload.command === "train_ga" ? "train_ga" : null;
  const durationPreset = normalizeDuration(payload.durationPreset);
  const policy = payload.policy === "baseline-random" || payload.policy === "baseline-strategy" || payload.policy === "baseline-frequency"
    ? payload.policy
    : "baseline-frequency";
  const count = normalizeBatchCount(payload.count);

  if (command === null) {
    sendJson(res, 400, { error: "Expected `command` to be `train_ga` or `simulate`." });
    return;
  }
  if (durationPreset === null) {
    sendJson(res, 400, { error: "Expected `durationPreset` to be `short`, `medium`, or `long`." });
    return;
  }
  if (count === null) {
    sendJson(res, 400, { error: "Expected `count` to be an integer between 1 and 99." });
    return;
  }

  const batchLabel = count > 1 ? `batch-${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}` : null;
  const launchedJobs = [];
  for (let index = 0; index < count; index += 1) {
    const job = startJob({ command, durationPreset, policy, batchLabel });
    launchedJobs.push(serializeJob(job));
  }
  sendJson(res, 201, {
    jobs: launchedJobs,
    batchLabel,
    count: launchedJobs.length,
  });
}

async function handleRunData(url, res) {
  const id = url.searchParams.get("id");
  if (!id) {
    sendJson(res, 400, { error: "Missing run id." });
    return;
  }

  const runPath = path.join(savedRunsRoot, id);
  const uploadPath = await resolveUploadPath(runPath);
  if (uploadPath === null) {
    sendJson(res, 404, { error: "No replayable upload file found for that run." });
    return;
  }

  try {
    const raw = await fs.readFile(uploadPath, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(raw);
  } catch (error) {
    sendJson(res, 404, { error: error instanceof Error ? error.message : "Could not read run data." });
  }
}

function startJob({ command, durationPreset, policy, batchLabel }) {
  const id = `${command}-${durationPreset}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const args = ["scripts/banagrams_strategy_lab.py", command, durationPreset, "--json-progress", "--no-progress"];
  if (command === "simulate") {
    args.push("--policy", policy);
  }
  const child = spawn("python3", args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const job = {
    id,
    command,
    durationPreset,
    policy: command === "simulate" ? policy : null,
    status: "running",
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastMessage: `Launching ${command} ${durationPreset}...`,
    progress: null,
    runDir: null,
    runName: null,
    batchLabel,
    stdoutBuffer: "",
    stderrBuffer: "",
  };
  jobs.set(id, job);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => consumeChunk(job, "stdoutBuffer", chunk));
  child.stderr.on("data", (chunk) => consumeChunk(job, "stderrBuffer", chunk));
  child.on("error", (error) => {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.lastMessage = error.message;
  });
  child.on("exit", (code, signal) => {
    job.finishedAt = new Date().toISOString();
    if (code === 0) {
      jobs.delete(job.id);
      return;
    }
    job.status = "failed";
    job.lastMessage = signal ? `Stopped by ${signal}` : `Exited with code ${code ?? "unknown"}`;
  });

  return job;
}

function consumeChunk(job, bufferKey, chunk) {
  job[bufferKey] += chunk;
  const parts = job[bufferKey].split("\n");
  job[bufferKey] = parts.pop() ?? "";
  for (const part of parts) {
    handleOutputLine(job, part.replace(/\r/g, "").trim());
  }
}

function handleOutputLine(job, line) {
  if (!line) {
    return;
  }
  if (line.startsWith(EVENT_PREFIX)) {
    try {
      const payload = JSON.parse(line.slice(EVENT_PREFIX.length));
      applyEvent(job, payload);
      return;
    } catch {
      job.lastMessage = line;
      return;
    }
  }
  job.lastMessage = line;
  const savedMatch = line.match(/wrote .* to (.+)$/);
  if (savedMatch) {
    job.runDir = savedMatch[1];
    job.runName = path.basename(savedMatch[1]);
  }
}

function applyEvent(job, payload) {
  if (payload.type === "progress" || payload.type === "phase" || payload.type === "finished") {
    job.progress = {
      phase: typeof payload.phase === "string" ? payload.phase : "running",
      detail: typeof payload.detail === "string" ? payload.detail : "",
      ratio: typeof payload.ratio === "number" ? payload.ratio : 0,
      completedUnits: typeof payload.completed_units === "number" ? payload.completed_units : 0,
      totalUnits: typeof payload.total_units === "number" ? payload.total_units : 0,
      elapsedSeconds: typeof payload.elapsed_seconds === "number" ? payload.elapsed_seconds : 0,
      etaSeconds: typeof payload.eta_seconds === "number" ? payload.eta_seconds : 0,
      targetSeconds: typeof payload.target_seconds === "number" ? payload.target_seconds : null,
      progressText: typeof payload.progress_text === "string" ? payload.progress_text : "",
    };
    if (job.progress.detail) {
      job.lastMessage = job.progress.detail;
    }
  } else if (payload.type === "log") {
    job.lastMessage = typeof payload.message === "string" ? payload.message : job.lastMessage;
  } else if (payload.type === "run_saved") {
    job.runDir = typeof payload.run_dir === "string" ? payload.run_dir : job.runDir;
    job.runName = typeof payload.run_name === "string" ? payload.run_name : job.runName;
    job.lastMessage = job.runName ? `Saved ${job.runName}` : job.lastMessage;
  } else if (payload.type === "job_started") {
    job.lastMessage = `Running ${payload.command ?? job.command} ${payload.duration_preset ?? job.durationPreset}`;
  }
}

function serializeJob(job) {
  return {
    id: job.id,
    command: job.command,
    durationPreset: job.durationPreset,
    policy: job.policy,
    status: job.status,
    pid: job.pid,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    lastMessage: job.lastMessage,
    progress: job.progress,
    runName: job.runName,
    batchLabel: job.batchLabel,
  };
}

async function listSavedRuns() {
  await fs.mkdir(savedRunsRoot, { recursive: true });
  const entries = await fs.readdir(savedRunsRoot, { withFileTypes: true });
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readRunSummary(entry.name)),
  );
  return runs
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt ?? left.modifiedAt ?? "");
      const rightTime = Date.parse(right.createdAt ?? right.modifiedAt ?? "");
      return rightTime - leftTime;
    });
}

async function readRunSummary(directoryName) {
  const runDir = path.join(savedRunsRoot, directoryName);
  const stat = await fs.stat(runDir);
  const files = new Set(await fs.readdir(runDir));
  const runInfo = await readJsonIfPresent(path.join(runDir, "run_info.json"));
  const command = inferCommand(directoryName, runInfo, files);
  const durationPreset = inferDurationPreset(directoryName, runInfo);
  const summary = await buildRunSummary(runDir, command, files);
  const createdAt = inferCreatedAt(directoryName, stat);

  return {
    id: directoryName,
    directoryName,
    title: typeof runInfo?.title === "string" ? runInfo.title : directoryName,
    command,
    durationPreset,
    createdAt,
    modifiedAt: stat.mtime.toISOString(),
    hasUpload: files.has("Upload me!.json") || files.has("simulation.json") || files.has("best_policy_episodes.json"),
    uploadFile: files.has("Upload me!.json") ? "Upload me!.json" : null,
    summary,
    relativePath: path.relative(repoRoot, runDir),
  };
}

async function buildRunSummary(runDir, command, files) {
  if (command === "train_ga") {
    const [bestPolicy, history, episodes] = await Promise.all([
      readJsonIfPresent(path.join(runDir, "best_policy.json")),
      readJsonIfPresent(path.join(runDir, "ga_history.json")),
      readJsonIfPresent(path.join(runDir, "best_policy_episodes.json")),
    ]);
    const historyItems = Array.isArray(history) ? history : [];
    const metrics = bestPolicy && typeof bestPolicy === "object" && bestPolicy.metrics && typeof bestPolicy.metrics === "object" ? bestPolicy.metrics : {};
    const lastHistory = historyItems[historyItems.length - 1] ?? {};
    return {
      fitness: typeof lastHistory.best_fitness === "number" ? lastHistory.best_fitness : null,
      successRate: typeof metrics.success_rate === "number" ? metrics.success_rate : null,
      episodeCount: Array.isArray(episodes) ? episodes.length : null,
    };
  }

  if (files.has("simulation.json")) {
    const simulation = await readJsonIfPresent(path.join(runDir, "simulation.json"));
    const metrics = simulation && typeof simulation === "object" && simulation.metrics && typeof simulation.metrics === "object" ? simulation.metrics : {};
    return {
      fitness: simulation && typeof simulation.fitness === "number" ? simulation.fitness : null,
      successRate: typeof metrics.success_rate === "number" ? metrics.success_rate : null,
      episodeCount: Array.isArray(simulation?.episodes) ? simulation.episodes.length : null,
    };
  }

  return {
    fitness: null,
    successRate: null,
    episodeCount: null,
  };
}

async function resolveUploadPath(runDir) {
  const uploadPath = path.join(runDir, "Upload me!.json");
  try {
    await fs.access(uploadPath);
    return uploadPath;
  } catch {}

  for (const fallback of ["simulation.json", "best_policy_episodes.json"]) {
    const nextPath = path.join(runDir, fallback);
    try {
      await fs.access(nextPath);
      return nextPath;
    } catch {}
  }
  return null;
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function inferCommand(directoryName, runInfo, files) {
  if (runInfo && typeof runInfo.command === "string") {
    return runInfo.command;
  }
  const normalized = directoryName.toLowerCase();
  if (normalized.startsWith("train-ga") || normalized.startsWith("train ")) {
    return "train_ga";
  }
  if (normalized.startsWith("simulate")) {
    return "simulate";
  }
  if (files.has("best_policy_episodes.json")) {
    return "train_ga";
  }
  if (files.has("simulation.json")) {
    return "simulate";
  }
  return "analyze_snapshots";
}

function inferDurationPreset(directoryName, runInfo) {
  if (runInfo && typeof runInfo.duration_preset === "string") {
    return runInfo.duration_preset;
  }
  const normalized = directoryName.toLowerCase();
  if (normalized.includes("short")) {
    return "short";
  }
  if (normalized.includes(" med") || normalized.includes("medium")) {
    return "medium";
  }
  if (normalized.includes("long")) {
    return "long";
  }
  if (normalized.includes("manual")) {
    return "manual";
  }
  return "legacy";
}

function inferCreatedAt(directoryName, stat) {
  const modernMatch = directoryName.match(/(\d{2})-(\d{2})-(\d{2}) (\d{2})-(\d{2})/);
  if (modernMatch) {
    const [, month, day, year, hour, minute] = modernMatch;
    return new Date(2000 + Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).toISOString();
  }
  const legacyMatch = directoryName.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (legacyMatch) {
    const [, year, month, day, hour, minute, second] = legacyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).toISOString();
  }
  return stat.birthtime.toISOString();
}

function normalizeDuration(value) {
  return value === "short" || value === "medium" || value === "long" ? value : null;
}

function normalizeBatchCount(value) {
  if (value == null) {
    return 1;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
    return null;
  }
  return parsed;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

from __future__ import annotations

import argparse
from dataclasses import dataclass
import io
import json
from pathlib import Path
import sys
from typing import Any

from .data import WordBank
from .environment import SinglePlayerBanagramsEnvironment
from .ga import ProgressTracker, evaluate_policy, run_genetic_search
from .policy import RandomPolicy, frequency_aware_policy, strategy_only_policy
from .reporting import UPLOAD_ME_FILENAME, make_run_dir, render_simulation_report, render_snapshot_report, render_training_report, write_json, write_upload_json
from .snapshots import analyze_snapshot_export


@dataclass(frozen=True)
class TrainDurationPreset:
  name: str
  target_seconds: int
  generations: int
  population: int
  episodes_per_eval: int
  bag_size: int
  starting_hand: int
  min_length: int
  max_turns: int
  max_candidates: int


TRAIN_DURATION_PRESETS: dict[str, TrainDurationPreset] = {
  "short": TrainDurationPreset(
    name="short",
    target_seconds=60,
    generations=24,
    population=12,
    episodes_per_eval=6,
    bag_size=40,
    starting_hand=8,
    min_length=2,
    max_turns=80,
    max_candidates=96,
  ),
  "medium": TrainDurationPreset(
    name="medium",
    target_seconds=600,
    generations=80,
    population=18,
    episodes_per_eval=8,
    bag_size=60,
    starting_hand=14,
    min_length=3,
    max_turns=120,
    max_candidates=128,
  ),
  "long": TrainDurationPreset(
    name="long",
    target_seconds=1800,
    generations=160,
    population=24,
    episodes_per_eval=10,
    bag_size=60,
    starting_hand=20,
    min_length=3,
    max_turns=180,
    max_candidates=192,
  ),
}


@dataclass(frozen=True)
class SimulateDurationPreset:
  name: str
  episodes: int
  bag_size: int
  starting_hand: int
  min_length: int
  max_turns: int
  max_candidates: int


SIMULATE_DURATION_PRESETS: dict[str, SimulateDurationPreset] = {
  "short": SimulateDurationPreset(
    name="short",
    episodes=12,
    bag_size=40,
    starting_hand=8,
    min_length=2,
    max_turns=80,
    max_candidates=96,
  ),
  "medium": SimulateDurationPreset(
    name="medium",
    episodes=48,
    bag_size=60,
    starting_hand=14,
    min_length=3,
    max_turns=120,
    max_candidates=128,
  ),
  "long": SimulateDurationPreset(
    name="long",
    episodes=120,
    bag_size=60,
    starting_hand=20,
    min_length=3,
    max_turns=180,
    max_candidates=192,
  ),
}


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Banagrams Strategy Lab")
  subparsers = parser.add_subparsers(dest="command", required=True)

  train = subparsers.add_parser("train_ga", help="Train an interpretable GA policy.")
  train.add_argument("duration", nargs="?", choices=sorted(TRAIN_DURATION_PRESETS.keys()))
  add_common_env_args(train)
  train.add_argument("--seed", type=int, default=7)
  train.add_argument("--generations", type=int, default=6)
  train.add_argument("--population", type=int, default=12)
  train.add_argument("--episodes-per-eval", type=int, default=8)
  train.add_argument("--snapshot-json", type=Path, default=None)
  train.add_argument("--output-dir", type=Path, default=None)
  train.add_argument("--no-progress", action="store_true")
  train.add_argument("--json-progress", action="store_true")

  simulate = subparsers.add_parser("simulate", help="Run seeded simulations for a policy.")
  simulate.add_argument("duration", nargs="?", choices=sorted(SIMULATE_DURATION_PRESETS.keys()))
  add_common_env_args(simulate)
  simulate.add_argument("--seed", type=int, default=7)
  simulate.add_argument("--episodes", type=int, default=6)
  simulate.add_argument(
    "--policy",
    choices=["baseline-random", "baseline-strategy", "baseline-frequency"],
    default="baseline-frequency",
  )
  simulate.add_argument("--output-dir", type=Path, default=None)
  simulate.add_argument("--no-progress", action="store_true")
  simulate.add_argument("--json-progress", action="store_true")

  snapshots = subparsers.add_parser("analyze_snapshots", help="Analyze exported Firebase snapshot JSON.")
  snapshots.add_argument("--input", type=Path, required=True)
  snapshots.add_argument("--output-dir", type=Path, default=None)

  return parser


def add_common_env_args(parser: argparse.ArgumentParser) -> None:
  parser.add_argument("--bag-size", type=int, default=60)
  parser.add_argument("--starting-hand", type=int, default=20)
  parser.add_argument("--min-length", type=int, default=3)
  parser.add_argument("--max-turns", type=int, default=200)
  parser.add_argument("--max-candidates", type=int, default=256)


def main(argv: list[str] | None = None) -> int:
  parser = build_parser()
  args = parser.parse_args(argv)

  if args.command == "analyze_snapshots":
    return run_snapshot_analysis(args)
  return run_training_or_simulation(args)


def run_training_or_simulation(args: argparse.Namespace) -> int:
  train_preset = apply_train_duration_preset(args)
  simulate_preset = apply_simulate_duration_preset(args)
  event_emitter = EventEmitter(enabled=getattr(args, "json_progress", False))
  word_bank = WordBank.from_repo(min_length=2)
  env = SinglePlayerBanagramsEnvironment(
    word_bank,
    bag_size=args.bag_size,
    starting_hand=args.starting_hand,
    min_length=args.min_length,
    max_turns=args.max_turns,
    max_candidates=args.max_candidates,
  )

  if args.command == "train_ga":
    progress = make_progress_tracker(
      enabled=not args.no_progress or args.json_progress,
      label="train_ga",
      total_units=args.episodes_per_eval * (3 + args.generations * args.population),
      target_seconds=train_preset.target_seconds if train_preset is not None else None,
      quiet=args.no_progress,
      emitter=event_emitter,
    )
    if progress is not None and train_preset is not None:
      progress.log(
        f"[train_ga] preset={train_preset.name} target={format_budget(train_preset.target_seconds)} "
        f"population={train_preset.population} episodes/eval={train_preset.episodes_per_eval} "
        f"max_turns={train_preset.max_turns} max_candidates={train_preset.max_candidates}"
      )
    event_emitter.emit(
      {
        "type": "job_started",
        "command": "train_ga",
        "duration_preset": train_preset.name if train_preset is not None else "manual",
        "seed": args.seed,
      }
    )
    result = run_genetic_search(
      env,
      seed=args.seed,
      generations=args.generations,
      population_size=args.population,
      episodes_per_eval=args.episodes_per_eval,
      progress=progress,
      time_budget_seconds=train_preset.target_seconds if train_preset is not None else None,
    )
    if progress is not None:
      progress.finish(message="training complete", complete=True)
    run_dir = make_run_dir(training_run_label(train_preset), args.output_dir)
    snapshot_summary = analyze_snapshot_export(args.snapshot_json, word_bank) if args.snapshot_json else None
    write_json(run_dir / "ga_history.json", result.history)
    write_json(run_dir / "best_policy.json", {"name": result.best.name, "weights": result.best.weights, "metrics": result.best.metrics})
    write_json(run_dir / "baselines.json", result.baselines)
    write_json(run_dir / "best_policy_episodes.json", result.best.episodes)
    write_upload_json(run_dir, result.best.episodes)
    write_json(
      run_dir / "run_info.json",
      {
        "command": "train_ga",
        "duration_preset": train_preset.name if train_preset is not None else "manual",
        "upload_file": UPLOAD_ME_FILENAME,
        "title": run_dir.name,
      },
    )
    if snapshot_summary is not None:
      write_json(run_dir / "snapshot_summary.json", snapshot_summary)
    (run_dir / "report.md").write_text(render_training_report(result, snapshot_summary), "utf8")
    event_emitter.emit(
      {
        "type": "run_saved",
        "command": "train_ga",
        "duration_preset": train_preset.name if train_preset is not None else "manual",
        "run_dir": str(run_dir),
        "run_name": run_dir.name,
        "upload_file": UPLOAD_ME_FILENAME,
      }
    )
    print(f"[banagrams-strategy-lab] wrote training artifacts to {run_dir}")
    return 0

  seeds = [args.seed * 1000 + idx for idx in range(args.episodes)]
  progress = make_progress_tracker(
    enabled=not args.no_progress or args.json_progress,
    label="simulate",
    total_units=len(seeds),
    quiet=args.no_progress,
    emitter=event_emitter,
  )
  event_emitter.emit(
    {
      "type": "job_started",
      "command": "simulate",
      "duration_preset": simulate_preset.name if simulate_preset is not None else "manual",
      "seed": args.seed,
      "policy": args.policy,
    }
  )
  if args.policy == "baseline-random":
    policy = RandomPolicy()
    evaluation = evaluate_random(policy, env, seeds, progress=progress)
  elif args.policy == "baseline-strategy":
    evaluation = evaluate_policy(strategy_only_policy(), env, seeds, progress=progress)
  else:
    evaluation = evaluate_policy(frequency_aware_policy(), env, seeds, progress=progress)
  if progress is not None:
    progress.finish(message="simulation complete")

  run_dir = make_run_dir(simulation_run_label(simulate_preset), args.output_dir)
  write_json(run_dir / "simulation.json", evaluation)
  write_upload_json(run_dir, evaluation)
  write_json(
    run_dir / "run_info.json",
    {
      "command": "simulate",
      "policy": evaluation.name,
      "duration_preset": simulate_preset.name if simulate_preset is not None else "manual",
      "upload_file": UPLOAD_ME_FILENAME,
      "title": run_dir.name,
    },
  )
  (run_dir / "report.md").write_text(render_simulation_report(evaluation), "utf8")
  event_emitter.emit(
    {
      "type": "run_saved",
      "command": "simulate",
      "duration_preset": simulate_preset.name if simulate_preset is not None else "manual",
      "run_dir": str(run_dir),
      "run_name": run_dir.name,
      "upload_file": UPLOAD_ME_FILENAME,
    }
  )
  print(f"[banagrams-strategy-lab] wrote simulation artifacts to {run_dir}")
  return 0


def run_snapshot_analysis(args: argparse.Namespace) -> int:
  word_bank = WordBank.from_repo(min_length=2)
  summary = analyze_snapshot_export(args.input, word_bank)
  run_dir = make_run_dir("snapshot-analysis", args.output_dir)
  write_json(run_dir / "summary.json", summary)
  write_json(
    run_dir / "run_info.json",
    {
      "command": "analyze_snapshots",
      "upload_file": None,
      "title": run_dir.name,
    },
  )
  (run_dir / "report.md").write_text(render_snapshot_report(summary), "utf8")
  print(f"[banagrams-strategy-lab] wrote snapshot analysis to {run_dir}")
  return 0


def evaluate_random(
  policy: RandomPolicy,
  env: SinglePlayerBanagramsEnvironment,
  seeds: list[int],
  *,
  progress: ProgressTracker | None = None,
):
  from .ga import PolicyEvaluation, fitness_from_metrics, summarize_episodes

  episodes = []
  for index, seed in enumerate(seeds, start=1):
    episodes.append(env.run_episode(policy, seed))
    if progress is not None:
      progress.advance(detail=f"{policy.name} episode {index}/{len(seeds)}")
  metrics = summarize_episodes(episodes)
  return PolicyEvaluation(name=policy.name, fitness=fitness_from_metrics(metrics), metrics=metrics, episodes=episodes, weights=None)


def apply_train_duration_preset(args: argparse.Namespace) -> TrainDurationPreset | None:
  if args.command != "train_ga" or not getattr(args, "duration", None):
    return None
  preset = TRAIN_DURATION_PRESETS[args.duration]
  args.generations = preset.generations
  args.population = preset.population
  args.episodes_per_eval = preset.episodes_per_eval
  args.bag_size = preset.bag_size
  args.starting_hand = preset.starting_hand
  args.min_length = preset.min_length
  args.max_turns = preset.max_turns
  args.max_candidates = preset.max_candidates
  return preset


def apply_simulate_duration_preset(args: argparse.Namespace) -> SimulateDurationPreset | None:
  if args.command != "simulate" or not getattr(args, "duration", None):
    return None
  preset = SIMULATE_DURATION_PRESETS[args.duration]
  args.episodes = preset.episodes
  args.bag_size = preset.bag_size
  args.starting_hand = preset.starting_hand
  args.min_length = preset.min_length
  args.max_turns = preset.max_turns
  args.max_candidates = preset.max_candidates
  return preset


def format_budget(seconds: int) -> str:
  if seconds % 60 == 0:
    return f"{seconds // 60}m"
  return f"{seconds}s"


def training_run_label(preset: TrainDurationPreset | None) -> str:
  if preset is None:
    return "train manual"
  return {
    "short": "train short",
    "medium": "train med",
    "long": "train long",
  }.get(preset.name, preset.name)


def simulation_run_label(preset: SimulateDurationPreset | None) -> str:
  if preset is None:
    return "simulate manual"
  return {
    "short": "simulate short",
    "medium": "simulate med",
    "long": "simulate long",
  }.get(preset.name, preset.name)


class EventEmitter:
  def __init__(self, *, enabled: bool) -> None:
    self.enabled = enabled

  def emit(self, payload: dict[str, Any]) -> None:
    if not self.enabled:
      return
    print("__BANAGRAMS_STRATEGY_LAB_EVENT__ " + json.dumps(payload, sort_keys=True), file=sys.stdout, flush=True)


def make_progress_tracker(
  *,
  enabled: bool,
  label: str,
  total_units: int,
  target_seconds: int | None = None,
  quiet: bool,
  emitter: EventEmitter,
) -> ProgressTracker | None:
  if not enabled:
    return None
  stream = io.StringIO() if quiet else None
  return ProgressTracker(
    total_units=total_units,
    label=label,
    stream=stream,
    target_seconds=target_seconds,
    on_event=emitter.emit if emitter.enabled else None,
  )

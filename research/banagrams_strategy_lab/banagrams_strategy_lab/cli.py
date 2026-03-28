from __future__ import annotations

import argparse
from pathlib import Path

from .data import WordBank
from .environment import SinglePlayerBanagramsEnvironment
from .ga import evaluate_policy, run_genetic_search
from .paths import project_root
from .policy import RandomPolicy, frequency_aware_policy, strategy_only_policy
from .reporting import make_run_dir, render_simulation_report, render_snapshot_report, render_training_report, write_json
from .snapshots import analyze_snapshot_export


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Banagrams Strategy Lab")
  subparsers = parser.add_subparsers(dest="command", required=True)

  train = subparsers.add_parser("train_ga", help="Train an interpretable GA policy.")
  add_common_env_args(train)
  train.add_argument("--seed", type=int, default=7)
  train.add_argument("--generations", type=int, default=6)
  train.add_argument("--population", type=int, default=12)
  train.add_argument("--episodes-per-eval", type=int, default=8)
  train.add_argument("--snapshot-json", type=Path, default=None)
  train.add_argument("--output-dir", type=Path, default=None)

  simulate = subparsers.add_parser("simulate", help="Run seeded simulations for a policy.")
  add_common_env_args(simulate)
  simulate.add_argument("--seed", type=int, default=7)
  simulate.add_argument("--episodes", type=int, default=6)
  simulate.add_argument(
    "--policy",
    choices=["baseline-random", "baseline-strategy", "baseline-frequency"],
    default="baseline-frequency",
  )
  simulate.add_argument("--output-dir", type=Path, default=None)

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
    result = run_genetic_search(
      env,
      seed=args.seed,
      generations=args.generations,
      population_size=args.population,
      episodes_per_eval=args.episodes_per_eval,
    )
    run_dir = make_run_dir("train-ga", args.output_dir)
    snapshot_summary = analyze_snapshot_export(args.snapshot_json, word_bank) if args.snapshot_json else None
    write_json(run_dir / "ga_history.json", result.history)
    write_json(run_dir / "best_policy.json", {"name": result.best.name, "weights": result.best.weights, "metrics": result.best.metrics})
    write_json(run_dir / "baselines.json", result.baselines)
    write_json(run_dir / "best_policy_episodes.json", result.best.episodes)
    if snapshot_summary is not None:
      write_json(run_dir / "snapshot_summary.json", snapshot_summary)
    (run_dir / "report.md").write_text(render_training_report(result, snapshot_summary), "utf8")
    print(f"[banagrams-strategy-lab] wrote training artifacts to {run_dir}")
    return 0

  seeds = [args.seed * 1000 + idx for idx in range(args.episodes)]
  if args.policy == "baseline-random":
    policy = RandomPolicy()
    evaluation = evaluate_random(policy, env, seeds)
  elif args.policy == "baseline-strategy":
    evaluation = evaluate_policy(strategy_only_policy(), env, seeds)
  else:
    evaluation = evaluate_policy(frequency_aware_policy(), env, seeds)

  run_dir = make_run_dir("simulate", args.output_dir)
  write_json(run_dir / "simulation.json", evaluation)
  (run_dir / "report.md").write_text(render_simulation_report(evaluation), "utf8")
  print(f"[banagrams-strategy-lab] wrote simulation artifacts to {run_dir}")
  return 0


def run_snapshot_analysis(args: argparse.Namespace) -> int:
  word_bank = WordBank.from_repo(min_length=2)
  summary = analyze_snapshot_export(args.input, word_bank)
  run_dir = make_run_dir("snapshots", args.output_dir)
  write_json(run_dir / "summary.json", summary)
  (run_dir / "report.md").write_text(render_snapshot_report(summary), "utf8")
  print(f"[banagrams-strategy-lab] wrote snapshot analysis to {run_dir}")
  return 0


def evaluate_random(policy: RandomPolicy, env: SinglePlayerBanagramsEnvironment, seeds: list[int]):
  from .ga import PolicyEvaluation, fitness_from_metrics, summarize_episodes

  episodes = [env.run_episode(policy, seed) for seed in seeds]
  metrics = summarize_episodes(episodes)
  return PolicyEvaluation(name=policy.name, fitness=fitness_from_metrics(metrics), metrics=metrics, episodes=episodes, weights=None)

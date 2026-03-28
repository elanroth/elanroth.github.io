from __future__ import annotations

from collections import Counter
from dataclasses import asdict, is_dataclass
import json
from pathlib import Path
from statistics import mean
import time
from typing import Any

from .ga import GAResult, PolicyEvaluation
from .paths import artifacts_root


def make_run_dir(prefix: str, output_dir: Path | None = None) -> Path:
  root = output_dir or artifacts_root()
  stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
  run_dir = root / f"{prefix}-{stamp}"
  run_dir.mkdir(parents=True, exist_ok=True)
  return run_dir


def write_json(path: Path, payload: Any) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(to_jsonable(payload), indent=2, sort_keys=True) + "\n", "utf8")


def to_jsonable(value: Any) -> Any:
  if is_dataclass(value):
    return {key: to_jsonable(item) for key, item in asdict(value).items()}
  if isinstance(value, dict):
    return {str(key): to_jsonable(item) for key, item in value.items()}
  if isinstance(value, (list, tuple)):
    return [to_jsonable(item) for item in value]
  return value


def render_training_report(result: GAResult, snapshot_summary: dict[str, Any] | None = None) -> str:
  lines = [
    "# Banagrams Strategy Lab Report",
    "",
    "## Best Policy Summary",
    f"- Policy: `{result.best.name}`",
    f"- Fitness: `{result.best.fitness:.3f}`",
  ]
  for name, value in result.best.metrics.items():
    lines.append(f"- {name}: `{value:.3f}`")

  if result.best.weights:
    ranked = sorted(result.best.weights.items(), key=lambda item: abs(item[1]), reverse=True)[:12]
    lines.extend(["", "## Strongest Learned Weights"])
    for feature, weight in ranked:
      lines.append(f"- {feature}: `{weight:.3f}`")

  lines.extend(["", "## Baseline Comparison"])
  for baseline in result.baselines:
    lines.append(
      f"- {baseline.name}: fitness `{baseline.fitness:.3f}`, success `{baseline.metrics['success_rate']:.3f}`, "
      f"opening length `{baseline.metrics['avg_opening_length']:.3f}`, mean zipf `{baseline.metrics['avg_word_zipf']:.3f}`"
    )

  lines.extend(["", "## Interpretive Notes"])
  lines.extend(render_episode_insights(result.best))

  if snapshot_summary is not None:
    lines.extend(["", "## Snapshot Comparison"])
    lines.append(f"- snapshots analyzed: `{snapshot_summary.get('total_snapshots', 0)}`")
    lines.append(f"- average real word length: `{snapshot_summary.get('mean_word_length', 0.0):.3f}`")
    lines.append(f"- average real word zipf: `{snapshot_summary.get('mean_word_zipf', 0.0):.3f}`")
    lines.append(f"- zero-zipf share in real snapshots: `{snapshot_summary.get('zero_zipf_share', 0.0):.3f}`")

  return "\n".join(lines) + "\n"


def render_simulation_report(evaluation: PolicyEvaluation) -> str:
  lines = [
    "# Banagrams Strategy Simulation",
    "",
    f"- policy: `{evaluation.name}`",
    f"- fitness: `{evaluation.fitness:.3f}`",
  ]
  for name, value in evaluation.metrics.items():
    lines.append(f"- {name}: `{value:.3f}`")
  lines.extend(["", "## Interpretive Notes"])
  lines.extend(render_episode_insights(evaluation))
  return "\n".join(lines) + "\n"


def render_snapshot_report(summary: dict[str, Any]) -> str:
  lines = [
    "# Banagrams Snapshot Analysis",
    "",
    f"- games observed: `{summary.get('games_with_snapshots', 0)}`",
    f"- snapshots analyzed: `{summary.get('total_snapshots', 0)}`",
    f"- boards analyzed: `{summary.get('total_boards', 0)}`",
    f"- mean word length: `{summary.get('mean_word_length', 0.0):.3f}`",
    f"- mean word zipf: `{summary.get('mean_word_zipf', 0.0):.3f}`",
    f"- zero-zipf share: `{summary.get('zero_zipf_share', 0.0):.3f}`",
    f"- mean bag remaining: `{summary.get('mean_bag_remaining', 0.0):.3f}`",
    "",
    "## Most Common Snapshot Words",
  ]
  for word, count in summary.get("top_words", [])[:15]:
    lines.append(f"- {word}: `{count}`")
  return "\n".join(lines) + "\n"


def render_episode_insights(evaluation: PolicyEvaluation) -> list[str]:
  opening_lengths = [episode.opening_length for episode in evaluation.episodes if episode.opening_length]
  opening_words = [episode.opening_word for episode in evaluation.episodes if episode.opening_word]
  failure_counter = Counter(episode.failure_reason or "success" for episode in evaluation.episodes)
  lines = [
    f"- average opening length: `{mean(opening_lengths):.3f}`" if opening_lengths else "- no opening words recorded",
    f"- most common opening words: `{Counter(opening_words).most_common(5)}`" if opening_words else "- no opening words recorded",
    f"- failure mix: `{dict(failure_counter)}`",
  ]
  return lines

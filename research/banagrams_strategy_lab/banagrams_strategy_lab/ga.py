from __future__ import annotations

from dataclasses import dataclass
import random
from statistics import mean
import sys
import time
from typing import Any, Callable, TextIO

from .environment import EpisodeResult, SinglePlayerBanagramsEnvironment
from .policy import FEATURE_NAMES, HeuristicPolicy, frequency_aware_policy, strategy_only_policy


@dataclass(slots=True)
class PolicyEvaluation:
  name: str
  fitness: float
  metrics: dict[str, float]
  episodes: list[EpisodeResult]
  weights: dict[str, float] | None = None


@dataclass(slots=True)
class GAResult:
  best: PolicyEvaluation
  history: list[dict[str, float]]
  baselines: list[PolicyEvaluation]


class ProgressTracker:
  def __init__(
    self,
    *,
    total_units: int,
    label: str,
    stream: TextIO | None = None,
    target_seconds: float | None = None,
    on_event: Callable[[dict[str, Any]], None] | None = None,
  ) -> None:
    self.total_units = max(1, total_units)
    self.label = label
    self.stream = stream or sys.stderr
    self.target_seconds = target_seconds
    self.on_event = on_event
    self.completed_units = 0
    self.phase = "starting"
    self.detail = ""
    self.started_at = time.monotonic()
    self.last_render_at = 0.0

  def set_phase(self, phase: str) -> None:
    self.phase = phase
    self._render(force=True)
    self._emit({"type": "phase", **self.snapshot()})

  def advance(self, units: int = 1, *, detail: str = "") -> None:
    self.completed_units = min(self.total_units, self.completed_units + units)
    self.detail = detail
    self._render()
    self._emit({"type": "progress", **self.snapshot()})

  def log(self, message: str) -> None:
    self._clear_line()
    print(message, file=self.stream, flush=True)
    self._emit({"type": "log", "label": self.label, "message": message, **self.snapshot()})
    self._render(force=True)

  def finish(self, *, message: str | None = None, complete: bool = True) -> None:
    if complete:
      self.completed_units = self.total_units
    if message is not None:
      self.detail = message
    self._render(force=True)
    self.stream.write("\n")
    self.stream.flush()
    self._emit({"type": "finished", **self.snapshot()})

  def snapshot(self) -> dict[str, Any]:
    elapsed = time.monotonic() - self.started_at
    unit_ratio = self.completed_units / self.total_units
    if self.target_seconds is not None and self.target_seconds > 0:
      ratio = min(1.0, elapsed / self.target_seconds)
      eta = max(0.0, self.target_seconds - elapsed)
      progress_text = f"{format_seconds(elapsed)}/{format_seconds(self.target_seconds)}"
    else:
      ratio = unit_ratio
      eta = ((elapsed / self.completed_units) * (self.total_units - self.completed_units)) if self.completed_units else 0.0
      progress_text = f"{self.completed_units}/{self.total_units}"
    return {
      "label": self.label,
      "phase": self.phase,
      "detail": self.detail,
      "completed_units": self.completed_units,
      "total_units": self.total_units,
      "ratio": ratio,
      "elapsed_seconds": elapsed,
      "eta_seconds": eta,
      "target_seconds": self.target_seconds,
      "progress_text": progress_text,
    }

  def _render(self, *, force: bool = False) -> None:
    now = time.monotonic()
    if not force and self.completed_units < self.total_units and (now - self.last_render_at) < 0.1:
      return
    self.last_render_at = now
    elapsed = now - self.started_at
    unit_ratio = self.completed_units / self.total_units
    if self.target_seconds is not None and self.target_seconds > 0:
      ratio = min(1.0, elapsed / self.target_seconds)
      progress_text = f"{format_seconds(elapsed)}/{format_seconds(self.target_seconds)}"
      eta = max(0.0, self.target_seconds - elapsed)
      tail = f" evals {self.completed_units}/{self.total_units}"
    else:
      ratio = unit_ratio
      progress_text = f"{self.completed_units}/{self.total_units}"
      eta = ((elapsed / self.completed_units) * (self.total_units - self.completed_units)) if self.completed_units else 0.0
      tail = ""
    filled = int(ratio * 24)
    bar = "#" * filled + "-" * (24 - filled)
    line = (
      f"[{self.label}] [{bar}] {progress_text} "
      f"{ratio * 100:5.1f}% eta {format_seconds(eta)} {self.phase}{tail}"
    )
    if self.detail:
      line += f" | {self.detail}"
    self.stream.write("\r" + line)
    self.stream.flush()

  def _clear_line(self) -> None:
    self.stream.write("\r" + (" " * 180) + "\r")
    self.stream.flush()

  def _emit(self, payload: dict[str, Any]) -> None:
    if self.on_event is not None:
      self.on_event(payload)


def evaluate_policy(
  policy: HeuristicPolicy,
  env: SinglePlayerBanagramsEnvironment,
  seeds: list[int],
  *,
  progress: ProgressTracker | None = None,
  progress_label: str | None = None,
) -> PolicyEvaluation:
  episodes: list[EpisodeResult] = []
  for index, seed in enumerate(seeds, start=1):
    episodes.append(env.run_episode(policy, seed))
    if progress is not None:
      progress.advance(detail=f"{progress_label or policy.name} episode {index}/{len(seeds)}")
  metrics = summarize_episodes(episodes)
  return PolicyEvaluation(
    name=policy.name,
    fitness=fitness_from_metrics(metrics),
    metrics=metrics,
    episodes=episodes,
    weights=dict(policy.weights),
  )


def evaluate_baselines(
  env: SinglePlayerBanagramsEnvironment,
  seeds: list[int],
  *,
  progress: ProgressTracker | None = None,
) -> list[PolicyEvaluation]:
  from .policy import RandomPolicy

  if progress is not None:
    progress.set_phase("baselines")

  random_eval = PolicyEvaluation(
    name="baseline-random",
    fitness=0.0,
    metrics={},
    episodes=[],
    weights=None,
  )
  random_policy = RandomPolicy()
  for index, seed in enumerate(seeds, start=1):
    random_eval.episodes.append(env.run_episode(random_policy, seed))
    if progress is not None:
      progress.advance(detail=f"{random_eval.name} episode {index}/{len(seeds)}")
  random_eval.metrics = summarize_episodes(random_eval.episodes)
  random_eval.fitness = fitness_from_metrics(random_eval.metrics)

  strategy_eval = evaluate_policy(strategy_only_policy(), env, seeds, progress=progress)
  frequency_eval = evaluate_policy(frequency_aware_policy(), env, seeds, progress=progress)
  return [random_eval, strategy_eval, frequency_eval]


def run_genetic_search(
  env: SinglePlayerBanagramsEnvironment,
  *,
  seed: int,
  generations: int,
  population_size: int,
  episodes_per_eval: int,
  progress: ProgressTracker | None = None,
  time_budget_seconds: float | None = None,
) -> GAResult:
  rng = random.Random(seed)
  evaluation_seeds = [seed * 1000 + idx for idx in range(episodes_per_eval)]
  deadline = (time.monotonic() + time_budget_seconds) if time_budget_seconds is not None else None
  baselines = evaluate_baselines(env, evaluation_seeds, progress=progress)

  base = frequency_aware_policy()
  population: list[HeuristicPolicy] = [
    HeuristicPolicy(name="seeded-frequency", weights=dict(base.weights))
  ]
  while len(population) < population_size:
    population.append(
      HeuristicPolicy(
        name=f"candidate-{len(population)}",
        weights=mutate_weights(base.weights, rng, mutation_scale=1.5, mutation_rate=0.45),
      )
    )

  history: list[dict[str, float]] = []
  best_eval = max(baselines, key=lambda item: item.fitness)
  stopped_on_budget = False

  for generation in range(generations):
    if deadline is not None and time.monotonic() >= deadline:
      stopped_on_budget = True
      break
    if progress is not None:
      progress.set_phase(f"generation {generation + 1}/{generations}")
    evaluated: list[PolicyEvaluation] = []
    for policy in population:
      if deadline is not None and time.monotonic() >= deadline and evaluated:
        stopped_on_budget = True
        break
      evaluated.append(
        evaluate_policy(
          policy,
          env,
          evaluation_seeds,
          progress=progress,
          progress_label=f"g{generation + 1}:{policy.name}",
        )
      )
    if not evaluated:
      stopped_on_budget = True
      break
    evaluated.sort(key=lambda item: item.fitness, reverse=True)

    history.append(
      {
        "generation": float(generation),
        "best_fitness": evaluated[0].fitness,
        "mean_fitness": mean(item.fitness for item in evaluated),
        "success_rate": evaluated[0].metrics["success_rate"],
        "avg_turns": evaluated[0].metrics["avg_turns"],
      }
    )

    if evaluated[0].fitness > best_eval.fitness:
      best_eval = evaluated[0]

    if progress is not None:
      progress.log(
        f"[train_ga] generation {generation + 1}/{generations} "
        f"best={evaluated[0].fitness:.3f} mean={history[-1]['mean_fitness']:.3f} "
        f"success={evaluated[0].metrics['success_rate']:.3f} avg_turns={evaluated[0].metrics['avg_turns']:.2f}"
      )
    if stopped_on_budget:
      break

    elite_count = max(2, population_size // 4)
    elites = evaluated[:elite_count]
    next_population = [
      HeuristicPolicy(name=f"elite-{idx}", weights=dict(elite.weights or {}))
      for idx, elite in enumerate(elites)
    ]

    while len(next_population) < population_size:
      parent_a = tournament_select(elites, rng)
      parent_b = tournament_select(evaluated, rng)
      child_weights = crossover_weights(parent_a.weights or {}, parent_b.weights or {}, rng)
      child_weights = mutate_weights(child_weights, rng, mutation_scale=0.8, mutation_rate=0.30)
      next_population.append(
        HeuristicPolicy(name=f"gen{generation + 1}-cand{len(next_population)}", weights=child_weights)
      )

    population = next_population

  if stopped_on_budget and progress is not None and time_budget_seconds is not None:
    progress.log(
      f"[train_ga] stopped at the {format_seconds(time_budget_seconds)} budget with "
      f"{len(history)} generation summaries recorded"
    )

  return GAResult(best=best_eval, history=history, baselines=baselines)


def summarize_episodes(episodes: list[EpisodeResult]) -> dict[str, float]:
  success_rate = mean(1.0 if episode.success else 0.0 for episode in episodes)
  avg_turns = mean(episode.turns for episode in episodes)
  avg_dumps = mean(episode.dumps_used for episode in episodes)
  avg_bag_remaining = mean(episode.bag_remaining for episode in episodes)
  avg_rack_remaining = mean(episode.rack_remaining for episode in episodes)
  avg_word_zipf = mean(episode.mean_word_zipf for episode in episodes)
  avg_opening_length = mean(episode.opening_length for episode in episodes)
  zero_zipf_words = mean(episode.zero_zipf_words for episode in episodes)
  avg_words_played = mean(len(episode.words_played) for episode in episodes)
  return {
    "success_rate": success_rate,
    "avg_turns": avg_turns,
    "avg_dumps": avg_dumps,
    "avg_bag_remaining": avg_bag_remaining,
    "avg_rack_remaining": avg_rack_remaining,
    "avg_word_zipf": avg_word_zipf,
    "avg_opening_length": avg_opening_length,
    "avg_zero_zipf_words": zero_zipf_words,
    "avg_words_played": avg_words_played,
  }


def fitness_from_metrics(metrics: dict[str, float]) -> float:
  return (
    metrics["success_rate"] * 120.0
    - metrics["avg_turns"] * 1.2
    - metrics["avg_dumps"] * 4.0
    - metrics["avg_rack_remaining"] * 8.0
    - metrics["avg_bag_remaining"] * 0.3
    - metrics["avg_zero_zipf_words"] * 6.0
    + metrics["avg_word_zipf"] * 4.5
    + metrics["avg_opening_length"] * 0.8
    + metrics["avg_words_played"] * 0.4
  )


def tournament_select(evaluated: list[PolicyEvaluation], rng: random.Random, k: int = 3) -> PolicyEvaluation:
  sample = rng.sample(evaluated, k=min(k, len(evaluated)))
  sample.sort(key=lambda item: item.fitness, reverse=True)
  return sample[0]


def crossover_weights(a: dict[str, float], b: dict[str, float], rng: random.Random) -> dict[str, float]:
  child: dict[str, float] = {}
  for name in FEATURE_NAMES:
    if rng.random() < 0.5:
      child[name] = a.get(name, 0.0)
    else:
      child[name] = b.get(name, 0.0)
    if rng.random() < 0.25:
      child[name] = (a.get(name, 0.0) + b.get(name, 0.0)) / 2.0
  return child


def mutate_weights(
  weights: dict[str, float],
  rng: random.Random,
  *,
  mutation_scale: float,
  mutation_rate: float,
) -> dict[str, float]:
  mutated = dict(weights)
  for name in FEATURE_NAMES:
    if rng.random() < mutation_rate:
      mutated[name] = mutated.get(name, 0.0) + rng.gauss(0.0, mutation_scale)
  return mutated


def format_seconds(seconds: float) -> str:
  whole = max(0, int(seconds))
  minutes, secs = divmod(whole, 60)
  hours, minutes = divmod(minutes, 60)
  if hours > 0:
    return f"{hours:d}:{minutes:02d}:{secs:02d}"
  return f"{minutes:02d}:{secs:02d}"

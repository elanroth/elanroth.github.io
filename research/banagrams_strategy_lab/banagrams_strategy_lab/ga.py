from __future__ import annotations

from dataclasses import dataclass
import random
from statistics import mean

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


def evaluate_policy(
  policy: HeuristicPolicy,
  env: SinglePlayerBanagramsEnvironment,
  seeds: list[int],
) -> PolicyEvaluation:
  episodes = [env.run_episode(policy, seed) for seed in seeds]
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
) -> list[PolicyEvaluation]:
  from .policy import RandomPolicy

  random_eval = PolicyEvaluation(
    name="baseline-random",
    fitness=0.0,
    metrics={},
    episodes=[env.run_episode(RandomPolicy(), seed) for seed in seeds],
    weights=None,
  )
  random_eval.metrics = summarize_episodes(random_eval.episodes)
  random_eval.fitness = fitness_from_metrics(random_eval.metrics)

  strategy_eval = evaluate_policy(strategy_only_policy(), env, seeds)
  frequency_eval = evaluate_policy(frequency_aware_policy(), env, seeds)
  return [random_eval, strategy_eval, frequency_eval]


def run_genetic_search(
  env: SinglePlayerBanagramsEnvironment,
  *,
  seed: int,
  generations: int,
  population_size: int,
  episodes_per_eval: int,
) -> GAResult:
  rng = random.Random(seed)
  evaluation_seeds = [seed * 1000 + idx for idx in range(episodes_per_eval)]
  baselines = evaluate_baselines(env, evaluation_seeds)

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

  for generation in range(generations):
    evaluated = [evaluate_policy(policy, env, evaluation_seeds) for policy in population]
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

from __future__ import annotations

from dataclasses import dataclass
import random

from .environment import FEATURE_NAMES, Move, PolicyProtocol


FREQUENCY_AWARE_DEFAULT_WEIGHTS: dict[str, float] = {
  "bias": 0.0,
  "is_place": 1.0,
  "is_dump": -0.4,
  "is_opening": 0.4,
  "word_length": 0.8,
  "long_word_bonus": 2.4,
  "anchor_bonus": 1.2,
  "zipf_score": 0.5,
  "clipped_zipf_score": 1.1,
  "rare_word_indicator": -2.7,
  "zero_zipf_indicator": -6.5,
  "leftover_tiles": -0.15,
  "vowel_balance_score": 2.3,
  "duplicate_count": -1.2,
  "rare_letter_burden": -0.9,
  "board_density": 1.0,
  "compactness_score": 1.0,
  "frontier_ratio": 0.5,
  "uses_all_tiles": 2.5,
  "future_word_options": 0.2,
  "dump_duplicate_relief": 1.8,
  "dump_balance_improvement": 2.2,
  "dump_is_vowel": 0.1,
  "dump_is_rare_letter": 1.0,
  "bag_pressure": 0.6,
}


STRATEGY_ONLY_DEFAULT_WEIGHTS: dict[str, float] = {
  **FREQUENCY_AWARE_DEFAULT_WEIGHTS,
  "zipf_score": 0.0,
  "clipped_zipf_score": 0.0,
  "rare_word_indicator": 0.0,
  "zero_zipf_indicator": 0.0,
}


def score_features(features: dict[str, float], weights: dict[str, float]) -> float:
  return sum(features.get(name, 0.0) * weights.get(name, 0.0) for name in FEATURE_NAMES)


@dataclass(slots=True)
class HeuristicPolicy(PolicyProtocol):
  name: str
  weights: dict[str, float]

  def choose_action(
    self,
    scored_actions: list[tuple[Move, dict[str, float]]],
    rng: random.Random,
  ) -> tuple[Move, dict[str, float], float]:
    ranked = [
      (move, features, score_features(features, self.weights))
      for move, features in scored_actions
    ]
    ranked.sort(
      key=lambda item: (
        -item[2],
        -features_word_length(item[1]),
        action_identity(item[0]),
      )
    )
    return ranked[0]


@dataclass(slots=True)
class RandomPolicy(PolicyProtocol):
  name: str = "baseline-random"

  def choose_action(
    self,
    scored_actions: list[tuple[Move, dict[str, float]]],
    rng: random.Random,
  ) -> tuple[Move, dict[str, float], float]:
    move, features = rng.choice(scored_actions)
    return move, features, 0.0


def frequency_aware_policy() -> HeuristicPolicy:
  return HeuristicPolicy(name="baseline-frequency", weights=dict(FREQUENCY_AWARE_DEFAULT_WEIGHTS))


def strategy_only_policy() -> HeuristicPolicy:
  return HeuristicPolicy(name="baseline-strategy", weights=dict(STRATEGY_ONLY_DEFAULT_WEIGHTS))


def action_identity(move: Move) -> tuple[object, ...]:
  if getattr(move, "kind", "") == "dump":
    return ("dump", getattr(move, "letter"))
  return (
    "place",
    getattr(move, "word"),
    getattr(move, "orientation"),
    getattr(move, "start"),
  )


def features_word_length(features: dict[str, float]) -> float:
  return features.get("word_length", 0.0)

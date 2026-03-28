from __future__ import annotations

import unittest

from helpers import make_word_bank
from banagrams_strategy_lab.environment import SinglePlayerBanagramsEnvironment
from banagrams_strategy_lab.ga import run_genetic_search


class GASmokeTests(unittest.TestCase):
  def test_genetic_search_runs_and_beats_random_baseline(self) -> None:
    bank = make_word_bank(
      {
        "cat": 4.4,
        "act": 4.0,
        "at": 4.6,
        "tax": 3.2,
        "xcat": 0.0,
        "tan": 3.7,
        "ant": 4.2,
      }
    )
    env = SinglePlayerBanagramsEnvironment(bank, bag_size=40, starting_hand=4, min_length=2, max_candidates=64, max_turns=40)
    result = run_genetic_search(env, seed=5, generations=2, population_size=6, episodes_per_eval=4)

    self.assertEqual(len(result.history), 2)
    random_baseline = next(item for item in result.baselines if item.name == "baseline-random")
    self.assertGreaterEqual(result.best.fitness, random_baseline.fitness)


if __name__ == "__main__":
  unittest.main()

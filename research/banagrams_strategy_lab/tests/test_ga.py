from __future__ import annotations

import io
import unittest

from helpers import make_word_bank
from banagrams_strategy_lab.cli import (
  SIMULATE_DURATION_PRESETS,
  TRAIN_DURATION_PRESETS,
  apply_simulate_duration_preset,
  apply_train_duration_preset,
  build_parser,
  simulation_run_label,
  training_run_label,
)
from banagrams_strategy_lab.environment import SinglePlayerBanagramsEnvironment
from banagrams_strategy_lab.ga import ProgressTracker, run_genetic_search


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

  def test_progress_tracker_reaches_total_units(self) -> None:
    bank = make_word_bank(
      {
        "cat": 4.4,
        "act": 4.0,
        "at": 4.6,
        "tax": 3.2,
        "tan": 3.7,
      }
    )
    env = SinglePlayerBanagramsEnvironment(bank, bag_size=40, starting_hand=4, min_length=2, max_candidates=64, max_turns=40)
    stream = io.StringIO()
    progress = ProgressTracker(total_units=2 * (3 + 1 * 4), label="train_ga", stream=stream)

    run_genetic_search(env, seed=5, generations=1, population_size=4, episodes_per_eval=2, progress=progress)
    progress.finish(message="training complete")

    self.assertEqual(progress.completed_units, progress.total_units)
    self.assertIn("generation 1/1", stream.getvalue())

  def test_progress_tracker_can_emit_machine_readable_events(self) -> None:
    events: list[dict[str, object]] = []
    progress = ProgressTracker(total_units=4, label="simulate", stream=io.StringIO(), on_event=events.append)

    progress.set_phase("episodes")
    progress.advance(detail="episode 1/4")
    progress.finish(message="done")

    self.assertTrue(any(event["type"] == "phase" for event in events))
    self.assertTrue(any(event["type"] == "progress" for event in events))
    self.assertTrue(any(event["type"] == "finished" for event in events))

  def test_train_parser_accepts_duration_preset(self) -> None:
    parser = build_parser()
    args = parser.parse_args(["train_ga", "short"])
    preset = apply_train_duration_preset(args)

    self.assertIsNotNone(preset)
    self.assertEqual(preset, TRAIN_DURATION_PRESETS["short"])
    self.assertEqual(args.population, TRAIN_DURATION_PRESETS["short"].population)
    self.assertEqual(args.max_turns, TRAIN_DURATION_PRESETS["short"].max_turns)

  def test_simulate_parser_accepts_duration_preset(self) -> None:
    parser = build_parser()
    args = parser.parse_args(["simulate", "medium"])
    preset = apply_simulate_duration_preset(args)

    self.assertIsNotNone(preset)
    self.assertEqual(preset, SIMULATE_DURATION_PRESETS["medium"])
    self.assertEqual(args.episodes, SIMULATE_DURATION_PRESETS["medium"].episodes)
    self.assertEqual(args.max_turns, SIMULATE_DURATION_PRESETS["medium"].max_turns)

  def test_duration_labels_are_ui_friendly(self) -> None:
    self.assertEqual(training_run_label(TRAIN_DURATION_PRESETS["short"]), "train short")
    self.assertEqual(simulation_run_label(SIMULATE_DURATION_PRESETS["long"]), "simulate long")

  def test_time_budget_can_end_search_early(self) -> None:
    bank = make_word_bank(
      {
        "cat": 4.4,
        "act": 4.0,
        "at": 4.6,
        "tax": 3.2,
        "tan": 3.7,
        "ant": 4.2,
      }
    )
    env = SinglePlayerBanagramsEnvironment(bank, bag_size=40, starting_hand=4, min_length=2, max_candidates=64, max_turns=40)
    result = run_genetic_search(env, seed=5, generations=20, population_size=8, episodes_per_eval=3, time_budget_seconds=0.0)

    self.assertLessEqual(len(result.history), 1)


if __name__ == "__main__":
  unittest.main()

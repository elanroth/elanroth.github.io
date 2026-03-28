from __future__ import annotations

import random
import unittest

from helpers import make_word_bank
from banagrams_strategy_lab.environment import DumpMove, EpisodeState, PlaceMove, SinglePlayerBanagramsEnvironment
from banagrams_strategy_lab.policy import frequency_aware_policy, strategy_only_policy


class EnvironmentTests(unittest.TestCase):
  def setUp(self) -> None:
    self.bank = make_word_bank(
      {
        "cat": 4.1,
        "at": 4.4,
        "act": 3.8,
        "tax": 3.1,
        "xcat": 0.0,
      }
    )
    self.env = SinglePlayerBanagramsEnvironment(self.bank, bag_size=40, starting_hand=4, min_length=2, max_candidates=64)

  def test_opening_moves_are_generated_from_rack(self) -> None:
    state = EpisodeState(board={}, rack=list("CAT"), bag=[])
    moves = self.env.legal_moves(state)
    words = {move.word for move in moves if isinstance(move, PlaceMove)}
    self.assertIn("CAT", words)
    self.assertIn("AT", words)

  def test_single_anchor_attachment_is_generated(self) -> None:
    state = EpisodeState(board={(0, 0): "A"}, rack=list("CT"), bag=[])
    moves = self.env.legal_moves(state)
    words = {move.word for move in moves if isinstance(move, PlaceMove)}
    self.assertIn("CAT", words)

  def test_dump_changes_rack_and_bag(self) -> None:
    state = EpisodeState(board={}, rack=list("QQA"), bag=list("BCDE"))
    next_state = self.env.step(state, DumpMove(letter="Q"), random.Random(4))
    self.assertEqual(len(next_state.rack), 5)
    self.assertEqual(len(next_state.bag), 2)

  def test_frequency_policy_prefers_common_word_over_rare_longer_word(self) -> None:
    state = EpisodeState(board={}, rack=list("XCAT"), bag=[])
    scored = [(move, self.env.featurize_action(state, move)) for move in self.env.legal_moves(state)]

    strategy_move, _, _ = strategy_only_policy().choose_action(scored, random.Random(1))
    frequency_move, _, _ = frequency_aware_policy().choose_action(scored, random.Random(1))

    self.assertEqual(strategy_move.word, "XCAT")
    self.assertEqual(frequency_move.word, "CAT")

  def test_dump_not_generated_when_bag_is_too_small(self) -> None:
    state = EpisodeState(board={(0, 0): "A"}, rack=list("QQ"), bag=list("BC"))
    moves = self.env.legal_moves(state)
    self.assertFalse(any(isinstance(move, DumpMove) for move in moves))

  def test_preview_place_does_not_mutate_original_state(self) -> None:
    state = EpisodeState(board={(0, 0): "A"}, rack=list("CT"), bag=[])
    move = next(move for move in self.env.legal_moves(state) if isinstance(move, PlaceMove) and move.word == "CAT")

    preview = self.env.preview_place(state, move)

    self.assertEqual(state.board, {(0, 0): "A"})
    self.assertEqual(state.rack, list("CT"))
    self.assertEqual(preview.rack, [])
    self.assertGreater(len(preview.board), len(state.board))

  def test_run_episode_is_deterministic_for_seed(self) -> None:
    result_a = self.env.run_episode(frequency_aware_policy(), 11)
    result_b = self.env.run_episode(frequency_aware_policy(), 11)

    self.assertEqual(result_a.turns, result_b.turns)
    self.assertEqual(result_a.dumps_used, result_b.dumps_used)
    self.assertEqual(result_a.words_played, result_b.words_played)
    self.assertEqual(result_a.history, result_b.history)


if __name__ == "__main__":
  unittest.main()

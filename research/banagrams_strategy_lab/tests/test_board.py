from __future__ import annotations

import unittest

from helpers import make_word_bank
from banagrams_strategy_lab.board import extract_words, validate_board


class BoardValidationTests(unittest.TestCase):
  def setUp(self) -> None:
    self.bank = make_word_bank({"cat": 4.0, "at": 4.2, "tan": 3.5})

  def test_valid_cross_board_passes(self) -> None:
    board = {
      (0, 0): "C",
      (1, 0): "A",
      (2, 0): "T",
      (1, 1): "T",
    }
    result = validate_board(board, self.bank.dictionary)
    self.assertTrue(result.valid_board)
    self.assertIn("CAT", extract_words(board))
    self.assertIn("AT", extract_words(board))

  def test_singleton_tile_is_invalid(self) -> None:
    board = {(0, 0): "C"}
    result = validate_board(board, self.bank.dictionary)
    self.assertFalse(result.valid_board)

  def test_disconnected_board_is_invalid(self) -> None:
    board = {(0, 0): "A", (5, 5): "T"}
    result = validate_board(board, self.bank.dictionary)
    self.assertFalse(result.valid_board)

  def test_invalid_word_is_reported(self) -> None:
    board = {
      (0, 0): "Q",
      (1, 0): "A",
      (2, 0): "T",
    }
    result = validate_board(board, self.bank.dictionary)
    self.assertFalse(result.valid_board)
    self.assertIn("QAT", result.invalid_words)


if __name__ == "__main__":
  unittest.main()

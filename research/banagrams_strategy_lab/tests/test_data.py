from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from helpers import make_word_bank
from banagrams_strategy_lab.data import load_dictionary_entries, load_zipf
from banagrams_strategy_lab.distribution import DISTRIBUTIONS, create_bag
import random


class DistributionTests(unittest.TestCase):
  def test_distribution_totals_match_expected_sizes(self) -> None:
    for size in (8, 40, 60, 100, 144):
      self.assertEqual(sum(DISTRIBUTIONS[size].values()), size)

  def test_create_bag_has_expected_length(self) -> None:
    bag = create_bag(60, random.Random(7))
    self.assertEqual(len(bag), 60)


class ZipfAndDictionaryTests(unittest.TestCase):
  def test_load_zipf_and_dictionary_entries(self) -> None:
    with TemporaryDirectory() as tmp:
      zipf_path = Path(tmp) / "zipf.tsv"
      dict_path = Path(tmp) / "dict.txt"
      zipf_path.write_text("cat\t4.2\nqat\t0.0\n", "utf8")
      dict_path.write_text("CAT\nQAT\n", "utf8")

      zipf_map = load_zipf(zipf_path)
      entries = load_dictionary_entries(dict_path, zipf_map, min_length=2)
      by_word = {entry.word: entry for entry in entries}

      self.assertEqual(zipf_map["cat"], 4.2)
      self.assertAlmostEqual(by_word["CAT"].zipf, 4.2)
      self.assertEqual(by_word["QAT"].zipf, 0.0)
      self.assertTrue(by_word["QAT"].zero_zipf)

  def test_word_bank_from_helper_builds_anchor_indexes(self) -> None:
    bank = make_word_bank({"cat": 4.0, "tac": 0.0})
    entries = bank.anchored_entries("A", min_length=3, max_length=3)
    self.assertEqual({entry.word for entry in entries}, {"CAT", "TAC"})


if __name__ == "__main__":
  unittest.main()

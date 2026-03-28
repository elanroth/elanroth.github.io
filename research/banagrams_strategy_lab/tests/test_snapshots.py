from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from helpers import make_word_bank
from banagrams_strategy_lab.snapshots import analyze_snapshot_export


class SnapshotAnalysisTests(unittest.TestCase):
  def test_analyze_snapshot_export_summarizes_nested_snapshots(self) -> None:
    bank = make_word_bank({"cat": 4.3, "at": 4.8})
    payload = {
      "game-123": {
        "snapshots": {
          "observer-1": {
            "1710000000": {
              "capturedAt": 1710000000,
              "bagRemaining": 12,
              "boards": [
                {
                  "tiles": [
                    {"loc": "board", "x": 0, "y": 0, "l": "C"},
                    {"loc": "board", "x": 1, "y": 0, "l": "A"},
                    {"loc": "board", "x": 2, "y": 0, "l": "T"},
                    {"loc": "board", "x": 1, "y": 1, "l": "T"},
                  ]
                }
              ],
            }
          }
        }
      }
    }

    with TemporaryDirectory() as tmp:
      snapshot_path = Path(tmp) / "gameAnalyses.json"
      snapshot_path.write_text(json.dumps(payload), "utf8")
      summary = analyze_snapshot_export(snapshot_path, bank)

    self.assertEqual(summary["games_with_snapshots"], 1)
    self.assertEqual(summary["total_snapshots"], 1)
    self.assertEqual(summary["total_boards"], 1)
    self.assertAlmostEqual(summary["mean_bag_remaining"], 12.0)
    self.assertAlmostEqual(summary["mean_word_length"], 2.5)
    self.assertEqual(summary["zero_zipf_share"], 0.0)
    self.assertEqual(summary["top_words"][0][0], "CAT")


if __name__ == "__main__":
  unittest.main()

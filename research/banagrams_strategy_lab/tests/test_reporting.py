from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from banagrams_strategy_lab.reporting import UPLOAD_ME_FILENAME, make_run_dir, sanitize_label


class ReportingTests(unittest.TestCase):
  def test_sanitize_label_preserves_friendly_shortcuts(self) -> None:
    self.assertEqual(sanitize_label("Med"), "med")
    self.assertEqual(sanitize_label("snapshot-analysis"), "snapshot-analysis")

  def test_make_run_dir_uses_label_in_folder_name(self) -> None:
    with TemporaryDirectory() as tmp:
      run_dir = make_run_dir("short", Path(tmp))
      self.assertEqual(run_dir.parent, Path(tmp))
      self.assertTrue(run_dir.name.startswith("short - "))

  def test_upload_filename_constant_is_obvious(self) -> None:
    self.assertEqual(UPLOAD_ME_FILENAME, "Upload me!.json")


if __name__ == "__main__":
  unittest.main()

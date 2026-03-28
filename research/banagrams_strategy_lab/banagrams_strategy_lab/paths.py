from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
  return Path(__file__).resolve().parents[3]


def project_root() -> Path:
  return Path(__file__).resolve().parents[1]


def artifacts_root() -> Path:
  return project_root() / "artifacts"


def banagrams_dictionary_path(root: Path | None = None) -> Path:
  base = root or repo_root()
  return base / "src" / "Banagrams" / "dictionary.txt"


def wordswords_zipf_path(root: Path | None = None) -> Path:
  base = root or repo_root()
  return base / "public" / "wordswords" / "zipf.tsv"

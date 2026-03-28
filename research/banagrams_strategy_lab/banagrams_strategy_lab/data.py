from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .paths import banagrams_dictionary_path, repo_root, wordswords_zipf_path


ZIPF_CLIP_MAX = 6.0
RARE_ZIPF_THRESHOLD = 1.5


class TrieNode:
  __slots__ = ("children", "word")

  def __init__(self) -> None:
    self.children: dict[str, TrieNode] = {}
    self.word: str | None = None


@dataclass(slots=True)
class WordEntry:
  word: str
  zipf: float
  clipped_zipf: float
  rare: bool
  zero_zipf: bool
  counts: dict[str, int]
  positions_by_letter: dict[str, tuple[int, ...]]


class WordBank:
  def __init__(self, entries: list[WordEntry], dictionary: set[str], zipf_by_word: dict[str, float]) -> None:
    self.entries = entries
    self.dictionary = dictionary
    self.zipf_by_word = zipf_by_word
    self.entries_by_word = {entry.word: entry for entry in entries}
    self.max_word_length = max((len(entry.word) for entry in entries), default=0)
    self.words_by_letter: dict[str, dict[int, list[WordEntry]]] = defaultdict(lambda: defaultdict(list))
    self.trie = TrieNode()

    for entry in entries:
      self._insert_into_trie(entry.word)
      for letter in entry.positions_by_letter:
        self.words_by_letter[letter][len(entry.word)].append(entry)

    for by_length in self.words_by_letter.values():
      for length, bucket in by_length.items():
        by_length[length] = sorted(bucket, key=lambda entry: (-entry.zipf, -len(entry.word), entry.word))

  @classmethod
  def from_repo(
    cls,
    root: Path | None = None,
    *,
    min_length: int = 2,
    dictionary_path: Path | None = None,
    zipf_path: Path | None = None,
  ) -> "WordBank":
    base = root or repo_root()
    dict_path = dictionary_path or banagrams_dictionary_path(base)
    zipf_file = zipf_path or wordswords_zipf_path(base)
    zipf_by_word = load_zipf(zipf_file)
    entries = load_dictionary_entries(dict_path, zipf_by_word, min_length=min_length)
    dictionary = {entry.word for entry in entries}
    return cls(entries, dictionary, zipf_by_word)

  def _insert_into_trie(self, word: str) -> None:
    node = self.trie
    for letter in word:
      node = node.children.setdefault(letter, TrieNode())
    node.word = word

  def words_from_rack_entries(
    self,
    rack: Iterable[str],
    *,
    min_length: int,
    max_length: int,
    limit: int | None = None,
  ) -> list[WordEntry]:
    counter = Counter(letter.upper() for letter in rack)
    results: list[WordEntry] = []

    def dfs(node: TrieNode, depth: int) -> bool:
      if node.word is not None and depth >= min_length:
        results.append(self.entries_by_word[node.word])
        if limit is not None and len(results) >= limit:
          return True
      if depth >= max_length:
        return False

      for letter in sorted(node.children.keys()):
        if counter[letter] <= 0:
          continue
        counter[letter] -= 1
        should_stop = dfs(node.children[letter], depth + 1)
        counter[letter] += 1
        if should_stop:
          return True
      return False

    dfs(self.trie, 0)
    results.sort(key=lambda entry: (-entry.zipf, -len(entry.word), entry.word))
    return results

  def count_rack_words(
    self,
    rack: Iterable[str],
    *,
    min_length: int,
    max_length: int,
    limit: int = 100,
  ) -> int:
    counter = Counter(letter.upper() for letter in rack)
    total = 0

    def dfs(node: TrieNode, depth: int) -> bool:
      nonlocal total
      if node.word is not None and depth >= min_length:
        total += 1
        if total >= limit:
          return True
      if depth >= max_length:
        return False

      for letter in sorted(node.children.keys()):
        if counter[letter] <= 0:
          continue
        counter[letter] -= 1
        should_stop = dfs(node.children[letter], depth + 1)
        counter[letter] += 1
        if should_stop:
          return True
      return False

    dfs(self.trie, 0)
    return total

  def anchored_entries(
    self,
    letter: str,
    *,
    min_length: int,
    max_length: int,
  ) -> list[WordEntry]:
    by_length = self.words_by_letter.get(letter.upper(), {})
    out: list[WordEntry] = []
    for length in range(min_length, max_length + 1):
      out.extend(by_length.get(length, []))
    return out


def load_zipf(path: Path) -> dict[str, float]:
  zipf_by_word: dict[str, float] = {}
  for line in path.read_text("utf8").splitlines():
    trimmed = line.strip()
    if not trimmed:
      continue
    pieces = trimmed.split("\t")
    if len(pieces) != 2:
      continue
    word, raw_zipf = pieces
    try:
      zipf_by_word[word.lower()] = float(raw_zipf)
    except ValueError:
      continue
  return zipf_by_word


def load_dictionary_entries(
  path: Path,
  zipf_by_word: dict[str, float],
  *,
  min_length: int = 2,
) -> list[WordEntry]:
  entries: list[WordEntry] = []
  seen: set[str] = set()
  for line in path.read_text("utf8").splitlines():
    word = "".join(ch for ch in line.strip().upper() if "A" <= ch <= "Z")
    if len(word) < min_length or word in seen:
      continue
    seen.add(word)
    zipf = float(zipf_by_word.get(word.lower(), 0.0))
    positions: dict[str, list[int]] = defaultdict(list)
    for idx, letter in enumerate(word):
      positions[letter].append(idx)
    entries.append(
      WordEntry(
        word=word,
        zipf=zipf,
        clipped_zipf=max(0.0, min(ZIPF_CLIP_MAX, zipf)),
        rare=zipf < RARE_ZIPF_THRESHOLD,
        zero_zipf=zipf <= 0.0,
        counts=dict(Counter(word)),
        positions_by_letter={letter: tuple(idxs) for letter, idxs in positions.items()},
      )
    )
  entries.sort(key=lambda entry: (len(entry.word), entry.word))
  return entries

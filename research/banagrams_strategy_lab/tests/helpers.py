from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
  sys.path.insert(0, str(PROJECT_ROOT))

from banagrams_strategy_lab.data import RARE_ZIPF_THRESHOLD, ZIPF_CLIP_MAX, WordBank, WordEntry  # noqa: E402


def make_word_bank(word_to_zipf: dict[str, float]) -> WordBank:
  entries: list[WordEntry] = []
  zipf_by_word = {word.lower(): zipf for word, zipf in word_to_zipf.items()}
  for raw_word, zipf in sorted(word_to_zipf.items()):
    word = raw_word.upper()
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
  dictionary = {entry.word for entry in entries}
  return WordBank(entries, dictionary, zipf_by_word)

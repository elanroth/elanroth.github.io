from __future__ import annotations

import random


FULL_144: dict[str, int] = {
  "A": 13,
  "B": 3,
  "C": 3,
  "D": 6,
  "E": 18,
  "F": 3,
  "G": 4,
  "H": 3,
  "I": 12,
  "J": 2,
  "K": 2,
  "L": 5,
  "M": 3,
  "N": 8,
  "O": 11,
  "P": 3,
  "Q": 2,
  "R": 9,
  "S": 6,
  "T": 9,
  "U": 6,
  "V": 3,
  "W": 3,
  "X": 2,
  "Y": 3,
  "Z": 2,
}


def scale_to(total: int) -> dict[str, int]:
  letters = list(FULL_144.keys())
  full_total = sum(FULL_144.values())

  base: dict[str, int] = {}
  remainder: dict[str, float] = {}
  running = 0

  for letter in letters:
    raw = (FULL_144[letter] / full_total) * total
    count = max(0, int(raw))
    base[letter] = count
    remainder[letter] = raw - count
    running += count

  scaled = dict(base)

  if running < total:
    order = sorted(
      letters,
      key=lambda letter: (remainder[letter], FULL_144[letter]),
      reverse=True,
    )
    need = total - running
    for letter in order:
      if need <= 0:
        break
      scaled[letter] += 1
      need -= 1
  elif running > total:
    order = sorted(
      letters,
      key=lambda letter: (remainder[letter], FULL_144[letter]),
    )
    extra = running - total
    for letter in order:
      if extra <= 0:
        break
      if scaled[letter] > 0:
        scaled[letter] -= 1
        extra -= 1

  return scaled


DISTRIBUTIONS: dict[int, dict[str, int]] = {
  8: {"A": 8},
  40: scale_to(40),
  60: scale_to(60),
  100: scale_to(100),
  144: dict(FULL_144),
}


def create_bag(size: int, rng: random.Random) -> list[str]:
  distribution = DISTRIBUTIONS.get(size, DISTRIBUTIONS[60])
  bag: list[str] = []
  for letter, count in distribution.items():
    bag.extend([letter] * count)
  rng.shuffle(bag)
  return bag

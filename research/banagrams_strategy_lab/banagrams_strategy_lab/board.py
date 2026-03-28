from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass


Coord = tuple[int, int]
Board = dict[Coord, str]


@dataclass(slots=True)
class ValidationResult:
  valid_board: bool
  valid_words: tuple[str, ...]
  invalid_words: tuple[str, ...]


def board_bounds(board: Board) -> tuple[Coord, Coord] | None:
  if not board:
    return None
  xs = [coord[0] for coord in board]
  ys = [coord[1] for coord in board]
  return (min(xs), min(ys)), (max(xs), max(ys))


def board_area(board: Board) -> int:
  bounds = board_bounds(board)
  if bounds is None:
    return 0
  (min_x, min_y), (max_x, max_y) = bounds
  return (max_x - min_x + 1) * (max_y - min_y + 1)


def frontier_count(board: Board) -> int:
  frontier: set[Coord] = set()
  for x, y in board:
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
      neighbor = (x + dx, y + dy)
      if neighbor not in board:
        frontier.add(neighbor)
  return len(frontier)


def extract_words(board: Board) -> list[str]:
  words: list[str] = []
  for grouped, axis in ((group_by_row(board), "row"), (group_by_col(board), "col")):
    for tiles in grouped.values():
      sorted_tiles = sorted(tiles, key=lambda item: item[0][0] if axis == "row" else item[0][1])
      run: list[tuple[Coord, str]] = []
      for idx in range(len(sorted_tiles) + 1):
        current = sorted_tiles[idx] if idx < len(sorted_tiles) else None
        previous = sorted_tiles[idx - 1] if idx > 0 else None
        is_break = current is None
        if current is not None and previous is not None:
          gap = current[0][0] - previous[0][0] if axis == "row" else current[0][1] - previous[0][1]
          is_break = gap > 1
        if is_break:
          if len(run) >= 2:
            words.append("".join(letter for _, letter in run))
          run = []
        if current is not None:
          run.append(current)
  return words


def validate_board(board: Board, dictionary: set[str]) -> ValidationResult:
  if not board:
    return ValidationResult(valid_board=True, valid_words=(), invalid_words=())

  valid_words: list[str] = []
  invalid_words: list[str] = []
  valid_tiles: set[Coord] = set()
  singleton_tiles: set[Coord] = set()

  for grouped, axis in ((group_by_row(board), "row"), (group_by_col(board), "col")):
    for tiles in grouped.values():
      sorted_tiles = sorted(tiles, key=lambda item: item[0][0] if axis == "row" else item[0][1])
      run: list[tuple[Coord, str]] = []
      for idx in range(len(sorted_tiles) + 1):
        current = sorted_tiles[idx] if idx < len(sorted_tiles) else None
        previous = sorted_tiles[idx - 1] if idx > 0 else None
        is_break = current is None
        if current is not None and previous is not None:
          gap = current[0][0] - previous[0][0] if axis == "row" else current[0][1] - previous[0][1]
          is_break = gap > 1
        if is_break:
          if len(run) == 1:
            singleton_tiles.add(run[0][0])
          elif len(run) >= 2:
            word = "".join(letter for _, letter in run)
            if word in dictionary:
              valid_words.append(word)
              valid_tiles.update(coord for coord, _ in run)
            else:
              invalid_words.append(word)
          run = []
        if current is not None:
          run.append(current)

  valid_board = True
  if invalid_words:
    valid_board = False

  for coord in singleton_tiles:
    if coord not in valid_tiles:
      valid_board = False

  if not is_contiguous(board):
    valid_board = False

  return ValidationResult(
    valid_board=valid_board,
    valid_words=tuple(valid_words),
    invalid_words=tuple(invalid_words),
  )


def group_by_row(board: Board) -> dict[int, list[tuple[Coord, str]]]:
  rows: dict[int, list[tuple[Coord, str]]] = defaultdict(list)
  for coord, letter in board.items():
    rows[coord[1]].append((coord, letter))
  return rows


def group_by_col(board: Board) -> dict[int, list[tuple[Coord, str]]]:
  cols: dict[int, list[tuple[Coord, str]]] = defaultdict(list)
  for coord, letter in board.items():
    cols[coord[0]].append((coord, letter))
  return cols


def is_contiguous(board: Board) -> bool:
  if not board:
    return True
  start = next(iter(board.keys()))
  queue: deque[Coord] = deque([start])
  seen: set[Coord] = set()

  while queue:
    coord = queue.popleft()
    if coord in seen:
      continue
    seen.add(coord)
    x, y = coord
    for neighbor in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
      if neighbor in board and neighbor not in seen:
        queue.append(neighbor)

  return len(seen) == len(board)

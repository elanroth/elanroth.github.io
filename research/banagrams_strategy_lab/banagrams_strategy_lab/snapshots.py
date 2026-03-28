from __future__ import annotations

from collections import Counter
from pathlib import Path
import json
from statistics import mean
from typing import Any

from .board import Board, board_area, extract_words, frontier_count
from .data import WordBank


def analyze_snapshot_export(path: Path, word_bank: WordBank) -> dict[str, Any]:
  raw = json.loads(path.read_text("utf8"))
  snapshots = list(iter_snapshots(raw))
  boards: list[Board] = []
  bag_remaining: list[int] = []
  word_lengths: list[int] = []
  word_zipfs: list[float] = []
  zero_zipf_count = 0
  total_words = 0
  top_words: Counter[str] = Counter()
  game_ids: set[str] = set()

  for game_id, snapshot in snapshots:
    game_ids.add(game_id)
    bag_remaining.append(int(snapshot.get("bagRemaining", len(snapshot.get("bag", [])))))
    for board_entry in snapshot.get("boards", []):
      board = board_from_snapshot_entry(board_entry)
      if not board:
        continue
      boards.append(board)
      for word in extract_words(board):
        total_words += 1
        top_words[word] += 1
        word_lengths.append(len(word))
        entry = word_bank.entries_by_word.get(word.upper())
        zipf = entry.zipf if entry is not None else 0.0
        word_zipfs.append(zipf)
        if zipf <= 0.0:
          zero_zipf_count += 1

  return {
    "games_with_snapshots": len(game_ids),
    "total_snapshots": len(snapshots),
    "total_boards": len(boards),
    "mean_word_length": mean(word_lengths) if word_lengths else 0.0,
    "mean_word_zipf": mean(word_zipfs) if word_zipfs else 0.0,
    "zero_zipf_share": (zero_zipf_count / total_words) if total_words else 0.0,
    "mean_bag_remaining": mean(bag_remaining) if bag_remaining else 0.0,
    "mean_board_area": mean(board_area(board) for board in boards) if boards else 0.0,
    "mean_frontier_ratio": mean(frontier_count(board) / max(1, len(board)) for board in boards) if boards else 0.0,
    "top_words": top_words.most_common(25),
  }


def iter_snapshots(node: Any, current_game_id: str | None = None):
  if isinstance(node, dict):
    if "boards" in node and "capturedAt" in node:
      yield current_game_id or "unknown", node
      return

    for key, value in node.items():
      next_game_id = current_game_id
      if current_game_id is None and key.startswith("game-"):
        next_game_id = key
      yield from iter_snapshots(value, next_game_id)


def board_from_snapshot_entry(board_entry: dict[str, Any]) -> Board:
  board: Board = {}
  for tile in board_entry.get("tiles", []):
    if tile.get("loc") != "board":
      continue
    try:
      coord = (int(tile["x"]), int(tile["y"]))
      letter = str(tile["l"]).upper()
    except (KeyError, TypeError, ValueError):
      continue
    board[coord] = letter
  return board

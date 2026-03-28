from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import random
from typing import Iterable

from .board import Board, Coord, board_area, extract_words, frontier_count, validate_board
from .data import WordBank, WordEntry
from .distribution import create_bag


VOWELS = frozenset({"A", "E", "I", "O", "U"})
RARE_LETTERS = frozenset({"Q", "J", "X", "Z", "V", "K"})


@dataclass(frozen=True, slots=True)
class PlaceMove:
  word: str
  orientation: str
  start: Coord
  anchor: Coord | None
  anchor_index: int
  zipf: float
  clipped_zipf: float
  rare_word: bool
  zero_zipf: bool
  kind: str = field(init=False, default="place")


@dataclass(frozen=True, slots=True)
class DumpMove:
  letter: str
  kind: str = field(init=False, default="dump")


Move = PlaceMove | DumpMove


@dataclass(slots=True)
class EpisodeState:
  board: Board
  rack: list[str]
  bag: list[str]
  turn: int = 0
  dumps_used: int = 0
  words_played: list[str] = field(default_factory=list)
  done: bool = False
  success: bool = False
  failure_reason: str | None = None


@dataclass(slots=True)
class EpisodeResult:
  success: bool
  turns: int
  dumps_used: int
  bag_remaining: int
  rack_remaining: int
  words_played: list[str]
  mean_word_zipf: float
  zero_zipf_words: int
  opening_word: str | None
  opening_length: int
  history: list[dict[str, object]]
  failure_reason: str | None


class SinglePlayerBanagramsEnvironment:
  def __init__(
    self,
    word_bank: WordBank,
    *,
    bag_size: int = 60,
    starting_hand: int = 20,
    min_length: int = 3,
    max_turns: int = 200,
    max_candidates: int = 256,
    max_anchor_scan_per_bucket: int = 240,
  ) -> None:
    self.word_bank = word_bank
    self.bag_size = bag_size
    self.starting_hand = starting_hand
    self.min_length = min_length
    self.max_turns = max_turns
    self.max_candidates = max_candidates
    self.max_anchor_scan_per_bucket = max_anchor_scan_per_bucket

  def initial_state(self, seed: int) -> EpisodeState:
    rng = random.Random(seed)
    bag = create_bag(self.bag_size, rng)
    rack = bag[: self.starting_hand]
    remaining_bag = bag[self.starting_hand :]
    return EpisodeState(board={}, rack=list(rack), bag=list(remaining_bag))

  def legal_moves(self, state: EpisodeState) -> list[Move]:
    if state.done:
      return []

    rack_counter = Counter(state.rack)
    moves: list[Move] = []

    if not state.board:
      entries = self.word_bank.words_from_rack_entries(
        state.rack,
        min_length=self.min_length,
        max_length=len(state.rack),
        limit=self.max_candidates * 3,
      )
      for entry in entries:
        moves.append(
          PlaceMove(
            word=entry.word,
            orientation="H",
            start=(0, 0),
            anchor=None,
            anchor_index=-1,
            zipf=entry.zipf,
            clipped_zipf=entry.clipped_zipf,
            rare_word=entry.rare,
            zero_zipf=entry.zero_zipf,
          )
        )
      return moves[: self.max_candidates]

    seen: set[tuple[str, str, Coord]] = set()
    anchors = sorted(state.board.items(), key=lambda item: (item[0][1], item[0][0], item[1]))
    max_word_len = min(self.word_bank.max_word_length, len(state.rack) + 1)

    for anchor_coord, anchor_letter in anchors:
      if len(moves) >= self.max_candidates:
        break
      for orientation in ("H", "V"):
        entries = self.word_bank.anchored_entries(
          anchor_letter,
          min_length=self.min_length,
          max_length=max_word_len,
        )
        scanned = 0
        for entry in entries:
          if scanned >= self.max_anchor_scan_per_bucket or len(moves) >= self.max_candidates:
            break
          scanned += 1
          positions = entry.positions_by_letter.get(anchor_letter, ())
          for anchor_index in positions:
            placement = self._try_single_anchor_placement(
              board=state.board,
              word_entry=entry,
              anchor_coord=anchor_coord,
              anchor_index=anchor_index,
              orientation=orientation,
              rack_counter=rack_counter,
            )
            if placement is None:
              continue
            start = placement
            signature = (entry.word, orientation, start)
            if signature in seen:
              continue
            seen.add(signature)
            moves.append(
              PlaceMove(
                word=entry.word,
                orientation=orientation,
                start=start,
                anchor=anchor_coord,
                anchor_index=anchor_index,
                zipf=entry.zipf,
                clipped_zipf=entry.clipped_zipf,
                rare_word=entry.rare,
                zero_zipf=entry.zero_zipf,
              )
            )

    if len(state.bag) >= 3:
      for letter in sorted(set(state.rack)):
        moves.append(DumpMove(letter=letter))

    return moves[: self.max_candidates]

  def featurize_action(self, state: EpisodeState, move: Move) -> dict[str, float]:
    features = {name: 0.0 for name in FEATURE_NAMES}
    features["bias"] = 1.0
    features["bag_pressure"] = 1.0 - (len(state.bag) / max(1, self.bag_size - self.starting_hand))

    if isinstance(move, DumpMove):
      counts = Counter(state.rack)
      before_balance = rack_vowel_balance(state.rack)
      next_rack = remove_letters_from_rack(state.rack, {move.letter: 1})
      after_balance = rack_vowel_balance(next_rack)
      features["is_dump"] = 1.0
      features["dump_duplicate_relief"] = float(max(0, counts[move.letter] - 1))
      features["dump_balance_improvement"] = max(0.0, after_balance - before_balance)
      features["dump_is_vowel"] = 1.0 if move.letter in VOWELS else 0.0
      features["dump_is_rare_letter"] = 1.0 if move.letter in RARE_LETTERS else 0.0
      features["rare_letter_burden"] = float(sum(1 for letter in state.rack if letter in RARE_LETTERS))
      features["duplicate_count"] = float(sum(max(0, count - 1) for count in counts.values()))
      return features

    preview_state = self.preview_place(state, move)
    preview_words = self.word_bank.count_rack_words(
      preview_state.rack,
      min_length=self.min_length,
      max_length=min(7, len(preview_state.rack)),
      limit=40,
    )
    density = len(preview_state.board) / max(1, board_area(preview_state.board))
    features["is_place"] = 1.0
    features["is_opening"] = 1.0 if move.anchor is None else 0.0
    features["word_length"] = float(len(move.word))
    features["long_word_bonus"] = 1.0 if len(move.word) >= 6 else 0.0
    features["anchor_bonus"] = 0.0 if move.anchor is None else 1.0
    features["zipf_score"] = move.zipf
    features["clipped_zipf_score"] = move.clipped_zipf
    features["rare_word_indicator"] = 1.0 if move.rare_word else 0.0
    features["zero_zipf_indicator"] = 1.0 if move.zero_zipf else 0.0
    features["leftover_tiles"] = float(len(preview_state.rack))
    features["vowel_balance_score"] = rack_vowel_balance(preview_state.rack)
    features["duplicate_count"] = float(sum(max(0, count - 1) for count in Counter(preview_state.rack).values()))
    features["rare_letter_burden"] = float(sum(1 for letter in preview_state.rack if letter in RARE_LETTERS))
    features["board_density"] = density
    features["compactness_score"] = density
    features["frontier_ratio"] = frontier_count(preview_state.board) / max(1, len(preview_state.board))
    features["uses_all_tiles"] = 1.0 if not remove_letters_from_rack(state.rack, placement_required_letters(move)) else 0.0
    features["future_word_options"] = float(preview_words)
    return features

  def preview_place(self, state: EpisodeState, move: PlaceMove) -> EpisodeState:
    preview = clone_state(state)
    self._apply_place(preview, move)
    return preview

  def step(self, state: EpisodeState, move: Move, rng: random.Random) -> EpisodeState:
    next_state = clone_state(state)

    if isinstance(move, DumpMove):
      self._apply_dump(next_state, move, rng)
    else:
      self._apply_place(next_state, move)

    next_state.turn += 1

    if self._is_success_state(next_state):
      next_state.done = True
      next_state.success = True
      next_state.failure_reason = None
      return next_state

    if next_state.turn >= self.max_turns:
      next_state.done = True
      next_state.success = False
      next_state.failure_reason = "step_limit"
      return next_state

    return next_state

  def run_episode(self, policy: "PolicyProtocol", seed: int) -> EpisodeResult:
    rng = random.Random(seed)
    state = self.initial_state(seed)
    history: list[dict[str, object]] = []

    while not state.done:
      moves = self.legal_moves(state)
      if not moves:
        state.done = True
        state.success = False
        state.failure_reason = "no_legal_moves"
        break

      scored_actions = [(move, self.featurize_action(state, move)) for move in moves]
      move, features, score = policy.choose_action(scored_actions, rng)
      history.append(
        {
          "turn": state.turn,
          "rack": list(state.rack),
          "bag_remaining": len(state.bag),
          "action": move_to_dict(move),
          "features": features,
          "score": score,
        }
      )
      state = self.step(state, move, rng)

    zipf_values = [self.word_bank.entries_by_word[word].zipf for word in state.words_played if word in self.word_bank.entries_by_word]
    zero_zipf_words = sum(1 for word in state.words_played if self.word_bank.entries_by_word.get(word) and self.word_bank.entries_by_word[word].zero_zipf)
    opening_word = state.words_played[0] if state.words_played else None

    return EpisodeResult(
      success=state.success,
      turns=state.turn,
      dumps_used=state.dumps_used,
      bag_remaining=len(state.bag),
      rack_remaining=len(state.rack),
      words_played=list(state.words_played),
      mean_word_zipf=(sum(zipf_values) / len(zipf_values)) if zipf_values else 0.0,
      zero_zipf_words=zero_zipf_words,
      opening_word=opening_word,
      opening_length=len(opening_word) if opening_word else 0,
      history=history,
      failure_reason=state.failure_reason,
    )

  def _apply_place(self, state: EpisodeState, move: PlaceMove) -> None:
    placements = placement_cells(move)
    required = placement_required_letters(move)
    for coord, letter in placements.items():
      state.board[coord] = letter
    state.rack = remove_letters_from_rack(state.rack, required)
    state.words_played.append(move.word)
    if not state.rack and state.bag:
      state.rack.extend(state.bag[:1])
      state.bag = state.bag[1:]

  def _apply_dump(self, state: EpisodeState, move: DumpMove, rng: random.Random) -> None:
    state.rack = remove_letters_from_rack(state.rack, {move.letter: 1})
    bag = list(state.bag)
    bag.append(move.letter)
    rng.shuffle(bag)
    draw_count = min(3, len(bag))
    state.rack.extend(bag[:draw_count])
    state.bag = bag[draw_count:]
    state.dumps_used += 1

  def _is_success_state(self, state: EpisodeState) -> bool:
    if state.bag or state.rack:
      return False
    validation = validate_board(state.board, self.word_bank.dictionary)
    return validation.valid_board

  def _try_single_anchor_placement(
    self,
    *,
    board: Board,
    word_entry: WordEntry,
    anchor_coord: Coord,
    anchor_index: int,
    orientation: str,
    rack_counter: Counter[str],
  ) -> Coord | None:
    dx, dy = (1, 0) if orientation == "H" else (0, 1)
    start = (anchor_coord[0] - dx * anchor_index, anchor_coord[1] - dy * anchor_index)
    needed = Counter(word_entry.word)
    needed[word_entry.word[anchor_index]] -= 1
    if needed[word_entry.word[anchor_index]] <= 0:
      del needed[word_entry.word[anchor_index]]
    if any(rack_counter[letter] < count for letter, count in needed.items()):
      return None

    next_board = dict(board)
    for idx, letter in enumerate(word_entry.word):
      coord = (start[0] + dx * idx, start[1] + dy * idx)
      existing = board.get(coord)
      if idx == anchor_index:
        if coord != anchor_coord or existing != letter:
          return None
        continue
      if existing is not None:
        return None
      next_board[coord] = letter

    if not validate_board(next_board, self.word_bank.dictionary).valid_board:
      return None
    return start


def clone_state(state: EpisodeState) -> EpisodeState:
  return EpisodeState(
    board=dict(state.board),
    rack=list(state.rack),
    bag=list(state.bag),
    turn=state.turn,
    dumps_used=state.dumps_used,
    words_played=list(state.words_played),
    done=state.done,
    success=state.success,
    failure_reason=state.failure_reason,
  )


def move_to_dict(move: Move) -> dict[str, object]:
  if isinstance(move, DumpMove):
    return {"kind": move.kind, "letter": move.letter}
  return {
    "kind": move.kind,
    "word": move.word,
    "orientation": move.orientation,
    "start": [move.start[0], move.start[1]],
    "anchor": [move.anchor[0], move.anchor[1]] if move.anchor is not None else None,
    "anchor_index": move.anchor_index,
    "zipf": move.zipf,
  }


def placement_required_letters(move: PlaceMove) -> dict[str, int]:
  counts = Counter(move.word)
  if move.anchor is not None:
    anchor_letter = move.word[move.anchor_index]
    counts[anchor_letter] -= 1
    if counts[anchor_letter] <= 0:
      del counts[anchor_letter]
  return dict(counts)


def placement_cells(move: PlaceMove) -> Board:
  dx, dy = (1, 0) if move.orientation == "H" else (0, 1)
  cells: Board = {}
  for idx, letter in enumerate(move.word):
    coord = (move.start[0] + dx * idx, move.start[1] + dy * idx)
    if move.anchor is not None and idx == move.anchor_index:
      continue
    cells[coord] = letter
  return cells


def remove_letters_from_rack(rack: Iterable[str], required: dict[str, int]) -> list[str]:
  remaining = Counter(required)
  out: list[str] = []
  for letter in rack:
    if remaining[letter] > 0:
      remaining[letter] -= 1
      continue
    out.append(letter)
  return out


def rack_vowel_balance(rack: Iterable[str]) -> float:
  rack_list = list(rack)
  if not rack_list:
    return 0.5
  vowels = sum(1 for letter in rack_list if letter in VOWELS)
  ratio = vowels / len(rack_list)
  return max(0.0, 1.0 - abs(ratio - 0.42) / 0.42)


FEATURE_NAMES = [
  "bias",
  "is_place",
  "is_dump",
  "is_opening",
  "word_length",
  "long_word_bonus",
  "anchor_bonus",
  "zipf_score",
  "clipped_zipf_score",
  "rare_word_indicator",
  "zero_zipf_indicator",
  "leftover_tiles",
  "vowel_balance_score",
  "duplicate_count",
  "rare_letter_burden",
  "board_density",
  "compactness_score",
  "frontier_ratio",
  "uses_all_tiles",
  "future_word_options",
  "dump_duplicate_relief",
  "dump_balance_improvement",
  "dump_is_vowel",
  "dump_is_rare_letter",
  "bag_pressure",
]


class PolicyProtocol:
  name: str

  def choose_action(
    self,
    scored_actions: list[tuple[Move, dict[str, float]]],
    rng: random.Random,
  ) -> tuple[Move, dict[str, float], float]:
    raise NotImplementedError

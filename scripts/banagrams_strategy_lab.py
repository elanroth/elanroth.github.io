from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
  repo_root = Path(__file__).resolve().parents[1]
  project_root = repo_root / "research" / "banagrams_strategy_lab"
  sys.path.insert(0, str(project_root))
  from banagrams_strategy_lab.cli import main as cli_main

  return cli_main(sys.argv[1:])


if __name__ == "__main__":
  raise SystemExit(main())

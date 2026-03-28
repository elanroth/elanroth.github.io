# Banagrams Strategy Lab

Offline Python research project for learning Banagrams strategy heuristics.

This lab is separate from the website runtime. It uses:

- the Banagrams dictionary and bag distribution from this repo
- the WordsWords Zipf data as a soft human-likeness prior
- a single-player proxy environment
- a genetic algorithm over interpretable feature weights

## Quickstart

From the repo root:

```bash
python3 scripts/banagrams_strategy_lab.py train_ga --generations 4 --population 10 --episodes-per-eval 6
python3 scripts/banagrams_strategy_lab.py simulate --policy baseline-frequency --episodes 5
python3 scripts/banagrams_strategy_lab.py analyze_snapshots --input /path/to/gameAnalyses.json
```

Artifacts are written under `research/banagrams_strategy_lab/artifacts/`.

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
python3 scripts/banagrams_strategy_lab.py train_ga short
python3 scripts/banagrams_strategy_lab.py train_ga medium
python3 scripts/banagrams_strategy_lab.py train_ga long
python3 scripts/banagrams_strategy_lab.py simulate short
python3 scripts/banagrams_strategy_lab.py simulate medium
python3 scripts/banagrams_strategy_lab.py simulate long
python3 scripts/banagrams_strategy_lab.py train_ga --generations 4 --population 10 --episodes-per-eval 6
python3 scripts/banagrams_strategy_lab.py simulate --policy baseline-frequency --episodes 5
python3 scripts/banagrams_strategy_lab.py analyze_snapshots --input /path/to/gameAnalyses.json
```

Artifacts are written under `research/banagrams_strategy_lab/artifacts/saved_runs/`.

Each run folder now includes a friendly replay file named `Upload me!.json`.

The standalone browser launcher lives behind:

```bash
npm run strategy-lab:dev
```

That UI can browse saved runs, filter them, start parallel `train_ga` and `simulate` jobs, and poll their progress through the local API exposed by the strategy-lab Vite server.

Duration presets target about 1 minute, 10 minutes, and 30 minutes respectively on this machine. The trainer stops on the time budget boundary between policy evaluations, so it may overshoot slightly.

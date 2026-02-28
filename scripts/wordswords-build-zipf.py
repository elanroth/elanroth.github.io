import csv
from pathlib import Path
from wordfreq import zipf_frequency

WORDLIST_PATH = Path("public/wordswords/wordlist.txt")
OUTPUT_PATH = Path("public/wordswords/zipf.tsv")


def read_words(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8").splitlines()
    words: list[str] = []
    for line in raw:
        word = line.strip().lower()
        if not word or word.startswith("#"):
            continue
        if not word.isalpha():
            continue
        words.append(word)
    return words


def main() -> None:
    if not WORDLIST_PATH.exists():
        raise SystemExit(f"Missing word list at {WORDLIST_PATH}")
    words = read_words(WORDLIST_PATH)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        for word in words:
            score = zipf_frequency(word, "en")
            writer.writerow([word, f"{score:.3f}"])

    print("[wordswords-build-zipf]", {
        "wordlist": str(WORDLIST_PATH),
        "output": str(OUTPUT_PATH),
        "words": len(words),
    })


if __name__ == "__main__":
    main()

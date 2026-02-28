import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = process.env.WORDFREQ_INPUT || "data/wordswords/wordfreq.tsv";
const OUTPUT_PATH = process.env.WORDFREQ_OUTPUT || "public/wordswords/zipf.tsv";

async function main() {
  try {
    const input = await readFile(INPUT_PATH, "utf8");
    const lines = input.split(/\r?\n/);
    const out: string[] = [];
    let kept = 0;
    let skipped = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [rawWord, rawZipf] = trimmed.split(/\t|\s{2,}/);
      if (!rawWord || !rawZipf) {
        skipped += 1;
        continue;
      }
      const word = rawWord.toLowerCase();
      if (!/^[a-z]+$/.test(word)) {
        skipped += 1;
        continue;
      }
      const zipf = Number(rawZipf);
      if (!Number.isFinite(zipf)) {
        skipped += 1;
        continue;
      }
      out.push(`${word}\t${zipf}`);
      kept += 1;
    }

    await writeFile(OUTPUT_PATH, `${out.join("\n")}\n`, "utf8");
    console.log("[wordswords-build-zipf]", {
      input: path.resolve(INPUT_PATH),
      output: path.resolve(OUTPUT_PATH),
      kept,
      skipped,
    });
  } catch (err) {
    console.error("[wordswords-build-zipf] failed", String(err));
    console.error(`Place your wordfreq input at ${INPUT_PATH} or set WORDFREQ_INPUT.`);
    process.exit(1);
  }
}

main();

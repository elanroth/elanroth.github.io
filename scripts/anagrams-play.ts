import readline from "node:readline";
import { claimWord, createGame, drawTile } from "../src/Anagrams/engine";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (prompt: string) =>
  new Promise<string>((resolve) => rl.question(prompt, resolve));

const printState = (state: ReturnType<typeof createGame>) => {
  console.log(`\nRevealed: ${state.revealed.join(" ") || "(none)"}`);
  state.players.forEach((player, index) => {
    console.log(
      `Player ${index + 1} (${player.name}) | Score: ${player.score} | Words: ${
        player.words.join(", ") || "(none)"
      }`,
    );
  });
};

const run = async () => {
  console.log("Anagrams CLI (type: draw, claim WORD, show, quit)");
  let state = createGame({ players: ["You"] });

  while (true) {
    const input = (await ask("> ")).trim();
    const [command, ...rest] = input.split(/\s+/);

    if (command === "quit" || command === "exit") {
      break;
    }

    if (command === "draw") {
      const result = drawTile(state);
      state = result.state;
      console.log(result.tile ? `Drew: ${result.tile}` : "No tiles left.");
      printState(state);
      continue;
    }

    if (command === "claim") {
      const word = rest.join("");
      const result = claimWord(state, 0, word);
      state = result.state;
      console.log(result.ok ? `Claimed: ${word}` : `Invalid: ${result.reason}`);
      printState(state);
      continue;
    }

    if (command === "show") {
      printState(state);
      continue;
    }

    console.log("Commands: draw, claim WORD, show, quit");
  }

  rl.close();
};

run();

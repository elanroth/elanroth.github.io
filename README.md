Welcome to the world of Elan

Valid words courteous of https://gist.github.com/deostroll/7693b6f3d48b44a89ee5f57bf750bd32

Plan
- Login page
    - cant see tiles until game starts
- Request a letter
- Dump logic
    - Dump in front of someone
    - Issue: dumping a selection does not give enough new tiles
- Save all words used
    - Save by user for stats
    - End game

In progress
- Started adding end game logic (edited: Game, reducer, types, utils)
- Added see board button but commented out, no logic yet, keep changes small

Completed
* Center board (shift one or two over)
* Peel logic
* Marquee select and move
* Login page (remember always)


Edits post 5 players
- make it big
- add rows at the bottom for more space
- zoom feature to see whole board
- see full board button, include extra rows/cols on the outside

Local Firebase RTDB emulator
- Start the emulator: `firebase emulators:start --only database --project demo`
- Run the app against it: `VITE_FB_USE_EMULATOR=1 VITE_FB_EMULATOR_HOST=127.0.0.1 VITE_FB_EMULATOR_PORT=9000 npm run dev`
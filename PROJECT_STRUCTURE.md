# Project Structure

Snapshot of the current workspace so you can copy/paste into another AI.

```
elanroth.github.io/
├── .editorconfig
├── .env.local
├── .vscode/
│   └── settings.json
├── PROJECT_STRUCTURE.md
├── README.md
├── database-debug.log
├── database.rules.json
├── firebase-debug.log
├── firebase.json
├── index.html
├── package-lock.json
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.js
├── build/                     # Vite build output (for deploy)
│   ├── index.html
│   ├── Elan Roth CV Nov 25.pdf
│   ├── vite.svg
│   ├── assets/
│   │   ├── index-BbiMCuho.css
│   │   ├── index-CHoiP_5G.js
│   │   └── katex-qrhCpa0F.js
│   ├── books/
│   │   ├── godel_escher_bach.jpg
│   │   ├── IMG_1852.jpeg
│   │   ├── IMG_1829.jpeg
│   │   └── placeholder.png
│   └── images/
│       ├── IMG_1852.jpeg
│       ├── IMG_1829.jpeg
│       └── Curr.JPG
├── dist/                      # Vite output (local)
│   ├── index.html
│   ├── index 2.html
│   ├── vite.svg
│   ├── assets/
│   │   ├── index-CiuyY2C8.css
│   │   └── index-C2zDnoCZ.js
│   └── books/
│       ├── godel_escher_bach.jpg
│       └── placeholder.png
├── public/
│   ├── DRP Game Theory.pptx
│   ├── Elan Roth CV.pdf
│   ├── Elan Roth CV Jan 26.pdf
│   ├── vite.svg
│   ├── books/
│   │   ├── godel_escher_bach.jpg
│   │   ├── IMG_1852.jpeg
│   │   ├── IMG_1829.jpeg
│   │   └── placeholder.png
│   └── images/
│       ├── IMG_1852.jpeg
│       ├── IMG_1829.jpeg
│       ├── WhoDunIt.jpg
│       └── Curr.JPG
├── scripts/
├── src/
│   ├── App.tsx
│   ├── Attributions.md
│   ├── LetterTrail.tsx
│   ├── env.d.ts
│   ├── index.css
│   ├── main.tsx
│   ├── react-jsx.d.ts
│   ├── Banagrams/
│   │   ├── Plan.pptx
│   │   ├── Bananagrams Design.pdf
│   │   ├── Banangrams Plan.pdf
│   │   ├── dictionary.txt
│   │   ├── English Words.txt
│   │   └── engine/
│   │       ├── Game.tsx
│   │       ├── InstructionsPage.tsx
│   │       ├── LobbyGate.tsx
│   │       ├── LobbyWaitingRoom.tsx
│   │       ├── _distribution.ts
│   │       ├── board.tsx
│   │       ├── center.ts
│   │       ├── coords.ts
│   │       ├── drag.ts
│   │       ├── reducer.ts
│   │       ├── selection.ts
│   │       ├── tiles.ts
│   │       ├── types.ts
│   │       ├── typingMode.ts
│   │       ├── utils.ts
│   │       ├── firebase/
│   │       │   ├── firebase.ts
│   │       │   └── rtdb.ts
│   │       ├── hooks/
│   │       │   └── useBoardSync.ts
│   │       └── tests/
│   │           ├── GameOptions/
│   │           └── RemoteBoards/
│   ├── canadian/
│   │   ├── dictionary.txt
│   │   └── GreatWhiteNorth.tsx
│   └── styles/
│       └── globals.css
└── .venv/
	├── bin/
	├── include/
	├── lib/
	└── pyvenv.cfg
```

Notes:
- Banagrams game lives in `src/Banagrams/engine/`.
- Build artifacts live in `build/` (deploy) and `dist/` (local Vite output).

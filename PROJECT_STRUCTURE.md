# Project Structure

Snapshot of the current workspace so you can copy/paste into another AI.

```
elanroth.github.io/
├── build/                     # Vite build output (for deploy)
│   ├── index.html
│   └── assets/
├── public/
│   ├── books/
│   └── images/
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── styles/
│   │   └── globals.css
│   ├── components/
│   │   ├── figma/
│   │   │   └── ImageWithFallback.tsx
│   │   ├── tabs/              # Home/Blog/CV/Bookshelf tabs
│   │   │   ├── BlogTab.tsx
│   │   │   ├── Bookshelf.tsx
│   │   │   ├── CVTab.tsx
│   │   │   └── Home.tsx
│   │   └── ui/                # Shadcn-style UI primitives
│   │       ├── accordion.tsx … tooltip.tsx, etc.
│   │       ├── mathblock.css
│   │       └── MathBlock.tsx
│   ├── Banagrams/             # Game implementation
│   │   ├── Banagrams.tsx
│   │   ├── dictionary.txt
│   │   ├── English Words.txt
│   │   └── engine_2/
│   │       ├── Game.tsx
│   │       ├── board.tsx      # validation + contiguity logic
│   │       ├── tiles.ts       # tile state ops (draw/place/move)
│   │       ├── reducer.ts
│   │       ├── types.ts
│   │       ├── _distribution.ts
│   │       ├── center.ts, coords.ts, drag.ts, selection.ts, utils.ts
│   │       ├── firebase/      # rtdb sync helpers
│   │       └── hooks/
│   │           └── useBoardSync.ts
│   └── Banagrams/engine/      # (older engine version)
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.js
└── README.md
```

Notes:
- Banagrams game lives in `src/Banagrams/engine_2/` (current engine); older engine kept in `src/Banagrams/engine/`.
- UI components are under `src/components/ui/` (shadcn-like) and tab content under `src/components/tabs/`.
- Build artifacts live in `build/` for deployment.

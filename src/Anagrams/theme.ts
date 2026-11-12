// The purple editorial theme from Bartholomew (~/bartholomew/src/styles/theme.css,
// itself lifted from the Desktop dashboard): paper background with a radial purple
// glow, white cards with a 2px ink border and an offset purple hard shadow,
// accent-soft card headers, Fraunces serif / Inter labels / JetBrains Mono numerals.
// Scoped to `.anagrams-theme` so it never leaks into the rest of the site.

export const ANAGRAMS_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400;1,9..144,600&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap";

export const ANAGRAMS_THEME_CSS = `
.anagrams-theme {
  --paper: #fbfaf6;
  --paper-2: #f1eee4;
  --ink: #0d0d0d;
  --ink-soft: #2a2a2a;
  --muted: #7a7468;
  --rule-soft: #d4cfc0;

  --accent: #4a3590;
  --accent-dark: #291d5f;
  --accent-soft: #e7e1f3;
  --accent-hi: #b9a8ec;
  --accent-warm: #c2410c;
  --accent-warm-soft: #f7e6d6;

  --done: #3e5e1a;
  --blocked: #a52f1a;
  --shadow-amb: rgba(41, 29, 95, 0.2);

  --serif: "Fraunces", "Iowan Old Style", Charter, Georgia, serif;
  --sans: "Inter", -apple-system, system-ui, sans-serif;
  --mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;

  --radius: 16px;

  min-height: 100vh;
  background-color: var(--paper);
  background-image:
    radial-gradient(1300px 820px at 50% 36%, #e9e1f6 0%, rgba(233, 225, 246, 0.45) 34%, rgba(233, 225, 246, 0) 64%),
    linear-gradient(180deg, #fdfcf8 0%, var(--paper) 46%);
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--serif);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.anagrams-theme *, .anagrams-theme *::before, .anagrams-theme *::after { box-sizing: border-box; }
.anagrams-theme button { font-family: var(--sans); }

/* card: the signature surface */
.ag-card {
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: var(--radius);
  box-shadow: 5px 5px 0 var(--accent), 9px 11px 24px -8px var(--shadow-amb);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ag-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  background: var(--accent-soft);
  border-bottom: 2px solid var(--ink);
}
.ag-card-head h2, .ag-card-head h3 {
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 800;
  color: var(--accent-dark);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent-dark);
  background: #fff;
  border: 1px solid var(--accent-hi);
  border-radius: 999px;
  padding: 1px 8px;
  margin-left: auto;
  white-space: nowrap;
}
.ag-card-body { padding: 14px 16px; }

.ag-chip {
  font-family: var(--sans);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 800;
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
  background: var(--accent);
  color: #fff;
}

/* buttons: outline when selectable, solid when selected (.is-on) */
.ag-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--sans);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-dark);
  background: transparent;
  border: 2px solid var(--accent);
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
  -webkit-tap-highlight-color: transparent;
}
.ag-btn:hover:not(.is-on):not(:disabled) { background: var(--accent-soft); }
.ag-btn.is-on { background: var(--accent); color: #fff; }
.ag-btn.is-on:hover:not(:disabled) { background: var(--accent-dark); border-color: var(--accent-dark); }
.ag-btn:disabled { opacity: 0.45; cursor: default; }
.ag-btn--lg { font-size: 12px; padding: 12px 24px; }
.ag-btn--muted { border-color: var(--rule-soft); color: var(--muted); }
.ag-btn--muted:hover:not(.is-on):not(:disabled) { background: var(--paper-2); color: var(--ink); }
.ag-btn--link {
  border: none;
  background: none;
  padding: 4px 6px;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.ag-btn--link:hover:not(:disabled) { background: none !important; color: var(--accent-dark); }
.ag-pills { display: flex; flex-wrap: wrap; gap: 6px; }

.ag-label {
  display: block;
  font-family: var(--sans);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-dark);
  margin-bottom: 6px;
}
.ag-input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  font-family: var(--serif);
  font-size: 17px;
  color: var(--ink);
  background: #fff;
  outline: none;
  box-shadow: 3px 3px 0 var(--accent-hi);
  transition: box-shadow 0.12s;
}
.ag-input:focus { box-shadow: 3px 3px 0 var(--accent); }
.ag-input::placeholder { color: var(--muted); font-style: italic; }
.ag-input:disabled { background: var(--paper-2); }

.ag-muted { color: var(--muted); }
.ag-mono { font-family: var(--mono); }
.ag-italic { font-family: var(--serif); font-style: italic; }
.ag-error { color: var(--blocked); font-family: var(--sans); font-weight: 700; font-size: 13px; }

/* letter tiles */
.ag-tile {
  width: var(--tile-size, 2rem);
  height: var(--tile-size, 2rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: 7px;
  box-shadow: 2px 2px 0 var(--accent);
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--tile-font, 1.2rem);
  line-height: 1;
  color: var(--ink);
  user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  .anagrams-theme *, .anagrams-theme *::before, .anagrams-theme *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;

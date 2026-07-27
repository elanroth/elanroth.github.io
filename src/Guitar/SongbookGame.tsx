import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Download, Edit3, FileUp, Minus, Pause, Play, Plus, Search, Settings2, Upload, X } from "lucide-react";
import { emptySong, parseArrangement, parseLibrary, type ArrangementToken, type Familiarity, type StrumSong } from "./strum/model";
import { buildOfflineLibrary, createSong, exportLibrary, getSongs, replaceLibrary, requestPersistentStorage, saveSong, type OfflineLibraryProgress } from "./strum/store";
import "./songbook.css";

type ReadingSettings = { fontSize: number; lineHeight: number; autoscrollSpeed: number };
const READING_KEY = "strum-reading-settings-v1";
const defaults: ReadingSettings = { fontSize: 19, lineHeight: 1.7, autoscrollSpeed: 2 };

function readReadingSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(READING_KEY) ?? "{}") } as ReadingSettings; }
  catch { return defaults; }
}

function querySongId() {
  try { return new URL(window.location.href).searchParams.get("song"); }
  catch { return null; }
}

function setSongInUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("song", id); else url.searchParams.delete("song");
  window.history.pushState({}, "", url);
}

function cleanTitle(title: string) { return title.replace(/\s*\(ver \d+\)$/i, ""); }
function displayCapo(capo: number | null) { return capo ? `Capo ${capo}` : "No capo"; }
function coverLetters(song: StrumSong) { return `${song.title[0] ?? "S"}${song.artist[0] ?? "T"}`.toUpperCase(); }
function coverClass(song: StrumSong) { return `cover-${song.id.split("").reduce((total, value) => total + value.charCodeAt(0), 0) % 5}`; }

function transposeChord(chord: string, amount: number) {
  const notes = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return chord.replace(/(^|\/)([A-G](?:#|b)?)/g, (match, prefix: string, root: string) => {
    const index = notes.indexOf(root);
    return index < 0 || !amount ? match : `${prefix}${notes[(index + amount + 12) % 12]}`;
  });
}

type ChordShape = { frets: number[]; base?: number };

// Standard open-position shapes. A slash chord uses the fingering of its main
// chord; the bass note remains visible in the card's chord label.
const CHORD_SHAPES: Record<string, ChordShape> = {
  A: { frets: [-1, 0, 2, 2, 2, 0] }, Am: { frets: [-1, 0, 2, 2, 1, 0] }, A7: { frets: [-1, 0, 2, 0, 2, 0] }, Am7: { frets: [-1, 0, 2, 0, 1, 0] }, Amaj7: { frets: [-1, 0, 2, 1, 2, 0] },
  B: { frets: [-1, 2, 4, 4, 4, 2] }, Bm: { frets: [-1, 2, 4, 4, 3, 2] }, B7: { frets: [-1, 2, 1, 2, 0, 2] }, Bm7: { frets: [-1, 2, 4, 2, 3, 2] }, Bb: { frets: [-1, 1, 3, 3, 3, 1] }, Bbm: { frets: [-1, 1, 3, 3, 2, 1] },
  C: { frets: [-1, 3, 2, 0, 1, 0] }, Cm: { frets: [-1, 3, 5, 5, 4, 3], base: 3 }, C7: { frets: [-1, 3, 2, 3, 1, 0] }, Cmaj7: { frets: [-1, 3, 2, 0, 0, 0] }, Cadd9: { frets: [-1, 3, 2, 0, 3, 3] },
  D: { frets: [-1, -1, 0, 2, 3, 2] }, Dm: { frets: [-1, -1, 0, 2, 3, 1] }, D7: { frets: [-1, -1, 0, 2, 1, 2] }, Dsus2: { frets: [-1, -1, 0, 2, 3, 0] }, Dsus4: { frets: [-1, -1, 0, 2, 3, 3] },
  E: { frets: [0, 2, 2, 1, 0, 0] }, Em: { frets: [0, 2, 2, 0, 0, 0] }, E7: { frets: [0, 2, 0, 1, 0, 0] }, Em7: { frets: [0, 2, 0, 0, 0, 0] }, Emaj7: { frets: [0, 2, 1, 1, 0, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1] }, Fm: { frets: [1, 3, 3, 1, 1, 1] }, Fmaj7: { frets: [-1, -1, 3, 2, 1, 0] },
  G: { frets: [3, 2, 0, 0, 0, 3] }, G7: { frets: [3, 2, 0, 0, 0, 1] }, Gmaj7: { frets: [3, 2, 0, 0, 0, 2] }, G6: { frets: [3, 2, 0, 0, 0, 0] },
};

function chordList(text: string, transpose: number) {
  const chords = new Set<string>();
  for (const token of parseArrangement(text)) {
    if (token.type !== "line") continue;
    for (const run of token.runs) if (run.chord) chords.add(transposeChord(run.chord, transpose));
  }
  return [...chords];
}

function ChordDiagram({ chord }: { chord: string }) {
  const shape = CHORD_SHAPES[chord.replace(/\/[A-G](?:#|b)?$/, "")];
  if (!shape) return <div className="strum-chord-card strum-chord-card-unknown"><strong>{chord}</strong><span>shape<br />not saved</span></div>;
  const base = shape.base ?? 1;
  const strings = [12, 23, 34, 45, 56, 67];
  const frets = [23, 36, 49, 62, 75, 88];
  return <div className="strum-chord-card" aria-label={`${chord} guitar chord diagram`}><strong>{chord}</strong><svg viewBox="0 0 79 100" role="img" aria-hidden="true">
    <line className="strum-chord-nut" x1="12" y1="23" x2="67" y2="23" />
    {strings.map((x) => <line className="strum-chord-string" key={x} x1={x} y1="23" x2={x} y2="88" />)}
    {frets.slice(1).map((y) => <line className="strum-chord-fret" key={y} x1="12" y1={y} x2="67" y2={y} />)}
    {shape.frets.map((fret, index) => fret === 0 ? <text className="strum-chord-open" key={index} x={strings[index]} y="15">o</text> : fret < 0 ? <text className="strum-chord-open" key={index} x={strings[index]} y="15">×</text> : <circle className="strum-chord-dot" key={index} cx={strings[index]} cy={23 + ((fret - base) + .5) * 13} r="4" />)}
    {base > 1 && <text className="strum-chord-base" x="2" y="43">{base}</text>}
  </svg></div>;
}

function ChordRack({ text, transpose }: { text: string; transpose: number }) {
  const chords = useMemo(() => chordList(text, transpose), [text, transpose]);
  if (!chords.length) return null;
  return <aside className="strum-chord-rack" aria-label="Chord diagrams"><span className="strum-kicker">Chords</span><div>{chords.map((chord) => <ChordDiagram chord={chord} key={chord} />)}</div></aside>;
}

function Rating({ rating, compact = false }: { rating: Familiarity; compact?: boolean }) {
  return <span className={`strum-rating ${compact ? "is-compact" : ""}`}>{rating ?? "–"}<small>{compact ? "/5" : "familiarity"}</small></span>;
}

function ArrangementLine({ token, transpose }: { token: ArrangementToken; transpose: number }) {
  if (token.type === "section") return <h3 className="strum-section-label">{token.label}</h3>;
  if (token.type === "blank") return <div className="strum-arrangement-space" />;
  return <p className="strum-lyric-line">{token.runs.map((run, index) => {
    const fragments = run.text.split(/(\s+)/).filter(Boolean);
    let chordPlaced = false;
    return fragments.map((fragment, fragmentIndex) => {
      // Flex children do not retain bare whitespace text nodes. Keep spaces in
      // their own preformatted item so words stay separated under their chords.
      if (/^\s+$/.test(fragment)) return <span className="strum-lyric-space" key={`${index}-${fragmentIndex}`}>{fragment}</span>;
      const chord = !chordPlaced ? run.chord : undefined;
      chordPlaced ||= Boolean(chord);
      return chord
        ? <span className="strum-chord-word" key={`${index}-${fragmentIndex}`}><b>{transposeChord(chord, transpose)}</b><span>{fragment}</span></span>
        : <span className="strum-word" key={`${index}-${fragmentIndex}`}>{fragment}</span>;
    });
  })}</p>;
}

function Arrangement({ text, transpose }: { text: string; transpose: number }) {
  const tokens = useMemo(() => parseArrangement(text), [text]);
  if (!text.trim()) return <div className="strum-empty-arrangement"><strong>No chord sheet on this device yet.</strong><span>Use Edit to paste your own text such as <code>[G]word [C]next</code>.</span></div>;
  return <div className="strum-arrangement">{tokens.map((token, index) => <ArrangementLine token={token} transpose={transpose} key={index} />)}</div>;
}

function Sheet({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return <div className="strum-sheet-backdrop" role="presentation" onMouseDown={close}>
    <section className="strum-sheet" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>{title}</h2><button onClick={close} aria-label="Close"><X size={18} /></button></header>{children}
    </section>
  </div>;
}

function SongEditor({ song, save, close }: { song?: StrumSong; save: (song: StrumSong) => Promise<void>; close: () => void }) {
  const [draft, setDraft] = useState(() => song ?? emptySong({ title: "", artist: "" }));
  const valid = draft.title.trim() && draft.artist.trim();
  return <Sheet title={song ? "Edit song" : "Add song"} close={close}>
    <form className="strum-form" onSubmit={(event) => { event.preventDefault(); if (valid) void save({ ...draft, title: draft.title.trim(), artist: draft.artist.trim() }); }}>
      <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
      <label>Artist<input value={draft.artist} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} required /></label>
      <div className="strum-form-grid"><label>Capo<input type="number" min="0" max="12" value={draft.capo ?? ""} onChange={(event) => setDraft({ ...draft, capo: event.target.value ? Number(event.target.value) : null })} /></label><label>Familiarity<select value={draft.familiarity ?? ""} onChange={(event) => setDraft({ ...draft, familiarity: event.target.value ? Number(event.target.value) as Familiarity : null })}><option value="">Unrated</option>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label></div>
      <label>Original source <small>optional</small><input type="url" value={draft.sourceUrl ?? ""} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…" /></label>
      <label>Chord sheet<textarea value={draft.arrangement} onChange={(event) => setDraft({ ...draft, arrangement: event.target.value })} placeholder={'[Verse 1]\n[G]Put the chord directly before the word\n[Chorus]\n[C]Switch right where it happens'} /></label>
      <p className="strum-form-help">`[G]word` means change to G on “word.” Section labels such as `[Chorus]` stay headings.</p>
      <button className="strum-primary" disabled={!valid} type="submit">{song ? "Save changes" : "Add to library"}</button>
    </form>
  </Sheet>;
}

function LibrarySettings({ reading, setReading, exportJson, importJson, buildLibrary, buildProgress, building, close }: { reading: ReadingSettings; setReading: (patch: Partial<ReadingSettings>) => void; exportJson: () => void; importJson: (file: File) => void; buildLibrary: () => void; buildProgress: OfflineLibraryProgress | null; building: boolean; close: () => void }) {
  const importRef = useRef<HTMLInputElement>(null);
  return <Sheet title="Settings" close={close}>
    <div className="strum-settings">
      <section><h3>Reading</h3><label>Text size <b>{reading.fontSize}px</b><input type="range" min="15" max="28" value={reading.fontSize} onChange={(event) => setReading({ fontSize: Number(event.target.value) })} /></label><label>Line spacing <b>{reading.lineHeight.toFixed(1)}</b><input type="range" min="1.3" max="2.2" step="0.1" value={reading.lineHeight} onChange={(event) => setReading({ lineHeight: Number(event.target.value) })} /></label><label>Default autoscroll <b>{reading.autoscrollSpeed}</b><input type="range" min="1" max="5" value={reading.autoscrollSpeed} onChange={(event) => setReading({ autoscrollSpeed: Number(event.target.value) })} /></label></section>
      <section><h3>Private library</h3><p>This device keeps your complete chord sheets in private browser storage. Cloud sync is intentionally inactive until its authenticated Firebase setup is connected.</p><button className="strum-primary" disabled={building || !navigator.onLine} onClick={buildLibrary}><Download size={15} /> {building ? `Saving ${buildProgress?.completed ?? 0}/${buildProgress?.total ?? 0}…` : "Build offline library"}</button>{buildProgress && <p>{building ? `${buildProgress.saved} lyric sheets saved so far.` : `${buildProgress.saved} lyric sheets saved${buildProgress.chorded ? ` · ${buildProgress.chorded} with saved chords` : ""}.`}</p>}<button onClick={exportJson}><Download size={15} /> Export private JSON</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) importJson(file); event.currentTarget.value = ""; }} /><button onClick={() => importRef.current?.click()}><Upload size={15} /> Replace from JSON</button></section>
    </div>
  </Sheet>;
}

export function SongbookGame() {
  const [songs, setSongs] = useState<StrumSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(querySongId());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "strong" | "three" | "learning" | "unrated">("all");
  const [editor, setEditor] = useState<StrumSong | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reading, setReading] = useState(readReadingSettings);
  const [transpose, setTranspose] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const [notice, setNotice] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState<OfflineLibraryProgress | null>(null);
  const songPageRef = useRef<HTMLElement>(null);

  const reload = async () => { setLoading(true); try { setSongs(await getSongs()); } catch { setNotice("STRUM could not open private browser storage."); } finally { setLoading(false); } };
  useEffect(() => { void reload(); void requestPersistentStorage(); }, []);
  useEffect(() => { localStorage.setItem(READING_KEY, JSON.stringify(reading)); }, [reading]);
  useEffect(() => { const pop = () => setSelectedId(querySongId()); window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop); }, []);
  useEffect(() => { if (!scrolling) return; const timer = window.setInterval(() => songPageRef.current?.scrollBy({ top: 1 }), Math.max(20, 80 - reading.autoscrollSpeed * 12)); return () => window.clearInterval(timer); }, [scrolling, reading.autoscrollSpeed]);

  const selected = songs.find((song) => song.id === selectedId) ?? null;
  const filtered = useMemo(() => songs.filter((song) => {
    const matchText = `${song.title} ${song.artist}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    const matchRating = filter === "all" || (filter === "strong" && (song.familiarity ?? 0) >= 4) || (filter === "three" && song.familiarity === 3) || (filter === "learning" && !!song.familiarity && song.familiarity <= 2) || (filter === "unrated" && song.familiarity === null);
    return matchText && matchRating;
  }), [songs, query, filter]);

  function selectSong(id: string) { setSongInUrl(id); setSelectedId(id); setTranspose(0); }
  function backToLibrary() { setSongInUrl(null); setSelectedId(null); setScrolling(false); }
  async function persist(song: StrumSong) { if (songs.some((item) => item.id === song.id)) await saveSong(song); else await createSong(song); setEditor(null); await reload(); setNotice("Saved privately on this device."); }
  async function updateSelected(patch: Partial<StrumSong>) { if (!selected) return; const next = await saveSong({ ...selected, ...patch }); setSongs((current) => current.map((song) => song.id === next.id ? next : song)); }
  async function exportJson() { const library = await exportLibrary(); const blob = new Blob([JSON.stringify(library, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `strum-private-library-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setNotice("Private library exported."); }
  async function importJson(file: File) { try { const library = parseLibrary(JSON.parse(await file.text())); if (!window.confirm(`Replace this device's ${songs.length} songs with ${library.songs.length} imported songs?`)) return; await replaceLibrary(library); await reload(); setNotice("Private library replaced from JSON."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not read that JSON file."); } }
  async function buildLibrary() { if (building) return; setBuilding(true); setBuildProgress(null); try { const result = await buildOfflineLibrary(setBuildProgress); await reload(); setNotice(`Offline library updated: ${result.saved} lyric sheets saved${result.chorded ? `, ${result.chorded} with saved chord placements` : ""}${result.unavailable ? `; ${result.unavailable} unavailable` : ""}${result.failed ? `; ${result.failed} could not download` : ""}.`); } catch { setNotice("Could not build the offline library. Check your connection and try again."); } finally { setBuilding(false); } }

  if (selected) return <div className="strum-app strum-song-view"><header className="strum-topbar"><button className="strum-back" onClick={backToLibrary}><ArrowLeft size={16} /> Library</button><span className="strum-status">{navigator.onLine ? "Saved locally" : "Offline"}</span><button className="strum-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings2 size={18} /></button></header><main className="strum-song-page" ref={songPageRef} style={{ "--reading-size": `${reading.fontSize}px`, "--reading-leading": reading.lineHeight } as React.CSSProperties}><div className="strum-song-layout"><ChordRack text={selected.arrangement} transpose={transpose} /><div className="strum-song-content">
    <section className="strum-song-header"><div className={`strum-cover strum-cover-large ${coverClass(selected)}`}>{coverLetters(selected)}</div><div><div className="strum-kicker"><Rating rating={selected.familiarity} /> · {displayCapo(selected.capo)}</div><h1>{cleanTitle(selected.title)}</h1><p>{selected.artist}</p></div></section>
    <section className="strum-control-strip"><button onClick={() => void updateSelected({ capo: Math.max(0, (selected.capo ?? 0) - 1) })}><small>Capo</small><strong><Minus size={13} /> {selected.capo ?? 0}</strong></button><button onClick={() => void updateSelected({ capo: Math.min(12, (selected.capo ?? 0) + 1) })}><small>Capo</small><strong><Plus size={13} /> {selected.capo ?? 0}</strong></button><button onClick={() => setTranspose((value) => Math.max(-6, value - 1))}><small>Transpose</small><strong>−</strong></button><button onClick={() => setTranspose((value) => Math.min(6, value + 1))}><small>Transpose</small><strong>{transpose > 0 ? `+${transpose}` : transpose}</strong></button><button onClick={() => setScrolling((value) => !value)}><small>Autoscroll</small><strong>{scrolling ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Start</>}</strong></button></section>
    <article className="strum-paper"><Arrangement text={selected.arrangement} transpose={transpose} /></article>
    <nav className="strum-song-actions"><button onClick={() => void updateSelected({ familiarity: selected.familiarity === 5 ? null : ((selected.familiarity ?? 0) + 1) as Familiarity })}><Rating rating={selected.familiarity} compact /></button><button className="strum-primary" onClick={() => setEditor(selected)}><Edit3 size={15} /> Edit song</button><button onClick={() => setSettingsOpen(true)}>Reading settings</button></nav>
  </div></div></main>{editor && <SongEditor song={editor === "new" ? undefined : editor} save={persist} close={() => setEditor(null)} />}{settingsOpen && <LibrarySettings reading={reading} setReading={(patch) => setReading((current) => ({ ...current, ...patch }))} exportJson={() => void exportJson()} importJson={(file) => void importJson(file)} buildLibrary={() => void buildLibrary()} buildProgress={buildProgress} building={building} close={() => setSettingsOpen(false)} />}</div>;

  return <div className="strum-app strum-library-view"><header className="strum-topbar"><button className="strum-wordmark" onClick={() => { setQuery(""); setFilter("all"); }}>STRUM</button><span className="strum-status">{navigator.onLine ? "Private library" : "Offline"}</span><button className="strum-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings2 size={18} /></button></header><main className="strum-library-page"><section className="strum-library-heading"><div><span className="strum-kicker">{songs.length} songs · local-first</span><h1>What do you want<br />to play?</h1><p>Chord sheets stay on this device and work without a connection.</p></div><button className="strum-primary" onClick={() => setEditor("new")}><Plus size={16} /> Add song</button></section>{notice && <div className="strum-notice">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}<section className="strum-library-tools"><label className="strum-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs or artists" /></label><div className="strum-filter-row">{([ ["all", "All"], ["strong", "4–5"], ["three", "3"], ["learning", "1–2"], ["unrated", "Unrated"] ] as const).map(([value, label]) => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></section>{loading ? <p className="strum-loading">Opening your private library…</p> : <section className="strum-library-list">{filtered.map((song) => <button className="strum-song-row" key={song.id} onClick={() => selectSong(song.id)}><span className={`strum-cover ${coverClass(song)}`}>{coverLetters(song)}</span><span className="strum-song-copy"><strong>{cleanTitle(song.title)}</strong><small>{song.artist} · {displayCapo(song.capo)}</small>{!song.arrangement.trim() && <em>Needs chord sheet</em>}</span><Rating rating={song.familiarity} /></button>)}{!filtered.length && <div className="strum-empty-state"><strong>No songs match that filter.</strong><span>Add one or try another search.</span></div>}</section>}</main>{editor && <SongEditor song={editor === "new" ? undefined : editor} save={persist} close={() => setEditor(null)} />}{settingsOpen && <LibrarySettings reading={reading} setReading={(patch) => setReading((current) => ({ ...current, ...patch }))} exportJson={() => void exportJson()} importJson={(file) => void importJson(file)} buildLibrary={() => void buildLibrary()} buildProgress={buildProgress} building={building} close={() => setSettingsOpen(false)} />}</div>;
}

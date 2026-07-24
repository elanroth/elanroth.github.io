import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Download, Edit3, ExternalLink, Guitar, Mic, Minus, Pause, Play, Plus, Search, Settings2, Square, Upload } from "lucide-react";
import { IMPORTED_CHORDS } from "./importedChords";
import { SAVED_SONGS, type SavedSong } from "./savedSongs";
import "./songbook.css";

const NOTES_KEY = "songbook-practice-notes-v1";
const SETTINGS_KEY = "songbook-practice-settings-v1";
const CUSTOM_SONGS_KEY = "songbook-custom-songs-v1";
const LYRIC_CHOICES_KEY = "songbook-lyric-choices-v1";
const OFFLINE_LYRICS_KEY = "songbook-offline-lyrics-v1";
const LRCLIB_URL = "https://lrclib.net";
const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

type LrcLyrics = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

type LyricsState =
  | { status: "idle" | "loading" }
  | { status: "ready"; result: LrcLyrics }
  | { status: "ambiguous"; results: LrcLyrics[]; message: string }
  | { status: "missing" | "error"; message: string };

type OfflineProgress = {
  status: "idle" | "running" | "done" | "error";
  completed: number;
  total: number;
  saved: number;
  message?: string;
};

// Curated once from LRCLIB's duplicate/version candidates. User choices made in
// the app take precedence over these defaults.
const PREFERRED_LRCLIB_IDS: Record<string, number> = {
  "2888678": 8302830,  // Truly Madly Deeply — Spotify Singles
  "2741586": 3158,     // All Your'n — Country Squire
  "271523": 16883324,  // Mariner's Revenge Song — Picaresque studio
  "373896": 29814514,  // I'm Yours — standard recording
  "1017988": 1005035,  // Don't Carry It All — The King Is Dead
  "2613978": 28268500, // Don't Let Me Down — demo
  "2325077": 2772439,  // I'm With You — Nation of Two studio
  "3112253": 5526094,  // Willy's Song — Feathers & Fishhooks
};

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function cleanTitle(title: string) { return title.replace(/\s*\(ver \d+\)$/i, ""); }

function normalizeSongName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function chooseLyricResult(song: SavedSong, results: LrcLyrics[], choices: Record<string, number>) {
  const savedChoice = choices[song.id];
  const preferredId = savedChoice === 0 ? undefined : savedChoice ?? PREFERRED_LRCLIB_IDS[song.id];
  const preferred = results.find((result) => result.id === preferredId);
  const titleKey = normalizeSongName(cleanTitle(song.title));
  const artistKey = normalizeSongName(song.artist);
  const exact = results.filter((result) => normalizeSongName(result.trackName) === titleKey && normalizeSongName(result.artistName) === artistKey);
  return preferred ?? exact[0] ?? (results.length === 1 ? results[0] : undefined);
}

function readableSyncedLyrics(value: string) {
  return value.replace(/^\[\d{2}:\d{2}(?:\.\d{2,3})?\]\s*/gm, "").trim();
}

function formatDuration(duration: number | null) {
  if (!duration) return "";
  const seconds = Math.round(duration);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function transposeChord(chord: string, amount: number) {
  if (!amount) return chord;
  return chord.replace(/(^|\/)([A-G](?:#|b)?)/g, (match, prefix: string, root: string) => {
    const index = NOTES.indexOf(root);
    return index < 0 ? match : `${prefix}${NOTES[(index + amount + 12) % 12]}`;
  });
}

function looksLikeChordLine(line: string) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.filter((token) => /^(?:[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?|N\.C\.|[-|x])+[,.]?$/.test(token)).length / tokens.length >= .7;
}

function Arrangement({ text, transpose }: { text: string; transpose: number }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return <div className="formatted-arrangement">{lines.map((line, index) => {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) return <h3 key={index}>{line.trim().slice(1, -1)}</h3>;
    if (/\[[A-G](?:#|b)?[^\]]*\]/.test(line)) {
      const chunks = line.split(/(\[[^\]]+\])/).filter(Boolean);
      const parts: Array<{ chord: string; lyric: string }> = [];
      for (const chunk of chunks) {
        if (/^\[[^\]]+\]$/.test(chunk)) parts.push({ chord: transposeChord(chunk.slice(1, -1), transpose), lyric: "" });
        else if (parts.length) parts[parts.length - 1].lyric += chunk;
        else parts.push({ chord: "", lyric: chunk });
      }
      return <div className="inline-chord-line" key={index}>{parts.map((part, partIndex) => <span key={partIndex}><b>{part.chord}</b><span>{part.lyric || "\u00a0"}</span></span>)}</div>;
    }
    if (looksLikeChordLine(line)) return <div className="chords-over-lyrics" key={index}><b>{line.split(/(\s+)/).map((token) => /\s+/.test(token) ? token : transposeChord(token, transpose))}</b>{lines[index + 1] && !looksLikeChordLine(lines[index + 1]) ? null : <span>&nbsp;</span>}</div>;
    return <div className={line.trim() ? "lyric-line" : "song-space"} key={index}>{line || "\u00a0"}</div>;
  })}</div>;
}

function makeWavBlob(chunks: Float32Array[], sampleRate: number) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); writeText(8, "WAVE"); writeText(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, "data"); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const value of chunk) {
    const clipped = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

function RecordingLab({ song }: { song: SavedSong }) {
  const [audio, setAudio] = useState<{ url: string; name: string } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const playerRef = useRef<HTMLAudioElement>(null);
  const recordingRef = useRef<{ context: AudioContext; source: MediaStreamAudioSourceNode; processor: ScriptProcessorNode; stream: MediaStream; chunks: Float32Array[] } | null>(null);

  function loadAudio(blob: Blob, name: string) {
    setAudio((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { url: URL.createObjectURL(blob), name };
    });
  }

  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url); }, [audio]);
  useEffect(() => () => {
    const session = recordingRef.current;
    if (!session) return;
    session.processor.disconnect(); session.source.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    void session.context.close();
  }, []);
  useEffect(() => { if (playerRef.current) playerRef.current.playbackRate = speed; }, [speed, audio]);

  async function startRecording() {
    setRecordingError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(processor); processor.connect(context.destination);
      recordingRef.current = { context, source, processor, stream, chunks };
      setRecording(true);
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Microphone access was not available.");
    }
  }

  async function stopRecording() {
    const session = recordingRef.current;
    if (!session) return;
    session.processor.disconnect(); session.source.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    const blob = makeWavBlob(session.chunks, session.context.sampleRate);
    await session.context.close();
    recordingRef.current = null; setRecording(false);
    loadAudio(blob, `${cleanTitle(song.title)} - captured recording.wav`);
  }

  return <section className="recording-lab">
    <div className="recording-heading"><div><strong>Practice recording</strong><span>Stays in this tab · free</span></div><a href="https://livechord.org/" target="_blank" rel="noreferrer">Analyze with LiveChord <ExternalLink size={13} /></a></div>
    {!audio ? <div className="recording-dropzone">
      <Upload size={22} /><div><b>Give Songbook a recording</b><span>Pick MP3, WAV, FLAC or OGG—or capture audio through your microphone.</span></div>
      <label className="recording-action"><input type="file" accept="audio/mpeg,audio/wav,audio/flac,audio/ogg,.mp3,.wav,.flac,.ogg" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadAudio(file, file.name); }} />Choose audio</label>
      <button className={recording ? "recording-action is-recording" : "recording-action"} onClick={recording ? stopRecording : startRecording}>{recording ? <><Square size={13} fill="currentColor" /> Stop & use recording</> : <><Mic size={14} /> Record from microphone</>}</button>
    </div> : <div className="recording-player">
      <div className="recording-file"><b>{audio.name}</b><button onClick={() => setAudio(null)}>Choose another</button></div>
      <audio ref={playerRef} src={audio.url} controls />
      <div className="speed-row"><span>Practice speed</span>{[0.5, 0.75, 1].map((value) => <button className={speed === value ? "active" : ""} key={value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
      <div className="recording-next"><a href={audio.url} download={audio.name}><Download size={14} /> Save recording</a><a className="livechord-button" href="https://livechord.org/" target="_blank" rel="noreferrer">Open free chord detection <ExternalLink size={13} /></a></div>
      <p>LiveChord opens separately; choose this same file there. Browsers do not let one website silently send your local recording to another.</p>
    </div>}
    {recordingError && <div className="recording-error">Couldn’t start the microphone: {recordingError}</div>}
    <footer>Chord analysis by <a href="https://livechord.org/" target="_blank" rel="noreferrer">LiveChord</a>, an open-source AGPL-3.0 project. Only use audio you have permission to analyze.</footer>
  </section>;
}

export function SongbookGame() {
  const [query, setQuery] = useState("");
  const [artist, setArtist] = useState("All artists");
  const [selected, setSelected] = useState<SavedSong | null>(null);
  const [customSongs, setCustomSongs] = useState<SavedSong[]>(() => readJson(CUSTOM_SONGS_KEY, []));
  const [lyricChoices, setLyricChoices] = useState<Record<string, number>>(() => readJson(LYRIC_CHOICES_KEY, {}));
  const [offlineLyrics, setOfflineLyrics] = useState<Record<string, LrcLyrics>>(() => readJson(OFFLINE_LYRICS_KEY, {}));
  const [offlineProgress, setOfflineProgress] = useState<OfflineProgress>({ status: "idle", completed: 0, total: 0, saved: 0 });
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [addingSong, setAddingSong] = useState(false);
  const [newSong, setNewSong] = useState({ title: "", artist: "", sourceUrl: "", kind: "Chords" as "Chords" | "Tab" });
  const [notes, setNotes] = useState<Record<string, string>>(() => readJson(NOTES_KEY, {}));
  const [settings, setSettings] = useState<Record<string, { capo: number; transpose: number; fontSize: number }>>(() => readJson(SETTINGS_KEY, {}));
  const [scrolling, setScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2);
  const [editing, setEditing] = useState(false);
  const [lyrics, setLyrics] = useState<LyricsState>({ status: "idle" });
  const practiceRef = useRef<HTMLDivElement>(null);
  const offlineLyricsRef = useRef(offlineLyrics);

  useEffect(() => { localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(customSongs)); }, [customSongs]);
  useEffect(() => { localStorage.setItem(LYRIC_CHOICES_KEY, JSON.stringify(lyricChoices)); }, [lyricChoices]);
  useEffect(() => {
    offlineLyricsRef.current = offlineLyrics;
    try { localStorage.setItem(OFFLINE_LYRICS_KEY, JSON.stringify(offlineLyrics)); }
    catch { setOfflineProgress((progress) => ({ ...progress, status: "error", message: "This browser could not reserve enough offline storage." })); }
  }, [offlineLyrics]);
  useEffect(() => { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => { window.removeEventListener("online", updateOnlineStatus); window.removeEventListener("offline", updateOnlineStatus); };
  }, []);
  useEffect(() => {
    if (!scrolling) return;
    const timer = window.setInterval(() => practiceRef.current?.scrollBy({ top: 1, behavior: "auto" }), Math.max(18, 70 - scrollSpeed * 10));
    return () => window.clearInterval(timer);
  }, [scrolling, scrollSpeed]);
  useEffect(() => {
    if (!selected) { setLyrics({ status: "idle" }); return; }
    const controller = new AbortController();
    const title = cleanTitle(selected.title);
    const cached = offlineLyricsRef.current[selected.id];
    if (cached) setLyrics({ status: "ready", result: cached });
    else setLyrics({ status: "loading" });
    if (!navigator.onLine) {
      if (!cached) setLyrics({ status: "missing", message: "This song was not downloaded before going offline." });
      return;
    }
    const params = new URLSearchParams({ track_name: title, artist_name: selected.artist });
    fetch(`${LRCLIB_URL}/api/search?${params}`, {
      signal: controller.signal,
      headers: { "Lrclib-Client": "Elan-Songbook/1.0 (personal use; elanroth.github.io)" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);
        return response.json() as Promise<LrcLyrics[]>;
      })
      .then((results) => {
        const result = chooseLyricResult(selected, results, lyricChoices);
        if (!result && results.length) setLyrics({ status: "ambiguous", results, message: "Choose the recording that matches the version you play." });
        else if (!result) setLyrics({ status: "missing", message: "No lyrics were found on LRCLIB." });
        else if (!result.plainLyrics && !result.syncedLyrics) setLyrics({ status: "missing", message: "LRCLIB found the track, but it has no lyric text." });
        else {
          setLyrics({ status: "ready", result });
          setOfflineLyrics((current) => current[selected.id]?.id === result.id ? current : { ...current, [selected.id]: result });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cached) setLyrics({ status: "error", message: error instanceof Error ? error.message : "LRCLIB could not be reached." });
      });
    return () => controller.abort();
  }, [selected, lyricChoices]);

  const allSongs = useMemo(() => [...SAVED_SONGS, ...customSongs], [customSongs]);
  const artists = useMemo(() => ["All artists", ...Array.from(new Set(allSongs.map((song) => song.artist))).sort()], [allSongs]);
  const filtered = useMemo(() => allSongs.filter((song) => {
    const text = `${song.title} ${song.artist}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (artist === "All artists" || song.artist === artist);
  }), [allSongs, query, artist]);
  const offlineCount = useMemo(() => allSongs.filter((song) => offlineLyrics[song.id]).length, [allSongs, offlineLyrics]);

  async function saveLibraryOffline() {
    if (!navigator.onLine || offlineProgress.status === "running") return;
    setOfflineProgress({ status: "running", completed: 0, total: allSongs.length, saved: offlineCount });
    const next = { ...offlineLyricsRef.current };
    let completed = 0;
    try {
      for (let index = 0; index < allSongs.length; index += 4) {
        const batch = allSongs.slice(index, index + 4);
        const results = await Promise.all(batch.map(async (song) => {
          const params = new URLSearchParams({ track_name: cleanTitle(song.title), artist_name: song.artist });
          const response = await fetch(`${LRCLIB_URL}/api/search?${params}`, { headers: { "Lrclib-Client": "Elan-Songbook/1.0 (personal offline library; elanroth.github.io)" } });
          if (!response.ok) return undefined;
          const candidates = await response.json() as LrcLyrics[];
          const result = chooseLyricResult(song, candidates, lyricChoices);
          return result && (result.plainLyrics || result.syncedLyrics) ? { song, result } : undefined;
        }));
        for (const match of results) if (match) next[match.song.id] = match.result;
        completed += batch.length;
        offlineLyricsRef.current = next;
        setOfflineLyrics({ ...next });
        setOfflineProgress({ status: "running", completed, total: allSongs.length, saved: allSongs.filter((song) => next[song.id]).length });
      }
      if (navigator.storage?.persist) await navigator.storage.persist();
      const saved = allSongs.filter((song) => next[song.id]).length;
      setOfflineProgress({ status: "done", completed: allSongs.length, total: allSongs.length, saved, message: `${saved} songs are ready without Wi-Fi. ${allSongs.length - saved} still need lyrics or a version choice.` });
    } catch (error) {
      setOfflineProgress({ status: "error", completed, total: allSongs.length, saved: allSongs.filter((song) => next[song.id]).length, message: error instanceof Error ? error.message : "The offline download stopped early." });
    }
  }

  function addSong(event: React.FormEvent) {
    event.preventDefault();
    const title = newSong.title.trim();
    const songArtist = newSong.artist.trim();
    if (!title || !songArtist) return;
    const song: SavedSong = {
      id: `custom-${crypto.randomUUID()}`,
      title,
      artist: songArtist,
      sourceUrl: newSong.sourceUrl.trim(),
      kind: newSong.kind,
      custom: true,
    };
    setCustomSongs((songs) => [...songs, song]);
    setNewSong({ title: "", artist: "", sourceUrl: "", kind: "Chords" });
    setAddingSong(false);
    setSelected(song);
  }

  const songSettings = selected ? (settings[selected.id] ?? { capo: 0, transpose: 0, fontSize: 17 }) : { capo: 0, transpose: 0, fontSize: 17 };
  function updateSettings(patch: Partial<typeof songSettings>) {
    if (!selected) return;
    setSettings((old) => ({ ...old, [selected.id]: { ...songSettings, ...patch } }));
  }
  const importedChordData = selected ? IMPORTED_CHORDS[selected.id] : undefined;
  const transposedChords = importedChordData?.chords.map((chord) => transposeChord(chord, songSettings.transpose)) ?? [];

  if (selected) return (
    <div className="practice-shell">
      <header className="practice-bar">
        <button className="back-library" onClick={() => { setSelected(null); setScrolling(false); }}><ArrowLeft size={17} /> Library</button>
        <div className="practice-title"><strong>{cleanTitle(selected.title)}</strong><span>{selected.artist}</span></div>
        {selected.sourceUrl ? <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">Ultimate Guitar <ExternalLink size={14} /></a> : <span className="source-link personal-source">Personal song</span>}
      </header>
      <div className="practice-layout">
        <aside className="practice-controls">
          <div className="control-label"><Settings2 size={14} /> Player controls</div>
          <label>Capo <span>{songSettings.capo || "None"}</span></label>
          <div className="stepper"><button onClick={() => updateSettings({ capo: Math.max(0, songSettings.capo - 1) })}><Minus /></button><b>{songSettings.capo}</b><button onClick={() => updateSettings({ capo: Math.min(12, songSettings.capo + 1) })}><Plus /></button></div>
          <label>Transpose <span>{songSettings.transpose > 0 ? `+${songSettings.transpose}` : songSettings.transpose}</span></label>
          <div className="stepper"><button onClick={() => updateSettings({ transpose: Math.max(-6, songSettings.transpose - 1) })}><Minus /></button><b>{songSettings.transpose}</b><button onClick={() => updateSettings({ transpose: Math.min(6, songSettings.transpose + 1) })}><Plus /></button></div>
          <label>Text size <span>{songSettings.fontSize}px</span></label>
          <input type="range" min="13" max="28" value={songSettings.fontSize} onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })} />
          <label>Autoscroll <span>Speed {scrollSpeed}</span></label>
          <input type="range" min="1" max="5" value={scrollSpeed} onChange={(e) => setScrollSpeed(Number(e.target.value))} />
          <button className="scroll-button" onClick={() => setScrolling((value) => !value)}>{scrolling ? <Pause /> : <Play />} {scrolling ? "Pause" : "Start"} autoscroll</button>
          {selected.custom && <button className="remove-song" onClick={() => {
            if (!window.confirm(`Remove ${cleanTitle(selected.title)} from your Songbook?`)) return;
            setCustomSongs((songs) => songs.filter((song) => song.id !== selected.id));
            setSelected(null);
          }}>Remove this song</button>}
        </aside>
        <main className="practice-page" ref={practiceRef}>
          <div className="practice-paper" style={{ fontSize: songSettings.fontSize }}>
            <div className="song-kicker">{selected.kind} · {selected.custom ? "added to Songbook" : "saved in My Tabs"}</div>
            <h1>{cleanTitle(selected.title)}</h1><h2>{selected.artist}</h2>
            <RecordingLab key={selected.id} song={selected} />
            {transposedChords.length > 0 && <section className="known-chords">
              <span>Chords from your saved tab</span>
              <p className="chord-setup">{[
                importedChordData?.tuning && `Tuning ${importedChordData.tuning}`,
                importedChordData?.key && `Key ${importedChordData.key}`,
                importedChordData?.capo && importedChordData.capo !== "No capo" ? `Capo ${importedChordData.capo}` : "No capo",
              ].filter(Boolean).join(" · ")}</p>
              <div>{transposedChords.map((chord) => <kbd key={chord}>{chord}</kbd>)}</div>
              <p className="chord-attribution">
                Chord symbols transcribed by {importedChordData?.authorUrl
                  ? <a href={importedChordData.authorUrl} target="_blank" rel="noreferrer">{importedChordData.author}</a>
                  : importedChordData?.author} and sourced from <a href={importedChordData?.sourceUrl} target="_blank" rel="noreferrer">Ultimate Guitar</a>. Personal practice use only.
              </p>
            </section>}
            <section className="lrclib-section">
              <div className="lrclib-heading"><div><strong>Lyrics</strong><span>{offlineLyrics[selected.id] ? "Saved on this device · works offline" : "Downloads once · then works offline"}</span></div><a href={LRCLIB_URL} target="_blank" rel="noreferrer">Lyrics by LRCLIB <ExternalLink size={13} /></a></div>
              {(lyrics.status === "idle" || lyrics.status === "loading") && <div className="lyrics-message">Looking for this song on LRCLIB…</div>}
              {(lyrics.status === "missing" || lyrics.status === "error") && <div className="lyrics-message"><b>{lyrics.status === "error" ? "Couldn’t load lyrics." : "Lyrics unavailable."}</b><span>{lyrics.message}</span><a href={`${LRCLIB_URL}/search/${encodeURIComponent(`${cleanTitle(selected.title)} ${selected.artist}`)}`} target="_blank" rel="noreferrer">Search LRCLIB</a></div>}
              {lyrics.status === "ambiguous" && <div className="lyric-matches"><b>Which version do you play?</b><span>{lyrics.message}</span>{lyrics.results.slice(0, 8).map((result) => <button key={result.id} onClick={() => {
                setLyricChoices((choices) => ({ ...choices, [selected.id]: result.id }));
                setOfflineLyrics((current) => ({ ...current, [selected.id]: result }));
                setLyrics({ status: "ready", result });
              }}><span><strong>{result.trackName}</strong><small>{result.artistName}{result.albumName ? ` · ${result.albumName}` : ""}</small></span><em>{formatDuration(result.duration) || "Choose"}</em></button>)}</div>}
              {lyrics.status === "ready" && <div className="selected-lyric-source">Matched to <b>{lyrics.result.trackName}</b>{lyrics.result.albumName ? ` · ${lyrics.result.albumName}` : ""}{formatDuration(lyrics.result.duration) ? ` · ${formatDuration(lyrics.result.duration)}` : ""}</div>}
              {lyrics.status === "ready" && <div className="fetched-lyrics">{lyrics.result.plainLyrics?.trim() || readableSyncedLyrics(lyrics.result.syncedLyrics || "")}</div>}
              {lyrics.status === "ready" && <button className="change-lyrics-version" onClick={() => {
                setLyricChoices((choices) => ({ ...choices, [selected.id]: 0 }));
                setOfflineLyrics((current) => { const next = { ...current }; delete next[selected.id]; return next; });
                setLyrics({ status: "idle" });
              }}>Find a different recording</button>}
              <div className="lyrics-attribution">Community-contributed lyric text supplied on demand by <a href={LRCLIB_URL} target="_blank" rel="noreferrer">LRCLIB</a>. Rights remain with the respective authors and publishers. Personal practice use only.</div>
            </section>
            <section className="arrangement-notes">
              <div className="arrangement-heading"><div><strong>{editing ? "Edit chord sheet" : "Your chord sheet"}</strong><span>Optional · saved only in this browser</span></div>{(notes[selected.id] ?? "").trim() && <button onClick={() => setEditing((value) => !value)}>{editing ? <><Play size={14} /> Play view</> : <><Edit3 size={14} /> Edit / paste</>}</button>}</div>
              {editing || !(notes[selected.id] ?? "").trim() ? <>
                <div className="import-help">Paste chord-and-lyric text. Chord lines and inline chords like <code>[G]hello [C]world</code> are formatted automatically.</div>
                <textarea value={notes[selected.id] ?? ""} onChange={(e) => { setEditing(true); setNotes((old) => ({ ...old, [selected.id]: e.target.value })); }} placeholder={"[Verse 1]\nG                 C\nYour lyric line goes here\n\nAm                D\nThe next lyric line goes here\n\n—or—\n[G]Your lyric [C]line goes here"} style={{ fontSize: songSettings.fontSize }} />
                {(notes[selected.id] ?? "").trim() && <button className="done-editing" onClick={() => setEditing(false)}><Play size={15} /> Done — show play view</button>}
              </> : <Arrangement text={notes[selected.id]} transpose={songSettings.transpose} />}
            </section>
            <div className="source-notice">Opened or downloaded LRCLIB lyrics and your personal chord sheet stay on this device for offline practice.{selected.sourceUrl ? " The original Ultimate Guitar arrangement remains at the source link." : ""}</div>
          </div>
        </main>
      </div>
    </div>
  );

  return (
    <div className="mytabs-shell">
      <header className="mytabs-header"><div className="mytabs-brand"><span><Guitar /></span><div><b>Songbook</b><small>Elan’s guitar library</small></div></div><div className="library-actions"><button className="offline-library" disabled={!isOnline || offlineProgress.status === "running"} onClick={saveLibraryOffline}><Download size={15} /> {offlineProgress.status === "running" ? `${offlineProgress.completed}/${offlineProgress.total}` : offlineCount ? `${offlineCount} offline` : "Save offline"}</button><button onClick={() => setAddingSong((value) => !value)}><Plus size={15} /> Add song</button><div className="library-count"><strong>{allSongs.length}</strong><span>saved songs</span></div></div></header>
      <main className="mytabs-main">
        <section className="library-intro"><span>Imported from My Tabs</span><h1>What do you want<br />to play?</h1><p>Your complete Ultimate Guitar collection, organized for faster practice.</p></section>
        {offlineCount === 0 && offlineProgress.status === "idle" && <div className="offline-tip"><Download size={16} /><span><b>Taking Songbook off-grid?</b> Tap Save offline while connected, then add this site to your phone’s Home Screen.</span></div>}
        {(!isOnline || offlineProgress.status !== "idle") && <div className={`offline-status ${!isOnline ? "is-offline" : ""}`}><span className="offline-dot" /><div><strong>{!isOnline ? "Offline mode" : offlineProgress.status === "running" ? "Saving your library…" : offlineProgress.status === "error" ? "Offline save needs attention" : "Offline library ready"}</strong><span>{!isOnline ? `${offlineCount} songs are stored on this device.` : offlineProgress.status === "running" ? `${offlineProgress.saved} saved · ${offlineProgress.completed} of ${offlineProgress.total} checked` : offlineProgress.message}</span></div></div>}
        {addingSong && <form className="add-song-form" onSubmit={addSong}>
          <div className="add-song-heading"><div><strong>Add a song</strong><span>Lyrics and version matching happen automatically</span></div><button type="button" onClick={() => setAddingSong(false)}>Cancel</button></div>
          <label><span>Song title</span><input autoFocus required value={newSong.title} onChange={(event) => setNewSong((song) => ({ ...song, title: event.target.value }))} placeholder="e.g. Yihyeh Tov" /></label>
          <label><span>Artist</span><input required value={newSong.artist} onChange={(event) => setNewSong((song) => ({ ...song, artist: event.target.value }))} placeholder="e.g. David Broza" /></label>
          <label className="add-song-source"><span>Ultimate Guitar link <small>optional</small></span><input type="url" value={newSong.sourceUrl} onChange={(event) => setNewSong((song) => ({ ...song, sourceUrl: event.target.value }))} placeholder="https://tabs.ultimate-guitar.com/…" /></label>
          <label><span>Type</span><select value={newSong.kind} onChange={(event) => setNewSong((song) => ({ ...song, kind: event.target.value as "Chords" | "Tab" }))}><option>Chords</option><option>Tab</option></select></label>
          <button className="save-song" type="submit">Add and find lyrics <Plus size={15} /></button>
        </form>}
        <div className="library-toolbar"><label className="library-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs or artists" /></label><label className="artist-filter"><select value={artist} onChange={(e) => setArtist(e.target.value)}>{artists.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown /></label></div>
        <div className="library-table"><div className="library-row library-columns"><span>Song</span><span>Artist</span><span>Type</span><span /></div>{filtered.map((song, index) => <button className="library-row" key={`${song.id}-${song.kind}`} onClick={() => setSelected(song)}><span className="song-index">{String(index + 1).padStart(2, "0")}</span><span className="song-name">{cleanTitle(song.title)}<small>{song.title.match(/\(ver \d+\)/i)?.[0] ?? ""}</small></span><span className="song-artist">{song.artist}</span><span className="song-type">{song.kind}</span><span className="play-song"><Play fill="currentColor" /></span></button>)}</div>
        {filtered.length === 0 && <div className="no-songs">No saved songs match that search.</div>}
      </main>
    </div>
  );
}

import React, { useState, useMemo, useEffect } from "react";

// ─────────────────────────── COLORS (shared warm palette) ───────────────────────────

const C = {
  bg: "#F8EDD4",
  panel: "#F0DDB0",
  border: "#C8A84B",
  fret: "#D4A83A",
  text: "#3D1205",
  textLight: "#7B4F28",
  accent: "#7B3A00",
  finger: "#B83232",
  fingerText: "#FFF5EE",
  green: "#2E6E2E",
  greenBg: "#E4F4E4",
  greenBorder: "#5AB558",
  amber: "#B25A00",
  amberBg: "#FFF3E0",
  amberBorder: "#E6A020",
  blue: "#1A4B8C",
  blueBg: "#E8F0FB",
  blueBorder: "#4A7FCC",
  purple: "#5A2080",
  purpleBg: "#F0E8F8",
  purpleBorder: "#9A60CC",
  gray: "#6B5040",
  grayBg: "rgba(0,0,0,0.06)",
};

// ─────────────────────────── CHORD CATALOG ───────────────────────────

// display label → internal key (matches GuitarApp CHORD_DB keys)
const DISPLAY_TO_KEY: Record<string, string> = {
  "C": "C_maj", "D": "D_maj", "E": "E_maj", "F": "F_maj", "G": "G_maj",
  "A": "A_maj", "B": "B_maj", "A#": "A#_maj", "Bb": "A#_maj",
  "C#": "C#_maj", "D#": "D#_maj", "Eb": "D#_maj",
  "F#": "F#_maj", "G#": "G#_maj",
  "Cm": "C_min", "Dm": "D_min", "Em": "E_min", "Fm": "F_min",
  "Gm": "G_min", "Am": "A_min", "Bm": "B_min",
  "A#m": "A#_min", "Bbm": "A#_min", "C#m": "C#_min", "D#m": "D#_min",
  "F#m": "F#_min", "G#m": "G#_min",
  "C7": "C_7", "D7": "D_7", "E7": "E_7", "F7": "F_7", "G7": "G_7",
  "A7": "A_7", "B7": "B_7", "F#7": "F#_7",
  "Cmaj7": "C_maj7", "Dmaj7": "D_maj7", "Emaj7": "E_maj7",
  "Gmaj7": "G_maj7", "Amaj7": "A_maj7",
  "Am7": "A_min7", "Dm7": "D_min7", "Em7": "E_min7", "Gm7": "G_min7",
  "Dsus2": "D_sus2", "Asus2": "A_sus2", "Dsus4": "D_sus4",
  "Asus4": "A_sus4", "Gsus4": "G_sus4", "Esus4": "E_sus4",
  "Eadd9": "E_add9", "Aadd9": "A_add9",
  "Cdim": "C_dim", "Ddim": "D_dim",
  "Eaug": "E_aug", "Aaug": "A_aug",
  // Common alternate spellings / simplified aliases
  "Cadd9": "C_maj", "Gadd9": "G_maj", "Dadd9": "D_maj",
  "Fmaj7": "F_maj", "Bm7": "B_min",
  "A7sus4": "A_sus4", "Cmaj9": "C_maj7",
  "Gb": "F#_maj",
};

interface CatalogChord {
  display: string;
  key: string;
  difficulty: 1 | 2 | 3 | 4; // 1=easiest open, 4=advanced barre
  group: string;
}

const CHORD_CATALOG: CatalogChord[] = [
  // ── Open beginner ──
  { display: "E",     key: "E_maj",   difficulty: 1, group: "Open Majors" },
  { display: "A",     key: "A_maj",   difficulty: 1, group: "Open Majors" },
  { display: "D",     key: "D_maj",   difficulty: 1, group: "Open Majors" },
  { display: "G",     key: "G_maj",   difficulty: 1, group: "Open Majors" },
  { display: "C",     key: "C_maj",   difficulty: 1, group: "Open Majors" },
  { display: "Em",    key: "E_min",   difficulty: 1, group: "Open Minors" },
  { display: "Am",    key: "A_min",   difficulty: 1, group: "Open Minors" },
  { display: "Dm",    key: "D_min",   difficulty: 1, group: "Open Minors" },
  // ── Open 7ths ──
  { display: "E7",    key: "E_7",     difficulty: 1, group: "Open 7ths" },
  { display: "A7",    key: "A_7",     difficulty: 1, group: "Open 7ths" },
  { display: "D7",    key: "D_7",     difficulty: 1, group: "Open 7ths" },
  { display: "G7",    key: "G_7",     difficulty: 1, group: "Open 7ths" },
  { display: "B7",    key: "B_7",     difficulty: 2, group: "Open 7ths" },
  // ── Open extended ──
  { display: "Em7",   key: "E_min7",  difficulty: 1, group: "Open Extended" },
  { display: "Am7",   key: "A_min7",  difficulty: 1, group: "Open Extended" },
  { display: "Dm7",   key: "D_min7",  difficulty: 2, group: "Open Extended" },
  { display: "Cmaj7", key: "C_maj7",  difficulty: 2, group: "Open Extended" },
  { display: "Gmaj7", key: "G_maj7",  difficulty: 2, group: "Open Extended" },
  { display: "Amaj7", key: "A_maj7",  difficulty: 2, group: "Open Extended" },
  { display: "Emaj7", key: "E_maj7",  difficulty: 2, group: "Open Extended" },
  { display: "Dmaj7", key: "D_maj7",  difficulty: 2, group: "Open Extended" },
  // ── Sus / Add ──
  { display: "Dsus4", key: "D_sus4",  difficulty: 1, group: "Sus & Add" },
  { display: "Dsus2", key: "D_sus2",  difficulty: 1, group: "Sus & Add" },
  { display: "Asus4", key: "A_sus4",  difficulty: 1, group: "Sus & Add" },
  { display: "Asus2", key: "A_sus2",  difficulty: 1, group: "Sus & Add" },
  { display: "Gsus4", key: "G_sus4",  difficulty: 2, group: "Sus & Add" },
  { display: "Esus4", key: "E_sus4",  difficulty: 1, group: "Sus & Add" },
  { display: "Eadd9", key: "E_add9",  difficulty: 2, group: "Sus & Add" },
  { display: "Aadd9", key: "A_add9",  difficulty: 2, group: "Sus & Add" },
  // ── Barre (intermediate) ──
  { display: "F",     key: "F_maj",   difficulty: 3, group: "Barre" },
  { display: "Bm",    key: "B_min",   difficulty: 3, group: "Barre" },
  { display: "B",     key: "B_maj",   difficulty: 3, group: "Barre" },
  { display: "F#m",   key: "F#_min",  difficulty: 3, group: "Barre" },
  { display: "C#m",   key: "C#_min",  difficulty: 3, group: "Barre" },
  { display: "Fm",    key: "F_min",   difficulty: 3, group: "Barre" },
  { display: "Gm",    key: "G_min",   difficulty: 3, group: "Barre" },
  { display: "F#",    key: "F#_maj",  difficulty: 3, group: "Barre" },
  { display: "C#",    key: "C#_maj",  difficulty: 4, group: "Barre" },
  { display: "A#",    key: "A#_maj",  difficulty: 4, group: "Barre" },
  { display: "G#m",   key: "G#_min",  difficulty: 4, group: "Barre" },
  { display: "G#",    key: "G#_maj",  difficulty: 4, group: "Barre" },
];

const CATALOG_BY_KEY = Object.fromEntries(CHORD_CATALOG.map((c) => [c.key, c]));

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Beginner", 2: "Easy", 3: "Intermediate", 4: "Advanced",
};
const DIFFICULTY_COLOR: Record<number, string> = {
  1: C.greenBorder, 2: C.amberBorder, 3: "#D06030", 4: C.finger,
};

// ─────────────────────────── CHORD PROGRESSIONS ───────────────────────────

interface Progression {
  name: string;
  vibe: string;
  chords: string[]; // display names
  bpm?: string;
}

const PROGRESSIONS: Progression[] = [
  // I–IV–V (12 keys)
  { name: "C · F · G", vibe: "Country, Folk, Rock", chords: ["C", "F", "G"] },
  { name: "G · C · D", vibe: "Country, Rock, Pop", chords: ["G", "C", "D"] },
  { name: "D · G · A", vibe: "Country, Folk", chords: ["D", "G", "A"] },
  { name: "A · D · E", vibe: "Rock, Blues, Country", chords: ["A", "D", "E"] },
  { name: "E · A · B", vibe: "Rock, Blues", chords: ["E", "A", "B"] },

  // I–V–vi–IV (the four-chord song)
  { name: "G · D · Em · C", vibe: "Pop (the 4-chord song!)", chords: ["G", "D", "Em", "C"] },
  { name: "C · G · Am · F", vibe: "Pop, Modern", chords: ["C", "G", "Am", "F"] },
  { name: "D · A · Bm · G", vibe: "Pop, Singer-Songwriter", chords: ["D", "A", "Bm", "G"] },
  { name: "A · E · F#m · D", vibe: "Pop, Modern Rock", chords: ["A", "E", "F#m", "D"] },
  { name: "E · B · C#m · A", vibe: "Pop, Modern Rock", chords: ["E", "B", "C#m", "A"] },

  // vi–IV–I–V (minor feel)
  { name: "Am · F · C · G", vibe: "Pop, Emotional", chords: ["Am", "F", "C", "G"] },
  { name: "Em · C · G · D", vibe: "Pop, Folk, Rock", chords: ["Em", "C", "G", "D"] },
  { name: "Bm · G · D · A", vibe: "Pop, Ballad", chords: ["Bm", "G", "D", "A"] },
  { name: "F#m · D · A · E", vibe: "Rock, Ballad", chords: ["F#m", "D", "A", "E"] },

  // I–IV (2-chord loops)
  { name: "E · A", vibe: "Blues, Shuffle", chords: ["E", "A"] },
  { name: "G · C", vibe: "Rock, Folk", chords: ["G", "C"] },
  { name: "D · G", vibe: "Folk, Country", chords: ["D", "G"] },
  { name: "Am · Em", vibe: "Folk, Moody", chords: ["Am", "Em"] },
  { name: "Em · Am", vibe: "Flamenco, Moody", chords: ["Em", "Am"] },

  // Blues 12-bar (simplified)
  { name: "A · D · E7 (12-bar Blues)", vibe: "Blues", chords: ["A", "D", "E7"] },
  { name: "E · A · B7 (12-bar Blues)", vibe: "Blues", chords: ["E", "A", "B7"] },
  { name: "G · C · D7 (Blues in G)", vibe: "Blues, Rock", chords: ["G", "C", "D7"] },

  // I–vi–IV–V (50s progression)
  { name: "C · Am · F · G", vibe: "50s, Doo-Wop", chords: ["C", "Am", "F", "G"] },
  { name: "G · Em · C · D", vibe: "50s, Folk, Pop", chords: ["G", "Em", "C", "D"] },
  { name: "D · Bm · G · A", vibe: "Pop, Classic", chords: ["D", "Bm", "G", "A"] },

  // Andalusian cadence
  { name: "Am · G · F · E", vibe: "Flamenco, Spanish, Rock", chords: ["Am", "G", "F", "E"] },
  { name: "Dm · C · Bb · A", vibe: "Flamenco, Spanish", chords: ["Dm", "C", "Bb", "A"] },

  // ii–V–I
  { name: "Dm · G · C", vibe: "Jazz, Bossa Nova", chords: ["Dm", "G", "C"] },
  { name: "Am · D · G", vibe: "Jazz, Bossa Nova", chords: ["Am", "D", "G"] },
  { name: "Em · A · D", vibe: "Jazz, Bossa Nova", chords: ["Em", "A", "D"] },

  // Mixolydian / Rock feel
  { name: "D · C · G", vibe: "Classic Rock, Mixolydian", chords: ["D", "C", "G"] },
  { name: "A · G · D", vibe: "Rock, Grunge", chords: ["A", "G", "D"] },
  { name: "E · D · A", vibe: "Rock, Power", chords: ["E", "D", "A"] },

  // i–VII–VI–VII (minor rock)
  { name: "Am · G · F · G", vibe: "Rock, Minor", chords: ["Am", "G", "F", "G"] },
  { name: "Em · D · C · D", vibe: "Rock, Folk", chords: ["Em", "D", "C", "D"] },

  // Jazzy 7th progressions
  { name: "Cmaj7 · Am7 · Dm7 · G7", vibe: "Jazz, Bossa Nova", chords: ["Cmaj7", "Am7", "Dm7", "G7"] },
  { name: "Gmaj7 · Em7 · Am7 · D7", vibe: "Jazz, Smooth", chords: ["Gmaj7", "Em7", "Am7", "D7"] },
  { name: "Amaj7 · F#m · Dmaj7 · E", vibe: "Jazz, Soul", chords: ["Amaj7", "F#m", "Dmaj7", "E"] },

  // Sus chord textures
  { name: "Dsus4 · D · G · A", vibe: "Anthemic, Rock", chords: ["Dsus4", "D", "G", "A"] },
  { name: "Asus2 · D · E · A", vibe: "Modern, Acoustic", chords: ["Asus2", "D", "E", "A"] },
];

// ─────────────────────────── SONG DATABASE ───────────────────────────

interface Song {
  title: string;
  artist: string;
  chords: string[];   // display chord names
  genre: string;
  capo?: number;
  note?: string;
  difficulty: 1 | 2 | 3;
}

const SONGS: Song[] = [
  // ───── 1-chord / 2-chord ─────
  { title: "Horse With No Name", artist: "America", chords: ["Em", "D"], genre: "Folk Rock", difficulty: 1, note: "Just 2 chords, alternate throughout" },
  { title: "Knockin' on Heaven's Door", artist: "Bob Dylan", chords: ["G", "D", "Am"], genre: "Folk Rock", difficulty: 1 },
  { title: "Louie Louie", artist: "The Kingsmen", chords: ["A", "D", "Em"], genre: "Rock", difficulty: 1 },
  { title: "Sweet Home Alabama", artist: "Lynyrd Skynyrd", chords: ["D", "C", "G"], genre: "Classic Rock", difficulty: 1 },
  { title: "Wild Thing", artist: "The Troggs", chords: ["A", "D", "E"], genre: "Rock", difficulty: 1 },
  { title: "Twist and Shout", artist: "The Beatles", chords: ["D", "G", "A"], genre: "Rock", difficulty: 1 },
  { title: "Riptide", artist: "Vance Joy", chords: ["Am", "G", "C"], genre: "Indie Pop", difficulty: 1, note: "Capo 1 for original key", capo: 1 },
  { title: "Brown Eyed Girl", artist: "Van Morrison", chords: ["G", "C", "D", "Em"], genre: "Pop Rock", difficulty: 1 },
  { title: "Country Roads (Take Me Home)", artist: "John Denver", chords: ["G", "Em", "C", "D"], genre: "Country Folk", difficulty: 1 },
  { title: "Wagon Wheel", artist: "OCMS / Darius Rucker", chords: ["G", "D", "Em", "C"], genre: "Country Folk", difficulty: 1 },
  { title: "Stand By Me", artist: "Ben E. King", chords: ["G", "Em", "C", "D"], genre: "Soul", difficulty: 1 },
  { title: "Leaving on a Jet Plane", artist: "John Denver", chords: ["G", "C", "D"], genre: "Folk", difficulty: 1 },
  { title: "Wonderful Tonight", artist: "Eric Clapton", chords: ["G", "D", "C", "Em"], genre: "Rock Ballad", difficulty: 1 },
  { title: "Blowin' in the Wind", artist: "Bob Dylan", chords: ["G", "C", "D"], genre: "Folk", difficulty: 1 },
  { title: "Let It Be", artist: "The Beatles", chords: ["C", "G", "Am", "F"], genre: "Pop Rock", difficulty: 1 },
  { title: "No Woman No Cry", artist: "Bob Marley", chords: ["C", "G", "Am", "F"], genre: "Reggae", difficulty: 1 },
  { title: "All of Me (simplified)", artist: "John Legend", chords: ["Am", "F", "C", "G"], genre: "Pop", difficulty: 1 },
  { title: "Zombie", artist: "The Cranberries", chords: ["Am", "F", "C", "G"], genre: "Alternative", difficulty: 1 },
  { title: "Despacito (simplified)", artist: "Luis Fonsi", chords: ["Am", "F", "C", "G"], genre: "Pop", difficulty: 1 },
  { title: "Someone Like You", artist: "Adele", chords: ["A", "E", "F#m", "D"], genre: "Pop Ballad", difficulty: 1 },
  { title: "Rolling in the Deep", artist: "Adele", chords: ["Am", "G", "F", "E"], genre: "Pop/Soul", difficulty: 2, note: "Simplified chords" },
  { title: "Africa", artist: "Toto", chords: ["Am", "G", "F", "G"], genre: "Pop Rock", difficulty: 1 },
  { title: "Yellow", artist: "Coldplay", chords: ["G", "D", "Em", "C", "Bm"], genre: "Alternative", difficulty: 2 },
  { title: "Thinking Out Loud", artist: "Ed Sheeran", chords: ["D", "G", "A", "Em"], genre: "Pop", difficulty: 1 },
  { title: "Perfect", artist: "Ed Sheeran", chords: ["G", "Em", "C", "D"], genre: "Pop", difficulty: 1, capo: 1 },
  { title: "Shape of You", artist: "Ed Sheeran", chords: ["Am", "D", "F", "G"], genre: "Pop", difficulty: 1 },
  { title: "Castle on the Hill", artist: "Ed Sheeran", chords: ["D", "A", "Bm", "G"], genre: "Pop Rock", difficulty: 2 },
  { title: "With or Without You", artist: "U2", chords: ["D", "A", "Bm", "G"], genre: "Rock", difficulty: 2 },
  { title: "Fix You", artist: "Coldplay", chords: ["C", "Em", "Am", "F"], genre: "Alternative", difficulty: 1 },
  { title: "The Scientist", artist: "Coldplay", chords: ["Dm", "Bb", "F", "C"], genre: "Alternative", difficulty: 2 },
  { title: "Clocks", artist: "Coldplay", chords: ["Eb", "Bb", "Fm"], genre: "Alternative", difficulty: 3, note: "Simplified" },
  { title: "Wonderwall", artist: "Oasis", chords: ["Em7", "G", "Dsus4", "A7"], genre: "Indie Rock", difficulty: 2, capo: 2 },
  { title: "Don't Look Back in Anger", artist: "Oasis", chords: ["C", "G", "Am", "E", "F", "G"], genre: "Indie Rock", difficulty: 2 },
  { title: "Champagne Supernova", artist: "Oasis", chords: ["A", "G", "Asus2", "E"], genre: "Indie Rock", difficulty: 1 },
  { title: "Seven Nation Army", artist: "The White Stripes", chords: ["Em", "G", "D", "C", "B7"], genre: "Rock", difficulty: 2 },
  { title: "Come As You Are", artist: "Nirvana", chords: ["Am", "G", "Em", "C"], genre: "Grunge", difficulty: 1 },
  { title: "Smells Like Teen Spirit (simplified)", artist: "Nirvana", chords: ["F#m", "Bm", "E", "G#"], genre: "Grunge", difficulty: 3 },
  { title: "Hotel California (simplified)", artist: "Eagles", chords: ["Am", "E", "G", "D", "F", "C", "Dm"], genre: "Classic Rock", difficulty: 2 },
  { title: "Wish You Were Here", artist: "Pink Floyd", chords: ["Em", "G", "A7", "Am", "D", "C"], genre: "Classic Rock", difficulty: 2 },
  { title: "Time of Your Life (Good Riddance)", artist: "Green Day", chords: ["G", "C", "Dsus4", "Em"], genre: "Pop Punk", difficulty: 1, capo: 5, note: "Fingerpicked, capo 5" },
  { title: "House of the Rising Sun", artist: "The Animals", chords: ["Am", "C", "D", "F", "E"], genre: "Classic Rock", difficulty: 2 },
  { title: "Hallelujah", artist: "Leonard Cohen", chords: ["C", "Am", "F", "G", "E7"], genre: "Folk", difficulty: 2 },
  { title: "Hurt (simplified)", artist: "Johnny Cash / NIN", chords: ["Am", "C", "D", "G"], genre: "Alternative", difficulty: 1 },
  { title: "Ring of Fire", artist: "Johnny Cash", chords: ["G", "C", "D"], genre: "Country", difficulty: 1 },
  { title: "I Walk the Line", artist: "Johnny Cash", chords: ["E", "A", "B7"], genre: "Country", difficulty: 1 },
  { title: "Jolene", artist: "Dolly Parton", chords: ["Am", "C", "G", "Em"], genre: "Country", difficulty: 1 },
  { title: "Mr. Tambourine Man", artist: "Bob Dylan", chords: ["Em", "A", "D", "G"], genre: "Folk", difficulty: 1 },
  { title: "The Sound of Silence", artist: "Simon & Garfunkel", chords: ["Am", "G", "F", "C", "E"], genre: "Folk", difficulty: 2, capo: 0 },
  { title: "Scarborough Fair", artist: "Simon & Garfunkel", chords: ["Am", "G", "C", "D"], genre: "Folk", difficulty: 1 },
  { title: "Fast Car", artist: "Tracy Chapman", chords: ["D", "A", "Bm", "G"], genre: "Folk Rock", difficulty: 2 },
  { title: "Give Me One Reason", artist: "Tracy Chapman", chords: ["A", "D", "E"], genre: "Blues Rock", difficulty: 1 },
  { title: "Hey Soul Sister", artist: "Train", chords: ["E", "B", "C#m", "A"], genre: "Pop", difficulty: 2, capo: 4 },
  { title: "Marry Me", artist: "Train", chords: ["D", "Bm", "G", "A"], genre: "Pop", difficulty: 2 },
  { title: "More Than Words", artist: "Extreme", chords: ["G", "Am7", "C", "D", "Dsus4", "Em"], genre: "Ballad", difficulty: 2 },
  { title: "Patience", artist: "Guns N' Roses", chords: ["C", "G", "A", "D", "Am", "Em"], genre: "Rock Ballad", difficulty: 2 },
  { title: "November Rain (intro)", artist: "Guns N' Roses", chords: ["G", "D", "C", "Am"], genre: "Rock", difficulty: 1 },
  { title: "Creep", artist: "Radiohead", chords: ["G", "B", "C", "Cm"], genre: "Alternative", difficulty: 2 },
  { title: "Fake Plastic Trees", artist: "Radiohead", chords: ["A", "E", "Bm", "F#m", "D"], genre: "Alternative", difficulty: 2 },
  { title: "Use Somebody", artist: "Kings of Leon", chords: ["C", "Dm", "Am", "F"], genre: "Rock", difficulty: 2, note: "Simplified" },
  { title: "All Along the Watchtower", artist: "Bob Dylan / Hendrix", chords: ["Am", "G", "F", "E"], genre: "Rock/Folk", difficulty: 1 },
  { title: "La Bamba", artist: "Ritchie Valens", chords: ["C", "F", "G"], genre: "Rock/Traditional", difficulty: 1 },
  { title: "Surfin' USA", artist: "The Beach Boys", chords: ["A", "D", "E"], genre: "Rock", difficulty: 1 },
  { title: "Hey Jude", artist: "The Beatles", chords: ["F", "C", "Bb", "G", "G7"], genre: "Pop Rock", difficulty: 2 },
  { title: "Let It Be (simplified)", artist: "The Beatles", chords: ["C", "G", "Am", "F"], genre: "Pop Rock", difficulty: 1 },
  { title: "Yesterday", artist: "The Beatles", chords: ["F", "Em", "A7", "Dm", "Bb", "C", "G", "Am"], genre: "Pop", difficulty: 3, capo: 0, note: "Complex chord changes" },
  { title: "Here Comes the Sun", artist: "The Beatles", chords: ["D", "G", "A", "E7", "A7", "Bm"], genre: "Pop Rock", difficulty: 2, capo: 7 },
  { title: "Across the Universe", artist: "The Beatles", chords: ["D", "A", "Bm", "G", "Em", "Dmaj7"], genre: "Pop Rock", difficulty: 2 },
  { title: "Something", artist: "The Beatles", chords: ["C", "Cmaj7", "C7", "F", "D7", "G", "Am", "E7"], genre: "Pop Rock", difficulty: 3 },
  { title: "Heart of Gold", artist: "Neil Young", chords: ["D", "Em", "G", "C", "Am"], genre: "Folk Rock", difficulty: 1 },
  { title: "Old Man", artist: "Neil Young", chords: ["D", "Dsus4", "Am", "G", "Em", "C"], genre: "Folk", difficulty: 2, capo: 4 },
  { title: "The Needle and the Damage Done", artist: "Neil Young", chords: ["D", "Dsus4", "Am", "G"], genre: "Folk", difficulty: 1, capo: 4 },
  { title: "Free Fallin'", artist: "Tom Petty", chords: ["G", "Dsus4", "Cadd9", "C"], genre: "Rock", difficulty: 1, note: "Simplified" },
  { title: "Learning to Fly", artist: "Tom Petty", chords: ["C", "F", "Am", "G"], genre: "Rock", difficulty: 1 },
  { title: "What's Up?", artist: "4 Non Blondes", chords: ["A", "Bm", "D", "G"], genre: "Alternative", difficulty: 2 },
  { title: "Open Arms", artist: "Journey", chords: ["D", "A", "Bm", "G", "E7", "Em"], genre: "Rock Ballad", difficulty: 2 },
  { title: "Don't Stop Believin'", artist: "Journey", chords: ["E", "B", "C#m", "A", "G#m"], genre: "Rock", difficulty: 3 },
  { title: "Piano Man (simplified)", artist: "Billy Joel", chords: ["C", "Am", "G", "F", "E7", "D7"], genre: "Pop", difficulty: 2 },
  { title: "River of Dreams", artist: "Billy Joel", chords: ["C", "Am", "F", "G"], genre: "Pop Rock", difficulty: 1 },
  { title: "Home", artist: "Michael Bublé / Gavin DeGraw", chords: ["G", "D", "Am", "C", "Em"], genre: "Pop", difficulty: 1 },
  { title: "Ho Hey", artist: "The Lumineers", chords: ["F", "C", "Am", "G"], genre: "Folk Pop", difficulty: 1 },
  { title: "Stubborn Love", artist: "The Lumineers", chords: ["C", "Am", "F", "G"], genre: "Folk Pop", difficulty: 1 },
  { title: "Ophelia", artist: "The Lumineers", chords: ["Am", "C", "G", "F"], genre: "Folk Pop", difficulty: 1 },
  { title: "Let Her Go", artist: "Passenger", chords: ["G", "D", "Em", "C", "Am"], genre: "Folk Pop", difficulty: 1, capo: 5 },
  { title: "Skinny Love", artist: "Bon Iver / Birdy", chords: ["Am", "G", "C", "F"], genre: "Indie Folk", difficulty: 1, capo: 5 },
  { title: "Lay Me Down", artist: "Sam Smith", chords: ["C", "Em", "Am", "G", "F"], genre: "Pop Ballad", difficulty: 1 },
  { title: "Stay With Me", artist: "Sam Smith", chords: ["Am", "F", "C", "G"], genre: "Pop Soul", difficulty: 1 },
  { title: "Counting Stars", artist: "OneRepublic", chords: ["Am", "C", "G", "F"], genre: "Pop Rock", difficulty: 1 },
  { title: "Apologize", artist: "OneRepublic / Timbaland", chords: ["Am", "F", "C", "G"], genre: "Pop", difficulty: 1 },
  { title: "Angels", artist: "Robbie Williams", chords: ["G", "Em", "C", "D", "Am"], genre: "Pop", difficulty: 1 },
  { title: "Roxanne (simplified)", artist: "The Police", chords: ["Am", "Em", "Dm", "G", "F", "G", "C"], genre: "Rock", difficulty: 2 },
  { title: "Every Breath You Take", artist: "The Police", chords: ["G", "Em", "C", "D"], genre: "Pop Rock", difficulty: 1 },
  { title: "Message in a Bottle", artist: "The Police", chords: ["C#m", "A", "B"], genre: "Rock", difficulty: 3 },
  { title: "Redemption Song", artist: "Bob Marley", chords: ["G", "C", "D", "Em", "Am"], genre: "Reggae", difficulty: 1 },
  { title: "Three Little Birds", artist: "Bob Marley", chords: ["A", "D", "E"], genre: "Reggae", difficulty: 1 },
  { title: "Shallow", artist: "Lady Gaga & Bradley Cooper", chords: ["Em", "D", "G", "C", "Am", "Bm"], genre: "Pop", difficulty: 2, capo: 0, note: "Original in multiple keys" },
  { title: "A Thousand Years", artist: "Christina Perri", chords: ["Bb", "F", "Gm", "Eb"], genre: "Pop Ballad", difficulty: 3, note: "Original key uses barre chords" },
  { title: "She's the One", artist: "Ed Sheeran", chords: ["Em", "C", "G", "D"], genre: "Pop", difficulty: 1 },
  { title: "The A Team", artist: "Ed Sheeran", chords: ["A", "Dmaj7", "Bm", "E", "F#m"], genre: "Pop Folk", difficulty: 2 },
  { title: "Photograph", artist: "Ed Sheeran", chords: ["E", "C#m", "A", "B"], genre: "Pop", difficulty: 2 },
  { title: "Galway Girl", artist: "Ed Sheeran", chords: ["D", "G", "A", "Bm"], genre: "Folk Pop", difficulty: 2 },
  { title: "Banana Pancakes", artist: "Jack Johnson", chords: ["G", "Gmaj7", "C", "Am7", "D7"], genre: "Pop Acoustic", difficulty: 2 },
  { title: "Better Together", artist: "Jack Johnson", chords: ["F", "Am", "Bb", "C"], genre: "Pop Acoustic", difficulty: 2 },
  { title: "Sitting, Waiting, Wishing", artist: "Jack Johnson", chords: ["Am", "G", "D", "Am7", "G", "E7"], genre: "Pop Acoustic", difficulty: 2 },
  { title: "Can't Help Falling in Love", artist: "Elvis Presley", chords: ["C", "Em", "Am", "F", "G", "E7"], genre: "Pop", difficulty: 2 },
  { title: "Hound Dog", artist: "Elvis Presley", chords: ["E", "A", "B7"], genre: "Rock & Roll", difficulty: 1 },
  { title: "Johnny B. Goode", artist: "Chuck Berry", chords: ["Bb", "Eb", "F"], genre: "Rock & Roll", difficulty: 3 },
  { title: "La Vie en Rose", artist: "Édith Piaf (simplified)", chords: ["C", "Am", "G7", "Dm", "E7"], genre: "French Pop", difficulty: 2 },
  { title: "Smoke on the Water (simplified)", artist: "Deep Purple", chords: ["G", "Bb", "C"], genre: "Hard Rock", difficulty: 2 },
  { title: "Running to Stand Still", artist: "U2", chords: ["D", "A", "Bm", "G"], genre: "Rock", difficulty: 2, capo: 2 },
  { title: "One", artist: "U2", chords: ["Am", "D", "F", "C", "G", "Em"], genre: "Rock", difficulty: 2 },
  { title: "Stairway to Heaven (intro)", artist: "Led Zeppelin", chords: ["Am", "Amaj7", "Am7", "D", "F", "G"], genre: "Rock", difficulty: 3 },
  { title: "Blackbird", artist: "The Beatles", chords: ["G", "Am7", "G", "Cadd9", "Dsus4", "A7sus4"], genre: "Folk Rock", difficulty: 3, note: "Fingerpicked, complex" },
  { title: "Tears in Heaven", artist: "Eric Clapton", chords: ["A", "E", "F#m", "C#m", "D"], genre: "Ballad", difficulty: 2 },
  { title: "Lay Down Sally", artist: "Eric Clapton", chords: ["A", "D", "E"], genre: "Country Rock", difficulty: 1 },
  { title: "Fields of Gold", artist: "Sting / Eva Cassidy", chords: ["D", "G", "A", "Bm"], genre: "Pop / Folk", difficulty: 2 },
  { title: "Roxbury Mix / Fever", artist: "Traditional", chords: ["Am", "Dm", "E7"], genre: "Jazz / Latin", difficulty: 1 },
  { title: "Bossa Nova (Girl from Ipanema simplified)", artist: "Jobim", chords: ["F", "G7", "Gm7", "Gb"], genre: "Bossa Nova", difficulty: 3, note: "Simplified" },
  { title: "La Bamba", artist: "Traditional", chords: ["C", "F", "G"], genre: "Latin", difficulty: 1 },
  { title: "Besame Mucho (simplified)", artist: "Traditional", chords: ["Dm", "E7", "Am", "A7"], genre: "Latin / Bolero", difficulty: 2 },
];

// ─────────────────────────── HELPERS ───────────────────────────

function chordKey(display: string): string {
  return DISPLAY_TO_KEY[display] ?? "";
}

function chordsKnown(songChords: string[], knownKeys: Set<string>): { known: number; total: number; missing: string[] } {
  const uniqueChords = [...new Set(songChords)];
  const missing = uniqueChords.filter((c) => {
    const k = chordKey(c);
    return k ? !knownKeys.has(k) : true;
  });
  return { known: uniqueChords.length - missing.length, total: uniqueChords.length, missing };
}

function progressionKnown(prog: Progression, knownKeys: Set<string>): { known: number; total: number; missing: string[] } {
  return chordsKnown(prog.chords, knownKeys);
}

// ─────────────────────────── COMPONENT ───────────────────────────

const LS_KEY = "guitar-known-chords";

export function SongIdeas() {
  // Load from localStorage
  const [knownKeys, setKnownKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });

  const [view, setView] = useState<"chords" | "songs" | "progressions">("chords");
  const [filter, setFilter] = useState<"all" | "ready" | "almost" | "learn">("all");
  const [searchQ, setSearchQ] = useState("");

  // Persist
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...knownKeys])); } catch { /* ignore */ }
  }, [knownKeys]);

  const toggleChord = (key: string) => {
    setKnownKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Song analysis ──
  const analyzedSongs = useMemo(() => SONGS.map((s) => ({
    ...s,
    ...chordsKnown(s.chords, knownKeys),
  })), [knownKeys]);

  const readySongs = analyzedSongs.filter((s) => s.missing.length === 0);
  const almostSongs = analyzedSongs.filter((s) => s.missing.length === 1);
  const notReadySongs = analyzedSongs.filter((s) => s.missing.length >= 2);

  // ── Progression analysis ──
  const analyzedProgs = useMemo(() => PROGRESSIONS.map((p) => ({
    ...p,
    ...progressionKnown(p, knownKeys),
  })), [knownKeys]);
  const readyProgs = analyzedProgs.filter((p) => p.missing.length === 0);
  const almostProgs = analyzedProgs.filter((p) => p.missing.length === 1);

  // ── Next chord recommendation ──
  const nextChordRec = useMemo(() => {
    const freq: Record<string, { display: string; score: number; songsUnlocked: number; progsUnlocked: number }> = {};
    // Weight: each song with exactly 1 missing contributes most
    almostSongs.forEach((s) => {
      const m = s.missing[0];
      const k = chordKey(m);
      if (!k || knownKeys.has(k)) return;
      if (!freq[k]) freq[k] = { display: m, score: 0, songsUnlocked: 0, progsUnlocked: 0 };
      freq[k].score += 10;
      freq[k].songsUnlocked += 1;
    });
    // Songs with 2 missing contribute less
    notReadySongs.filter((s) => s.missing.length === 2).forEach((s) => {
      s.missing.forEach((m) => {
        const k = chordKey(m);
        if (!k || knownKeys.has(k)) return;
        if (!freq[k]) freq[k] = { display: m, score: 0, songsUnlocked: 0, progsUnlocked: 0 };
        freq[k].score += 2;
      });
    });
    // Progressions
    almostProgs.forEach((p) => {
      const m = p.missing[0];
      const k = chordKey(m);
      if (!k || knownKeys.has(k)) return;
      if (!freq[k]) freq[k] = { display: m, score: 0, songsUnlocked: 0, progsUnlocked: 0 };
      freq[k].score += 5;
      freq[k].progsUnlocked += 1;
    });

    // Favour easier chords with a bonus
    Object.entries(freq).forEach(([k, v]) => {
      const cat = CATALOG_BY_KEY[k];
      if (cat) v.score += (5 - cat.difficulty) * 3;
    });

    return Object.entries(freq)
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, 5)
      .map(([k, v]) => ({ key: k, ...v }));
  }, [knownKeys, almostSongs, almostProgs, notReadySongs]);

  // ── Filtered song list ──
  const displaySongs = useMemo(() => {
    let list = analyzedSongs;
    if (filter === "ready") list = readySongs;
    else if (filter === "almost") list = almostSongs;
    else if (filter === "learn") list = notReadySongs;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.genre.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.missing.length - b.missing.length || a.difficulty - b.difficulty);
  }, [analyzedSongs, filter, searchQ, readySongs, almostSongs, notReadySongs]);

  const groups = CHORD_CATALOG.reduce<Record<string, CatalogChord[]>>((acc, c) => {
    if (!acc[c.group]) acc[c.group] = [];
    acc[c.group].push(c);
    return acc;
  }, {});

  const panelStyle: React.CSSProperties = {
    background: "linear-gradient(160deg, #F0DDB0, #E8CF90)",
    border: `2px solid ${C.border}`,
    borderRadius: 16,
    padding: "16px 18px",
    boxShadow: "0 4px 16px rgba(61,18,5,0.12)",
  };

  const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
    display: "inline-block", padding: "2px 9px", borderRadius: 999,
    background: bg, color, fontWeight: 700, fontSize: 11,
    border: `1px solid ${color}44`,
  });

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1080, margin: "0 auto" }}>

      {/* ── Stats bar ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { emoji: "✅", label: "Can play now", count: readySongs.length, color: C.greenBorder, bg: C.greenBg },
          { emoji: "🔜", label: "One chord away", count: almostSongs.length, color: C.amberBorder, bg: C.amberBg },
          { emoji: "🎼", label: "Progressions ready", count: readyProgs.length, color: C.blueBorder, bg: C.blueBg },
          { emoji: "🎸", label: "Chords known", count: knownKeys.size, color: C.purpleBorder, bg: C.purpleBg },
        ].map((s) => (
          <div key={s.label} style={{
            ...panelStyle,
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 18px", flex: 1, minWidth: 140,
            border: `2px solid ${s.color}55`,
            background: s.bg,
          }}>
            <span style={{ fontSize: 26 }}>{s.emoji}</span>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: C.text, lineHeight: 1 }}>{s.count}</div>
              <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── View tabs ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {([
          { id: "chords", label: "🎸 My Chords" },
          { id: "songs", label: "🎵 Song Ideas" },
          { id: "progressions", label: "🎼 Progressions" },
        ] as const).map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: "9px 20px", borderRadius: 10,
            border: `2px solid ${view === v.id ? C.fret : C.border}`,
            background: view === v.id ? C.fret : "transparent",
            color: view === v.id ? C.text : C.textLight,
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            fontFamily: "Georgia, serif",
            transition: "all 0.15s",
          }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ══ CHORDS VIEW ══ */}
      {view === "chords" && (
        <div>
          {/* Next chord to learn recommendations */}
          {nextChordRec.length > 0 && (
            <div style={{ ...panelStyle, marginBottom: 20, background: "linear-gradient(135deg, #FFF8E8, #F8EDCC)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                ⭐ Recommended Next Chords to Learn
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {nextChordRec.map((rec) => {
                  const cat = CATALOG_BY_KEY[rec.key];
                  return (
                    <div key={rec.key} style={{
                      background: "#FFF8E8", border: `2px solid ${C.fret}`,
                      borderRadius: 12, padding: "10px 14px",
                      display: "flex", flexDirection: "column", gap: 4,
                      minWidth: 120, boxShadow: "0 2px 8px rgba(61,18,5,0.1)",
                    }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>{rec.display}</div>
                      {cat && (
                        <span style={{ ...badgeStyle(DIFFICULTY_COLOR[cat.difficulty], "white"), alignSelf: "flex-start" }}>
                          {DIFFICULTY_LABEL[cat.difficulty]}
                        </span>
                      )}
                      <div style={{ fontSize: 11, color: C.textLight }}>
                        {rec.songsUnlocked > 0 && <span>+{rec.songsUnlocked} song{rec.songsUnlocked !== 1 ? "s" : ""}</span>}
                        {rec.progsUnlocked > 0 && <span style={{ marginLeft: 4 }}>+{rec.progsUnlocked} prog{rec.progsUnlocked !== 1 ? "s" : ""}</span>}
                      </div>
                      <button onClick={() => toggleChord(rec.key)} style={{
                        marginTop: 4, padding: "4px 10px", borderRadius: 8,
                        border: `1px solid ${C.fret}`, background: C.fret,
                        color: "#FFF5EE", fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}>
                        Mark known →
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chord groups */}
          {Object.entries(groups).map(([group, chords]) => (
            <div key={group} style={{ ...panelStyle, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>{group}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {chords.map((chord) => {
                  const known = knownKeys.has(chord.key);
                  return (
                    <button key={chord.key} onClick={() => toggleChord(chord.key)} style={{
                      padding: "7px 14px",
                      borderRadius: 10,
                      border: `2px solid ${known ? C.greenBorder : DIFFICULTY_COLOR[chord.difficulty] + "66"}`,
                      background: known ? C.greenBg : "rgba(255,255,255,0.5)",
                      color: known ? C.green : C.text,
                      fontWeight: 800,
                      fontSize: 15,
                      cursor: "pointer",
                      fontFamily: "Georgia, serif",
                      boxShadow: known ? `0 0 0 2px ${C.greenBorder}44` : "none",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}>
                      {known && <span style={{ fontSize: 12 }}>✓</span>}
                      {chord.display}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: C.textLight }}>
                {chords.filter((c) => knownKeys.has(c.key)).length} / {chords.length} known
                {" · "}
                <span style={{ color: DIFFICULTY_COLOR[chords[0].difficulty] }}>{DIFFICULTY_LABEL[chords[0].difficulty]}</span>
              </div>
            </div>
          ))}

          {knownKeys.size > 0 && (
            <button onClick={() => setKnownKeys(new Set())} style={{
              padding: "8px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`,
              background: "transparent", color: C.textLight, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ══ SONGS VIEW ══ */}
      {view === "songs" && (
        <div>
          {/* Filter + search */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
            {([
              { id: "all", label: `All (${SONGS.length})` },
              { id: "ready", label: `✅ Play Now (${readySongs.length})` },
              { id: "almost", label: `🔜 Almost (${almostSongs.length})` },
              { id: "learn", label: `📚 Learn More (${notReadySongs.length})` },
            ] as const).map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: "7px 14px", borderRadius: 9,
                border: `2px solid ${filter === f.id ? C.fret : C.border}`,
                background: filter === f.id ? C.fret : "transparent",
                color: filter === f.id ? C.text : C.textLight,
                fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Georgia, serif",
              }}>
                {f.label}
              </button>
            ))}
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search title, artist, genre…"
              style={{
                padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${C.border}`,
                background: "#FFF8EE", color: C.text, fontSize: 13, fontFamily: "Georgia, serif",
                outline: "none", flex: 1, minWidth: 180,
              }}
            />
          </div>

          {displaySongs.length === 0 && (
            <div style={{ ...panelStyle, textAlign: "center", padding: "32px 20px", color: C.textLight, fontStyle: "italic" }}>
              No songs match. Try selecting more chords or adjusting the filter.
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {displaySongs.map((song, i) => {
              const allReady = song.missing.length === 0;
              const oneAway = song.missing.length === 1;
              const borderColor = allReady ? C.greenBorder : oneAway ? C.amberBorder : C.border;
              const bgColor = allReady ? "linear-gradient(135deg, #F0FBF0, #E8F8E8)"
                : oneAway ? "linear-gradient(135deg, #FFFBF0, #FFF0D0)"
                : "linear-gradient(160deg, #F0DDB0, #E8CF90)";
              return (
                <div key={`${song.title}-${i}`} style={{
                  background: bgColor,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 14,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{song.title}</span>
                      <span style={{ fontSize: 13, color: C.textLight }}>— {song.artist}</span>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {song.chords.map((ch) => {
                        const k = chordKey(ch);
                        const isKnown = k ? knownKeys.has(k) : false;
                        const isMissing = !isKnown;
                        return (
                          <span key={ch} style={{
                            padding: "3px 9px", borderRadius: 8,
                            background: isKnown ? C.greenBg : "#F0E0FF",
                            color: isKnown ? C.green : C.purple,
                            border: `1px solid ${isKnown ? C.greenBorder : C.purpleBorder}`,
                            fontWeight: 700, fontSize: 13,
                          }}>
                            {isMissing && <span style={{ fontSize: 10, marginRight: 2 }}>✦</span>}
                            {ch}
                          </span>
                        );
                      })}
                    </div>
                    {song.note && (
                      <div style={{ marginTop: 4, fontSize: 11, color: C.textLight, fontStyle: "italic" }}>{song.note}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                    <span style={badgeStyle(
                      allReady ? C.green : oneAway ? C.amber : C.gray,
                      allReady ? C.greenBg : oneAway ? C.amberBg : C.grayBg,
                    )}>
                      {allReady ? "✅ Ready!" : oneAway ? `🔜 Learn ${song.missing[0]}` : `${song.missing.length} chords to go`}
                    </span>
                    <span style={badgeStyle(C.textLight, C.grayBg)}>{song.genre}</span>
                    {song.capo && <span style={badgeStyle(C.blue, C.blueBg)}>Capo {song.capo}</span>}
                    <span style={badgeStyle(DIFFICULTY_COLOR[song.difficulty], "white")}>
                      {"★".repeat(song.difficulty)}{"☆".repeat(3 - song.difficulty)} {["", "Easy", "Med", "Hard"][song.difficulty]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ PROGRESSIONS VIEW ══ */}
      {view === "progressions" && (
        <div>
          {readyProgs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                ✅ Play These Now
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {readyProgs.map((prog, i) => (
                  <ProgressionCard key={i} prog={prog} knownKeys={knownKeys} status="ready" />
                ))}
              </div>
            </div>
          )}

          {almostProgs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                🔜 One Chord Away
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {almostProgs.map((prog, i) => (
                  <ProgressionCard key={i} prog={prog} knownKeys={knownKeys} status="almost" />
                ))}
              </div>
            </div>
          )}

          {analyzedProgs.filter((p) => p.missing.length >= 2).length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textLight, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                📚 Worth Learning Towards
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {analyzedProgs.filter((p) => p.missing.length >= 2).map((prog, i) => (
                  <ProgressionCard key={i} prog={prog} knownKeys={knownKeys} status="locked" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── PROGRESSION CARD ───────────────────────────

function ProgressionCard({
  prog,
  knownKeys,
  status,
}: {
  prog: Progression & { missing: string[] };
  knownKeys: Set<string>;
  status: "ready" | "almost" | "locked";
}) {
  const borderColor = status === "ready" ? C.greenBorder : status === "almost" ? C.amberBorder : C.border;
  const bg = status === "ready" ? "linear-gradient(135deg, #F0FBF0, #E8F8E8)"
    : status === "almost" ? "linear-gradient(135deg, #FFFBF0, #FFF0D0)"
    : "linear-gradient(160deg, #F0DDB0, #E8CF90)";

  return (
    <div style={{
      background: bg,
      border: `2px solid ${borderColor}`,
      borderRadius: 14,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{prog.name}</div>
      <div style={{ fontSize: 11, color: C.textLight, fontStyle: "italic" }}>{prog.vibe}</div>
      {/* Chord chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {prog.chords.map((ch, i) => {
          const k = chordKey(ch);
          const known = k ? knownKeys.has(k) : false;
          return (
            <React.Fragment key={i}>
              <span style={{
                padding: "4px 12px", borderRadius: 10,
                background: known ? C.greenBg : "#F0E0FF",
                color: known ? C.green : C.purple,
                border: `1px solid ${known ? C.greenBorder : C.purpleBorder}`,
                fontWeight: 800, fontSize: 14,
              }}>
                {ch}
              </span>
              {i < prog.chords.length - 1 && (
                <span style={{ color: C.textLight, fontSize: 16, display: "flex", alignItems: "center" }}>→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Loop pattern visualization */}
      <div style={{
        background: "rgba(0,0,0,0.05)", borderRadius: 8,
        padding: "6px 10px", fontSize: 11, color: C.textLight,
        letterSpacing: 2, fontFamily: "monospace",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {Array.from({ length: 2 }, () => prog.chords.join(" → ")).join("  |  ")} …
      </div>
      {status !== "ready" && prog.missing.length > 0 && (
        <div style={{ fontSize: 12, color: status === "almost" ? C.amber : C.textLight, fontWeight: 600 }}>
          {status === "almost" ? `Learn ${prog.missing[0]} to unlock` : `Missing: ${prog.missing.slice(0, 3).join(", ")}${prog.missing.length > 3 ? ` +${prog.missing.length - 3}` : ""}`}
        </div>
      )}
    </div>
  );
}

export type StrumBeat = [
  stroke: "D" | "U" | "PM" | "–" | "—" | "?",
  effect: "" | "mute" | "accent" | "rest",
];

export type StrummingPattern = {
  part: string;
  bpm: number;
  denominator: number;
  triplet: boolean;
  beats: StrumBeat[];
};

export type ImportedPracticeData = {
  wordHashes: string[];
  chordAnchors: Array<[wordIndex: number, chord: string]>;
  sections: Array<[wordIndex: number, section: string]>;
  strumming: StrummingPattern[];
};

// Generated from public saved-tab payloads. Lyric text is deliberately not
// stored: contextual word hashes align chord changes to LRCLIB at runtime.
// Good Riddance is retained as a verified seed while the full import runs.
export const IMPORTED_PRACTICE_DATA: Record<string, ImportedPracticeData> = {
  "31443": {
    wordHashes: [],
    chordAnchors: [],
    sections: [],
    strumming: [{
      part: "All",
      bpm: 96,
      denominator: 16,
      triplet: false,
      beats: [
        ["D", "accent"], ["–", "rest"], ["D", ""], ["U", ""],
        ["–", "rest"], ["U", ""], ["D", ""], ["U", ""],
        ["D", "accent"], ["–", "rest"], ["D", ""], ["U", ""],
        ["–", "rest"], ["U", ""], ["D", ""], ["U", ""],
      ],
    }],
  },
};

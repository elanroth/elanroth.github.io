export type PickingChord = {
  name: string;
  frets: string;
  bassString: 4 | 5 | 6;
};

export type PluckStep = "Bass" | "1" | "2" | "3" | "4" | "5" | "6";

export type SongTechniqueGuide = {
  title: string;
  summary: string;
  tuning: string;
  count: string[];
  pluckOrder: PluckStep[];
  chords: PickingChord[];
  practiceLoop: string[];
  harmonic: {
    title: string;
    explanation: string;
    tab: string[];
  };
};

export const SONG_TECHNIQUE_GUIDES: Record<string, SongTechniqueGuide> = {
  "2374385": {
    title: "Fingerpicked practice version",
    summary: "A simplified accompaniment for learning the song. Hold each chord for one full bar and keep the picking hand steady. This is not a note-for-note transcription of the live performance.",
    tuning: "Standard · E A D G B E",
    count: ["1", "&", "2", "&", "3", "&", "4", "&"],
    pluckOrder: ["Bass", "3", "2", "1", "2", "3", "2", "3"],
    chords: [
      { name: "D", frets: "× × 0 2 3 2", bassString: 4 },
      { name: "G", frets: "3 2 0 0 0 3", bassString: 6 },
      { name: "Em", frets: "0 2 2 0 0 0", bassString: 6 },
      { name: "A", frets: "× 0 2 2 2 0", bassString: 5 },
      { name: "Bm", frets: "× 2 4 4 3 2", bassString: 5 },
      { name: "E7", frets: "0 2 0 1 0 0", bassString: 6 },
      { name: "F#m", frets: "2 4 4 2 2 2", bassString: 6 },
      { name: "B", frets: "× 2 4 4 4 2", bassString: 5 },
      { name: "D/F#", frets: "2 × 0 2 3 2", bassString: 6 },
      { name: "A7", frets: "× 0 2 0 2 0", bassString: 5 },
    ],
    practiceLoop: ["D", "G", "D", "Em", "A", "D"],
    harmonic: {
      title: "Optional natural harmonic",
      explanation: "Lightly touch the string directly over the 12th-fret wire, pluck it, then lift your fretting finger. Do not press the string to the fretboard. Angle brackets around <12> mark the harmonic.",
      tab: [
        "e|--<12>--|",
        "B|--------|",
        "G|--------|",
        "D|--------|",
        "A|--------|",
        "E|--------|",
      ],
    },
  },
};

export function tabForChord(chord: PickingChord, pluckOrder: PluckStep[]) {
  const frets = chord.frets.split(" ");
  const labels = ["e", "B", "G", "D", "A", "E"];
  const stringFrets = [...frets].reverse();
  const order = pluckOrder.map((step) => step === "Bass" ? chord.bassString : Number(step));
  return labels.map((label, index) => {
    const string = index + 1;
    const fret = stringFrets[index];
    const cells = order.map((pluck) => pluck === string ? `-${fret === "×" ? "x" : fret}-` : "---");
    return `${label}|${cells.join("")}|`;
  });
}

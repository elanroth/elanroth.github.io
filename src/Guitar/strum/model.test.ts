import { describe, expect, it } from "vitest";
import { SONG_TECHNIQUE_GUIDES, tabForChord } from "../songTechniqueGuides";
import { injectInlineChords, parseArrangement, parseLibrary } from "./model";

describe("STRUM arrangement parser", () => {
  it("puts a chord on the word where the change occurs", () => {
    expect(parseArrangement("[G]Rolling past the [C]county line")).toEqual([{
      type: "line",
      runs: [{ chord: "G", text: "Rolling past the " }, { chord: "C", text: "county line" }],
    }]);
  });

  it("keeps section labels out of chord rendering", () => {
    expect(parseArrangement("[Chorus]")).toEqual([{ type: "section", label: "Chorus" }]);
  });

  it("rejects invalid imports", () => {
    expect(() => parseLibrary({ schemaVersion: 2, songs: [] })).toThrow("unsupported schema");
  });

  it("moves saved chord anchors onto their target words", () => {
    expect(injectInlineChords("Rolling past the county line", [[0, "G"], [17, "C"]])).toBe("[G]Rolling past the [C]county line");
  });

  it("renders the Yihyeh Tov practice tab in the documented plucking order", () => {
    const guide = SONG_TECHNIQUE_GUIDES["2374385"];
    expect(guide.count).toHaveLength(8);
    expect(guide.count).toHaveLength(guide.pluckOrder.length);
    expect(guide.pluckOrder).toEqual(["Bass", "3", "2", "1", "2", "3", "2", "3"]);
    expect(tabForChord(guide.chords[0], guide.pluckOrder)).toEqual([
      "e|----------2-------------|",
      "B|-------3-----3-----3----|",
      "G|----2-----------2-----2-|",
      "D|-0----------------------|",
      "A|------------------------|",
      "E|------------------------|",
    ]);
    expect(tabForChord(guide.chords[0], ["1", "2"]).slice(0, 2)).toEqual([
      "e|-2----|",
      "B|----3-|",
    ]);
  });
});

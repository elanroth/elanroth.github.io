import { describe, expect, it } from "vitest";
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
});

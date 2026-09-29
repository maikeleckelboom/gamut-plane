import { describe, expect, it } from "vitest";
import { currentView as reactView } from "../src/model/currentView.js";
import { currentView as vueView } from "../../vue/src/model/currentView.js";

describe.each([reactView, vueView])("current selection bridge", (view) => {
  it("admits exactly the current editable pairs", () => {
    expect(view({ representationId: "oklch", editorId: "oklch-lc" })).toBe("oklch");
    expect(view({ representationId: "oklab", editorId: "oklab-ab" })).toBe("oklab");
    for (const representationId of ["oklch", "oklab", "srgb", "display-p3"] as const) {
      expect(() => view({ representationId, editorId: null })).toThrow(
        "Accepted selection is not a current editable instrument context",
      );
    }
  });
});

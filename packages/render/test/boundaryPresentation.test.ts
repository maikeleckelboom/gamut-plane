import { describe, expect, it } from "vitest";
import { serializeColor, type DisplayGamut, type OklchColor } from "@gamut-plane/core";
import { getBoundaryPresentation, PICKER_GAMUT_TABLES } from "../src/index";

const outsideBoth: OklchColor = { l: 0.62, c: 0.24, h: 270, alpha: 1 };

describe("shared boundary presentation", () => {
  it.each([
    ["srgb", { srgb: false, displayP3: true }, "display-p3"],
    ["display-p3", { srgb: true, displayP3: false }, "srgb"],
  ] satisfies [DisplayGamut, { srgb: boolean; displayP3: boolean }, DisplayGamut][])(
    "keeps the %s target active while filtering ordinary guides",
    (target, visibility, visibleGamut) => {
      const snapshot = structuredClone(outsideBoth);
      const model = getBoundaryPresentation(outsideBoth, "oklch", target, visibility);

      expect(model.analysis.target.target).toBe(target);
      expect(model.analysis.target.projection).not.toBeNull();
      expect(model.projectionColor).toEqual(model.analysis.target.projection?.color);
      expect(model.markers.filter((marker) => marker.tone !== "projection")).toHaveLength(1);
      expect(model.markers).toContainEqual(
        expect.objectContaining({ id: `${visibleGamut}-boundary-guide`, tone: visibleGamut }),
      );
      expect(model.markers).toContainEqual(
        expect.objectContaining({ id: `${target}-boundary-projection`, tone: "projection" }),
      );
      expect(new Set(model.hueIntervals.map((interval) => interval.tone))).toEqual(
        new Set([visibleGamut]),
      );
      expect(new Set(model.lightnessIntervals.map((interval) => interval.tone))).toEqual(
        new Set([visibleGamut]),
      );
      expect(model.chromaIntervals.map((interval) => interval.tone)).toEqual([visibleGamut]);
      expect(outsideBoth).toEqual(snapshot);
    },
  );

  it("removes all ordinary guide layers while retaining target evidence", () => {
    const model = getBoundaryPresentation(outsideBoth, "oklab", "display-p3", {
      srgb: false,
      displayP3: false,
    });

    expect(model.hueIntervals).toEqual([]);
    expect(model.lightnessIntervals).toEqual([]);
    expect(model.chromaIntervals).toEqual([]);
    expect(model.markers).toEqual([
      expect.objectContaining({ id: "display-p3-boundary-projection", tone: "projection" }),
    ]);
    expect(model.analysis.status.srgb.inGamut).toBe(false);
    expect(model.analysis.status.displayP3.inGamut).toBe(false);
  });

  it("uses the selected target table and its actual guide color", () => {
    const srgb = getBoundaryPresentation(outsideBoth, "oklch", "srgb", {
      srgb: true,
      displayP3: true,
    });
    const displayP3 = getBoundaryPresentation(outsideBoth, "oklch", "display-p3", {
      srgb: true,
      displayP3: true,
    });

    expect(srgb.analysis.target.boundaryGuide.chroma).toBe(
      srgb.analysis.status.srgb.interpolatedMaximumChroma,
    );
    expect(displayP3.analysis.target.boundaryGuide.chroma).toBe(
      displayP3.analysis.status.displayP3.interpolatedMaximumChroma,
    );
    expect(serializeColor(srgb.analysis.target.boundaryGuide.color)).not.toBe(
      serializeColor(displayP3.analysis.target.boundaryGuide.color),
    );
    expect(PICKER_GAMUT_TABLES.srgb.gamut).toBe("srgb");
    expect(PICKER_GAMUT_TABLES.displayP3.gamut).toBe("display-p3");
  });
});

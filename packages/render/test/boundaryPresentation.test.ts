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
      expect(model.markers).toEqual([
        expect.objectContaining({
          id: `${target}-boundary-projection`,
          tone: "projection",
          lane: target,
        }),
      ]);
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
      expect.objectContaining({
        id: "display-p3-boundary-projection",
        tone: "projection",
        lane: "display-p3",
      }),
    ]);
    expect(model.analysis.status.srgb.inGamut).toBe(false);
    expect(model.analysis.status.displayP3.inGamut).toBe(false);
  });

  it("keeps the projection marker on the active target lane when that guide is hidden", () => {
    for (const target of ["srgb", "display-p3"] as const) {
      const hidden = getBoundaryPresentation(outsideBoth, "oklch", target, {
        srgb: target !== "srgb",
        displayP3: target !== "display-p3",
      });
      const visible = getBoundaryPresentation(outsideBoth, "oklch", target, {
        srgb: true,
        displayP3: true,
      });
      expect(hidden.markers.map((marker) => marker.lane)).toEqual([target]);
      expect(visible.markers.map((marker) => marker.lane)).toEqual([target]);
      expect(hidden.chromaIntervals.map((interval) => interval.tone)).not.toContain(target);
    }
  });

  it("renders no marker when the selected color needs no target projection", () => {
    const color: OklchColor = { l: 0.5, c: 0, h: 0, alpha: 1 };
    const model = getBoundaryPresentation(color, "oklch", "srgb", {
      srgb: true,
      displayP3: true,
    });
    expect(model.markers).toEqual([]);
    expect(model.chromaIntervals.map((interval) => interval.tone)).toEqual(["display-p3", "srgb"]);
    expect(model.analysis.target.target).toBe("srgb");
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

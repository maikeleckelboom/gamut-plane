import { describe, expect, it } from "vitest";
import { getMaximumChromaFromTable, type DisplayGamut, type OklchColor } from "@gamut-plane/core";
import { getBoundaryPresentation, PICKER_GAMUT_TABLES } from "../src/index.js";

const observed: OklchColor = { l: 0.62, c: 0.24, h: 270, alpha: 0.5 };
const outside = { srgb: "outside", displayP3: "outside" } as const;

describe("shared sampled guide presentation", () => {
  it.each(["srgb", "display-p3"] as const)(
    "hides the %s target guide while retaining other visible intervals and sampled facts",
    (target: DisplayGamut) => {
      const visibility = { srgb: target !== "srgb", displayP3: target !== "display-p3" };
      const snapshot = structuredClone(observed);
      const model = getBoundaryPresentation(observed, "oklch", target, visibility, outside);

      expect(model.targetGuide.gamut).toBe(target);
      expect(model.targetGuidePoint).toBeNull();
      expect(model.targetGuideCss).toBe("");
      expect(model.markers).toEqual([]);
      expect(model.chromaIntervals.map((interval) => interval.tone)).toEqual([
        target === "srgb" ? "display-p3" : "srgb",
      ]);
      expect(observed).toEqual(snapshot);
    },
  );

  it.each(["inside", "within-tolerance", "outside"] as const)(
    "shows an outside-only target guide for exact %s status",
    (status) => {
      const model = getBoundaryPresentation(
        observed,
        "oklab",
        "srgb",
        { srgb: true, displayP3: false },
        { srgb: status, displayP3: "inside" },
      );
      expect(model.targetGuidePoint === null).toBe(status !== "outside");
      expect(model.markers.map((marker) => marker.id)).toEqual(
        status === "outside" ? ["srgb-target-guide"] : [],
      );
    },
  );

  it("keeps target guide swatches tied to their own sampled tables", () => {
    const srgb = getBoundaryPresentation(
      observed,
      "oklch",
      "srgb",
      { srgb: true, displayP3: true },
      outside,
    );
    const p3 = getBoundaryPresentation(
      observed,
      "oklch",
      "display-p3",
      { srgb: true, displayP3: true },
      outside,
    );

    for (const [model, table] of [
      [srgb, PICKER_GAMUT_TABLES.srgb],
      [p3, PICKER_GAMUT_TABLES.displayP3],
    ] as const) {
      expect(model.targetGuide.maximumChroma).toBe(
        getMaximumChromaFromTable(table, observed.l, observed.h),
      );
      expect(model.targetGuide.color).toEqual({ ...observed, c: model.targetGuide.maximumChroma });
    }
    expect(srgb.targetGuide.maximumChroma).not.toBe(p3.targetGuide.maximumChroma);
  });
});

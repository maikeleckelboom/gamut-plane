import { describe, expect, it } from "vitest";
import {
  createColorValue,
  convertOklchToOklab,
  definitionOf,
  getMaximumChromaFromTable,
  isColorValue,
  oklabCoordinatesToPlanePoint,
  projectColorToPlane,
  type ColorRepresentation,
} from "@gamut-plane/core";
import { createPickerPresentation, PICKER_GAMUT_TABLES } from "../src/index.js";

const visible = { srgb: true, displayP3: true };

function value(definition: ColorRepresentation) {
  const created = createColorValue(definition);
  if (!created.ok) throw new Error("Invalid presentation fixture");
  return created.value;
}

describe("shared picker presentation", () => {
  it.each([
    { space: "srgb", channels: [0.7, 0.3, 0.2], alpha: 0.8 },
    { space: "display-p3", channels: [0.7, 0.3, 0.2], alpha: 0.8 },
    { space: "oklab", channels: [0.6, 0.1, -0.1], alpha: 0.8 },
    { space: "oklch", channels: [0.6, 0.2, 210], alpha: 0.8 },
  ] as const satisfies readonly ColorRepresentation[])(
    "observes a %s definition without re-authoring it",
    (definition) => {
      const selected = value(definition);
      const original = definitionOf(selected);
      for (const view of ["oklch", "oklab"] as const) {
        const presentation = createPickerPresentation(selected, view, "srgb", visible);
        const projected = projectColorToPlane(selected, view);
        if (!projected.ok) throw new Error("Invalid plane fixture");
        expect(presentation.oklch.space).toBe("oklch");
        expect(presentation.oklab.representation.space).toBe("oklab");
        expect(presentation.projection.point).toEqual(projected.value.point);
        expect(presentation.lightnessGradient).toContain("linear-gradient");
        expect(presentation.targetResult.swatchCss).toContain("oklch(");
        expect(Object.values(presentation).some(isColorValue)).toBe(false);
      }
      expect(definitionOf(selected)).toBe(original);
      expect(definitionOf(selected).space).toBe(definition.space);
    },
  );

  it("keeps observed neutral hue absent while choosing a numeric field slice", () => {
    const selected = value({ space: "oklab", channels: [0.6, 0, 0], alpha: 1 });
    const presentation = createPickerPresentation(selected, "oklch", "srgb", visible);
    expect(presentation.oklch.channels[2]).toBeNull();
    expect(presentation.fieldHue).toBe(0);
    expect(presentation.hueHelp).toContain("Hue is unset");
    expect(definitionOf(selected).channels).toEqual([0.6, 0, 0]);
  });

  it.each(["oklch", "oklab"] as const)(
    "positions the %s boundary guide without a canonical plane operation",
    (view) => {
      const selected = value({ space: "oklch", channels: [0.62, 0.24, 270], alpha: 0.5 });
      const presentation = createPickerPresentation(selected, view, "srgb", visible);
      const guideChroma = Math.min(
        0.24,
        getMaximumChromaFromTable(PICKER_GAMUT_TABLES.srgb, 0.62, 270),
      );
      expect(presentation.projectionPoint).not.toBeNull();
      expect(presentation.projectionCss).toContain("oklch(");
      if (view === "oklch") {
        expect(presentation.projectionPoint?.x).toBeCloseTo(guideChroma / 0.4, 10);
        expect(presentation.projectionPoint?.y).toBeCloseTo(0.38, 10);
      } else {
        const coordinates = convertOklchToOklab({ l: 0.62, c: guideChroma, h: 270, alpha: 0.5 });
        const expected = oklabCoordinatesToPlanePoint(coordinates[1]!, coordinates[2]!);
        expect(presentation.projectionPoint?.x).toBeCloseTo(expected.x, 10);
        expect(presentation.projectionPoint?.y).toBeCloseTo(expected.y, 10);
      }
    },
  );
});

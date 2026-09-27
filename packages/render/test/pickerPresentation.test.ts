import { describe, expect, it } from "vitest";
import {
  analyzeGamut,
  createColorValue,
  convertOklabToOklch,
  convertOklchToOklab,
  definitionOf,
  getPickerGuide,
  oklabCoordinatesToPlanePoint,
  projectColorToPlane,
  serializeOklchSample,
  type ColorRepresentation,
  type DisplayGamut,
  type GamutStatus,
} from "@gamut-plane/core";
import { createPickerPresentation, PICKER_GAMUT_TABLES } from "../src/index.js";

const visible = { srgb: true, displayP3: true };

function value(definition: ColorRepresentation) {
  const created = createColorValue(definition);
  if (!created.ok) throw new Error("Invalid presentation fixture");
  return created.value;
}

describe("shared picker presentation", () => {
  it("shows the selected color at the matching stop of every OKLCH channel gradient", () => {
    const selected = value({ space: "oklch", channels: [0.5, 0.2, 180], alpha: 1 });
    const presentation = createPickerPresentation(selected, "oklch", "srgb", visible);
    const selectedStop = `${serializeOklchSample({ l: 0.5, c: 0.2, h: 180, alpha: 1 })} 50.000%`;
    expect(presentation.hueGradient).toContain(selectedStop);
    expect(presentation.lightnessGradient).toContain(selectedStop);
    expect(presentation.chromaGradient).toContain(selectedStop);
  });

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
        expect(presentation.targetResult.swatchCss).toContain("oklch(");
      }
      expect(definitionOf(selected)).toBe(original);
      expect(definitionOf(selected).space).toBe(definition.space);
    },
  );

  it.each([
    {
      definition: { space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 },
      target: "srgb",
      status: "within-tolerance",
    },
    {
      definition: { space: "display-p3", channels: [-1e-10, 0.5, 0.5], alpha: 1 },
      target: "display-p3",
      status: "within-tolerance",
    },
    {
      definition: { space: "srgb", channels: [0.5, 0.5, 0.5], alpha: 1 },
      target: "srgb",
      status: "inside",
    },
    {
      definition: { space: "oklch", channels: [0.62, 0.24, 270], alpha: 1 },
      target: "display-p3",
      status: "outside",
    },
  ] as const satisfies readonly {
    definition: ColorRepresentation;
    target: DisplayGamut;
    status: GamutStatus;
  }[])(
    "combines direct %s exact status with observed OKLCH table guides",
    ({ definition, target, status }) => {
      const selected = value(definition);
      const presentation = createPickerPresentation(selected, "oklch", target, visible);
      const srgb = analyzeGamut(selected, "srgb-gamut");
      const p3 = analyzeGamut(selected, "display-p3-gamut");
      if (!srgb.ok || !p3.ok) throw new Error("Invalid gamut fixture");
      expect(presentation.gamutStatus).toEqual({
        srgb: srgb.value.status,
        displayP3: p3.value.status,
      });
      expect(presentation.targetResult.status).toBe(status);
      expect(presentation.warningVisible).toBe(p3.value.status === "outside");
      expect(presentation.targetGuidePoint === null).toBe(status !== "outside");

      const [l, , hue] = presentation.oklch.channels;
      const table = target === "srgb" ? PICKER_GAMUT_TABLES.srgb : PICKER_GAMUT_TABLES.displayP3;
      expect(Number(presentation.targetResult.guideChroma)).toBeCloseTo(
        getPickerGuide({ l, c: 0, h: hue ?? presentation.fieldHue, alpha: 1 }, table).maximumChroma,
        4,
      );
      expect(definitionOf(selected).space).toBe(definition.space);
    },
  );

  it("keeps the defining sRGB endpoint authoritative across an OKLCH observation", () => {
    const selected = value({ space: "srgb", channels: [1, 0, 0], alpha: 1 });
    const observed = projectColorToPlane(selected, "oklch");
    if (!observed.ok) throw new Error("Invalid endpoint fixture");
    const reconstructed = value(observed.value.representation);
    const direct = analyzeGamut(selected, "srgb-gamut");
    const roundTrip = analyzeGamut(reconstructed, "srgb-gamut");
    if (!direct.ok || !roundTrip.ok) throw new Error("Invalid endpoint analysis");

    expect(direct.value.status).toBe("inside");
    expect(roundTrip.value.status).toBe("within-tolerance");
    const presentation = createPickerPresentation(selected, "oklch", "srgb", visible);
    expect(presentation.targetResult.status).toBe(direct.value.status);
    expect(presentation.targetGuidePoint).toBeNull();
    expect(Number(presentation.targetResult.guideChroma)).toBeCloseTo(
      getPickerGuide(
        {
          l: observed.value.representation.channels[0],
          c: 0,
          h: observed.value.representation.channels[2] ?? 0,
          alpha: 1,
        },
        PICKER_GAMUT_TABLES.srgb,
      ).maximumChroma,
      4,
    );
  });

  it("keeps exact status when guide visibility is disabled", () => {
    const selected = value({ space: "oklch", channels: [0.62, 0.24, 270], alpha: 1 });
    const presentation = createPickerPresentation(selected, "oklab", "display-p3", {
      srgb: false,
      displayP3: false,
    });
    expect(presentation.targetResult.status).toBe("outside");
    expect(presentation.warningVisible).toBe(true);
    expect(presentation.targetGuidePoint).toBeNull();
    expect(presentation.markers).toEqual([]);
    expect(presentation.hueIntervals).toEqual([]);
    expect(presentation.lightnessIntervals).toEqual([]);
    expect(presentation.chromaIntervals).toEqual([]);
  });

  it("keeps neutral observed hue absent while using a numeric guide slice", () => {
    const selected = value({ space: "oklab", channels: [0.6, 0, 0], alpha: 1 });
    const presentation = createPickerPresentation(selected, "oklch", "srgb", visible);
    const exact = analyzeGamut(selected, "srgb-gamut");
    if (!exact.ok) throw new Error("Invalid neutral fixture");
    expect(presentation.oklch.channels[2]).toBeNull();
    expect(presentation.fieldHue).toBe(0);
    expect(presentation.gamutStatus.srgb).toBe(exact.value.status);
    expect(presentation.hueHelp).toContain("Hue is unset");
    expect(definitionOf(selected).channels).toEqual([0.6, 0, 0]);
  });

  it.each(["oklch", "oklab"] as const)(
    "positions the %s sampled target guide without re-authoring the selected color",
    (view) => {
      const selected = value({ space: "oklch", channels: [0.62, 0.24, 270], alpha: 0.5 });
      const presentation = createPickerPresentation(selected, view, "srgb", visible);
      const guideChroma = getPickerGuide(
        { l: 0.62, c: 0.24, h: 270, alpha: 0.5 },
        PICKER_GAMUT_TABLES.srgb,
      ).maximumChroma;
      expect(presentation.targetGuidePoint).not.toBeNull();
      expect(presentation.targetGuideCss).toContain("oklch(");
      if (view === "oklch") {
        expect(presentation.targetGuidePoint?.x).toBeCloseTo(guideChroma / 0.4, 10);
        expect(presentation.targetGuidePoint?.y).toBeCloseTo(0.38, 10);
      } else {
        const coordinates = convertOklchToOklab({ l: 0.62, c: guideChroma, h: 270, alpha: 0.5 });
        const expected = oklabCoordinatesToPlanePoint(coordinates[1]!, coordinates[2]!);
        expect(presentation.targetGuidePoint?.x).toBeCloseTo(expected.x, 10);
        expect(presentation.targetGuidePoint?.y).toBeCloseTo(expected.y, 10);
      }
    },
  );

  it("previews fixed OKLab lightness from observed a/b and alpha", () => {
    const selected = value({ space: "oklab", channels: [0.68, 0.11, -0.07], alpha: 0.4 });
    const presentation = createPickerPresentation(selected, "oklab", "srgb", visible);
    const [, a, b] = presentation.oklab.representation.channels;
    const [l, c, h] = convertOklabToOklch([0.5, a, b]);
    const expected = serializeOklchSample({
      l: l!,
      c: Number(c!.toPrecision(12)),
      h: Number(h!.toPrecision(12)),
      alpha: 0.4,
    });

    expect(presentation.fixedLightnessGradient).toContain(`${expected} 50.000%`);
    expect(presentation.oklab.representation.channels).toEqual([0.68, 0.11, -0.07]);
  });
});

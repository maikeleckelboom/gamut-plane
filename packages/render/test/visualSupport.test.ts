import { describe, expect, it } from "vitest";
import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
} from "@gamut-plane/core";
import { editorDefinitions, geometryDefinitions } from "@gamut-plane/core/internal/capabilities";
import { fieldSupport } from "../src/capabilities/fieldSupport.js";
import { guideDefinitions, guideSupport } from "../src/capabilities/guideSupport.js";
import { PICKER_GAMUT_TABLES } from "../src/generated/gamutTables.js";

describe("render-owned current visual support", () => {
  it("retains the existing perceptual samplers alongside native RGB fields", () => {
    expect(Object.keys(fieldSupport)).toEqual([
      "oklch-lc",
      "oklab-ab",
      "srgb-rg",
      "srgb-rb",
      "srgb-gb",
      "display-p3-rg",
      "display-p3-rb",
      "display-p3-gb",
    ]);
    expect(fieldSupport["oklch-lc"].plane).toBe(OKLCH_LIGHTNESS_CHROMA_PLANE);
    expect(fieldSupport["oklab-ab"].plane).toBe(OKLAB_AB_PLANE);
    expect(Object.isFrozen(fieldSupport)).toBe(true);
    for (const support of [fieldSupport["oklch-lc"], fieldSupport["oklab-ab"]]) {
      const editor = editorDefinitions[support.editorId];
      expect(support.geometry).toBe(geometryDefinitions[editor.geometryId]);
      expect(support.plane.id).toBe(editor.representationId);
      expect(support.plane.constrainPoint).toBe(support.geometry.constrain);
      expect(support.plane.isPointInInstrumentDomain).toBe(support.geometry.contains);
      expect(Object.isFrozen(support)).toBe(true);
      const output = { l: 0, c: 0, h: 0, alpha: 0 };
      const scratch = { input: [0, 0, 0], converted: [0, 0, 0] };
      expect(support.plane.sampleField({ x: 0.6, y: 0.4 }, 0.5, output, scratch)).toBe(output);
    }
    expect(
      [fieldSupport["oklch-lc"], fieldSupport["oklab-ab"]].map(
        (row) => row.geometry.representationId,
      ),
    ).toEqual(["oklch", "oklab"]);
  });

  it("defines precisely the two sampled guides and their corresponding gamut/table", () => {
    expect(Object.keys(guideDefinitions)).toEqual(["srgb-boundary", "display-p3-boundary"]);
    expect(guideDefinitions["srgb-boundary"].gamutId).toBe("srgb-gamut");
    expect(guideDefinitions["display-p3-boundary"].gamutId).toBe("display-p3-gamut");
    expect(guideDefinitions["srgb-boundary"].table).toBe(PICKER_GAMUT_TABLES.srgb);
    expect(guideDefinitions["display-p3-boundary"].table).toBe(PICKER_GAMUT_TABLES.displayP3);
    expect(Object.isFrozen(guideDefinitions)).toBe(true);
    for (const definition of Object.values(guideDefinitions)) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(definition).not.toHaveProperty("analyze");
    }
  });

  it.each([
    ["oklch-lc", "srgb-boundary", getHueGuideIntervals],
    ["oklch-lc", "display-p3-boundary", getHueGuideIntervals],
    ["oklab-ab", "srgb-boundary", null],
    ["oklab-ab", "display-p3-boundary", null],
  ] as const)("binds %s / %s to the owner sampler", (editorId, guideId, hue) => {
    const row = guideSupport[editorId][guideId];
    const definition = guideDefinitions[guideId];
    const field = fieldSupport[editorId];
    const sample = { l: 0.62, c: 0.24, h: 270, alpha: 0.37 };
    const gamut = definition.table.gamut;
    expect(row.editorId).toBe(editorId);
    expect(row.guideId).toBe(guideId);
    expect(row.forms.contour.build).toBe(field.plane.buildGamutContour);
    expect(row.forms.contour.closed).toBe(field.plane.gamutContourClosed);
    expect(row.forms.hueIntervals).toBe(hue);
    expect(row.forms.lightnessIntervals).toBe(getLightnessGuideIntervals);
    expect(row.forms.chromaIntervals).toBe("oklch-maximum-chroma");
    expect(row.forms.reference).toBe(getPickerGuide);
    expect(row.forms.reference(sample, definition.table).gamut).toBe(gamut);
    expect(row.forms.lightnessIntervals(definition.table, sample)).toEqual(
      getLightnessGuideIntervals(definition.table, sample),
    );
    for (const object of [row, row.forms, row.forms.contour])
      expect(Object.isFrozen(object)).toBe(true);
  });

  it("has no other editor/guide rows", () => {
    expect(Object.isFrozen(guideSupport)).toBe(true);
    expect(Object.keys(guideSupport)).toEqual(["oklch-lc", "oklab-ab"]);
    for (const rows of Object.values(guideSupport)) {
      expect(Object.keys(rows)).toEqual(["srgb-boundary", "display-p3-boundary"]);
      expect(Object.isFrozen(rows)).toBe(true);
    }
  });
});

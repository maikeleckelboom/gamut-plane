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
import { currentGuideByGamut } from "../src/capabilities/currentView.js";
import { PICKER_GAMUT_TABLES } from "../src/generated/gamutTables.js";
import { getBoundaryPresentation } from "./fixtures/v03BoundaryPresentation.js";

describe("render-owned current visual support", () => {
  it("binds exactly two core editors to the existing field samplers and core geometry", () => {
    expect(Object.keys(fieldSupport)).toEqual(["oklch-lc", "oklab-ab"]);
    expect(fieldSupport["oklch-lc"].plane).toBe(OKLCH_LIGHTNESS_CHROMA_PLANE);
    expect(fieldSupport["oklab-ab"].plane).toBe(OKLAB_AB_PLANE);
    expect(Object.isFrozen(fieldSupport)).toBe(true);
    for (const support of Object.values(fieldSupport)) {
      const editor = editorDefinitions[support.editorId];
      expect(support.geometry).toBe(geometryDefinitions[editor.geometryId]);
      expect(support.plane.id).toBe(editor.representationId);
      expect(support.plane.id).toBe(support.geometry.planeId);
      expect(support.plane.constrainPoint).toBe(support.geometry.constrain);
      expect(support.plane.isPointInInstrumentDomain).toBe(support.geometry.contains);
      expect(Object.isFrozen(support)).toBe(true);
      const output = { l: 0, c: 0, h: 0, alpha: 0 };
      const scratch = { input: [0, 0, 0], converted: [0, 0, 0] };
      expect(support.plane.sampleField({ x: 0.6, y: 0.4 }, 0.5, output, scratch)).toBe(output);
    }
    expect(Object.values(fieldSupport).map((row) => row.geometry.representationId)).toEqual([
      "oklch",
      "oklab",
    ]);
  });

  it("bridges only the current public views and gamut references", () => {
    expect(currentGuideByGamut).toEqual({
      srgb: "srgb-boundary",
      "display-p3": "display-p3-boundary",
    });
    expect(Object.isFrozen(currentGuideByGamut)).toBe(true);
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
  ] as const)("proves %s / %s forms against current output", (editorId, guideId, hue) => {
    const row = guideSupport[editorId][guideId];
    const definition = guideDefinitions[guideId];
    const field = fieldSupport[editorId];
    const sample = { l: 0.62, c: 0.24, h: 270, alpha: 0.37 };
    const gamut = definition.table.gamut;
    const presentation = getBoundaryPresentation(
      sample,
      field.plane.id,
      gamut,
      {
        srgb: gamut === "srgb",
        displayP3: gamut === "display-p3",
      },
      { srgb: "outside", displayP3: "outside" },
    );
    expect(row.editorId).toBe(editorId);
    expect(row.guideId).toBe(guideId);
    expect(row.forms.contour.build).toBe(field.plane.buildGamutContour);
    expect(row.forms.contour.closed).toBe(field.plane.gamutContourClosed);
    expect(row.forms.hueIntervals).toBe(hue);
    expect(row.forms.lightnessIntervals).toBe(getLightnessGuideIntervals);
    expect(row.forms.chromaIntervals).toBe("oklch-maximum-chroma");
    expect(row.forms.reference).toBe(getPickerGuide);
    expect(row.forms.targetMarker.requires).toBe("exact-outside");
    expect(row.forms.targetMarker.position(presentation.targetGuide.color)).toEqual(
      presentation.targetGuidePoint,
    );
    expect(presentation.targetGuide).toEqual(row.forms.reference(sample, definition.table));
    expect(presentation.hueIntervals).toEqual(
      hue ? hue(definition.table, sample).map((interval) => ({ ...interval, tone: gamut })) : [],
    );
    expect(presentation.lightnessIntervals).toEqual(
      row.forms
        .lightnessIntervals(definition.table, sample)
        .map((interval) => ({ ...interval, tone: gamut })),
    );
    expect(presentation.chromaIntervals).toHaveLength(1);
    expect(presentation.markers).toHaveLength(1);
    for (const object of [row, row.forms, row.forms.contour, row.forms.targetMarker])
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

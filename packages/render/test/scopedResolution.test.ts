import { afterEach, describe, expect, it, vi } from "vitest";
import * as core from "@gamut-plane/core";
import { editorDefinitions, geometryDefinitions } from "@gamut-plane/core/internal/capabilities";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveGeometryField,
} from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import { fieldSupport } from "../src/capabilities/fieldSupport.js";
import { guideSupport, type GuideId } from "../src/capabilities/guideSupport.js";

vi.mock("@gamut-plane/core", async (original) => {
  const actual = await original<typeof core>();
  return {
    ...actual,
    represent: vi.fn(actual.represent),
    analyzeGamut: vi.fn(actual.analyzeGamut),
    getPickerGuide: vi.fn(actual.getPickerGuide),
  };
});
vi.mock("@gamut-plane/core/internal/capabilities", async (original) => {
  const actual = await original<typeof import("@gamut-plane/core/internal/capabilities")>();
  return {
    ...actual,
    geometryDefinitions: Object.fromEntries(
      Object.entries(actual.geometryDefinitions).map(([id, geometry]) => [
        id,
        { ...geometry, project: vi.fn(geometry.project) },
      ]),
    ),
  };
});
afterEach(() => vi.clearAllMocks());

function color(channels: core.ColorRepresentation["channels"], space: "oklch" = "oklch") {
  const result = core.createColorValue({ space, channels, alpha: 0.37 });
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}
function defined(definition: core.ColorRepresentation) {
  const result = core.createColorValue(definition);
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}
const ordinary = color([0.62, 0.24, 270]);
const guideIds = ["display-p3-boundary", "srgb-boundary"] as const;
function resolvedGuide(
  value: core.ColorValue,
  editorId: "oklch-lc" | "oklab-ab",
  guideId: GuideId = "srgb-boundary",
) {
  const [row] = resolveRequestedGuides(value, resolveEditorVisualSupport(editorId), [guideId]);
  if (row?.kind !== "resolved") throw new Error("Expected a supported guide");
  return row;
}

describe("editor and field resolution", () => {
  it("keeps RGB raw projection, extended fixed slices and marker membership as independent geometry facts", () => {
    const source = defined({ space: "srgb", channels: [1.2, 0.4, -0.1], alpha: 0.37 });
    const before = core.snapshotColor(source);
    expect(resolveGeometryField(source, geometryDefinitions["srgb-rg-rectangle"])).toMatchObject({
      kind: "available",
      samplingFixed: -0.1,
      markerInDomain: false,
      fixedCoordinate: { channelId: "srgb.b", value: -0.1 },
      projection: {
        point: { x: 1.2, y: 0.6 },
        representation: { channels: [1.2, 0.4, -0.1], alpha: 0.37 },
      },
    });
    expect(core.snapshotColor(source)).toEqual(before);
    expect(resolveField(source, resolveEditorVisualSupport("srgb-rg"))).toEqual({
      kind: "field-unsupported",
    });
    expect(core.analyzeGamut).not.toHaveBeenCalled();
  });

  it("retains six technical RGB geometries without fabricating fields, guides or observations", () => {
    for (const id of [
      "srgb-rg",
      "srgb-rb",
      "srgb-gb",
      "display-p3-rg",
      "display-p3-rb",
      "display-p3-gb",
    ] as const) {
      const context = resolveEditorVisualSupport(id);
      if (context.kind !== "editor") throw new Error("Expected a technical editor");
      expect(context.editor).toBe(editorDefinitions[id]);
      expect(context.geometry).toBe(geometryDefinitions[editorDefinitions[id].geometryId]);
      expect(context.field).toBeNull();
      expect(resolveField(ordinary, context)).toEqual({ kind: "field-unsupported" });
      expect(resolveRequestedGuides(ordinary, context, guideIds)).toEqual(
        guideIds.map((guideId) => ({ guideId, kind: "no-guide-for-editor" })),
      );
    }
    for (const geometry of Object.values(geometryDefinitions))
      expect(geometry.project).not.toHaveBeenCalled();
    expect(core.represent).not.toHaveBeenCalled();
    expect(core.analyzeGamut).not.toHaveBeenCalled();
    expect(core.getPickerGuide).not.toHaveBeenCalled();
  });

  it("treats no editor as a non-error no-request without projecting", () => {
    const context = resolveEditorVisualSupport(null);
    expect(context).toEqual({ kind: "no-editor-requested" });
    expect(resolveField(ordinary, context)).toEqual({ kind: "no-field-requested" });
    for (const geometry of Object.values(geometryDefinitions))
      expect(geometry.project).not.toHaveBeenCalled();
  });

  it.each(["oklch-lc", "oklab-ab"] as const)(
    "resolves %s identities and only its projection",
    (id) => {
      const context = resolveEditorVisualSupport(id);
      if (context.kind !== "editor") throw new Error("Expected an editor");
      expect(context.editor).toBe(editorDefinitions[id]);
      expect(context.geometry).toBe(geometryDefinitions[context.editor.geometryId]);
      expect(context.field).toBe(fieldSupport[id]);
      const field = resolveField(ordinary, context);
      expect(field.kind).toBe("available");
      expect(context.geometry.project).toHaveBeenCalledExactlyOnceWith(ordinary);
      const other = id === "oklch-lc" ? "oklab-ab-disc" : "oklch-lc-rectangle";
      expect(geometryDefinitions[other].project).not.toHaveBeenCalled();
    },
  );

  it("retains missing Hue while permitting the existing achromatic slice", () => {
    const value = color([0.5, -0, null]);
    const before = core.snapshotColor(value);
    expect(resolveField(value, resolveEditorVisualSupport("oklch-lc"))).toMatchObject({
      kind: "available",
      fixedCoordinate: { channelId: "oklch.h", value: null },
      samplingFixed: 0,
      projection: { representation: { channels: [0.5, -0, null] } },
    });
    expect(core.snapshotColor(value)).toEqual(before);
  });

  it("keeps raw Chroma overflow and the OKLab point outside its disc without rejecting the field", () => {
    for (const [value, editorId] of [
      [color([0.5, 0.9, 40]), "oklch-lc"],
      [defined({ space: "oklab", channels: [0.5, 0.4, 0.4], alpha: 1 }), "oklab-ab"],
    ] as const) {
      const before = core.snapshotColor(value);
      const context = resolveEditorVisualSupport(editorId);
      const field = resolveField(value, context);
      expect(field).toMatchObject({ kind: "available", markerInDomain: false });
      if (field.kind !== "available" || context.kind !== "editor")
        throw new Error("Expected field");
      const constrained = context.geometry.constrain(field.projection.point);
      expect(context.geometry.contains(constrained)).toBe(true);
      expect(constrained).not.toEqual(field.projection.point);
      expect(core.snapshotColor(value)).toEqual(before);
    }
  });

  it("does not silently clamp an out-of-range fixed Lightness", () => {
    const value = color([1.2, 0.1, 40]);
    expect(resolveField(value, resolveEditorVisualSupport("oklch-lc"))).toMatchObject({
      kind: "available",
      markerInDomain: false,
    });
    expect(resolveField(value, resolveEditorVisualSupport("oklab-ab"))).toMatchObject({
      kind: "value-unavailable",
      reason: "fixed-coordinate-out-of-domain",
      fixedCoordinate: { channelId: "oklab.l", value: 1.2 },
      projection: { representation: { channels: [1.2, expect.any(Number), expect.any(Number)] } },
    });
  });

  it("keeps projection ConversionError separate from valid authored-space observation", () => {
    const value = defined({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
    expect(resolveField(value, resolveEditorVisualSupport("oklch-lc"))).toMatchObject({
      kind: "value-unavailable",
      reason: "projection-failed",
      error: { code: "numerical-range", from: "srgb", to: "oklch" },
    });
    expect(core.represent(value, "srgb").ok).toBe(true);
  });
});

describe("independent requested guide forms", () => {
  it.each(["oklch-lc", "oklab-ab"] as const)(
    "retains both %s guide rows and their sampled forms",
    (editorId) => {
      const rows = resolveRequestedGuides(ordinary, resolveEditorVisualSupport(editorId), guideIds);
      expect(rows.map((row) => row.guideId)).toEqual(guideIds);
      for (const row of rows) {
        if (row.kind !== "resolved") throw new Error("Expected resolved guide");
        expect(row.support).toBe(guideSupport[editorId][row.guideId]);
        expect(Object.keys(row.forms)).toEqual([
          "contour",
          "hueIntervals",
          "lightnessIntervals",
          "chromaIntervals",
          "reference",
        ]);
        for (const form of [
          row.forms.contour,
          row.forms.lightnessIntervals,
          row.forms.chromaIntervals,
          row.forms.reference,
        ])
          expect(form.kind).toBe("available");
        expect(row.forms.hueIntervals?.kind ?? null).toBe(
          editorId === "oklab-ab" ? null : "available",
        );
        if (row.forms.contour.kind === "available") {
          expect(row.forms.contour.value.closed).toBe(editorId === "oklab-ab");
          expect(row.forms.contour.value.points.length).toBeGreaterThan(0);
          expect(row.forms.contour.value.points.every(Number.isFinite)).toBe(true);
        }
      }
      expect(core.analyzeGamut).not.toHaveBeenCalled();
      expect(core.getPickerGuide).toHaveBeenCalledTimes(2);
      // Each needed representation is observed once for the whole requested collection.
      expect(vi.mocked(core.represent).mock.calls.map(([, id]) => id)).toEqual(
        editorId === "oklch-lc" ? ["oklch"] : ["oklab", "oklch"],
      );
    },
  );

  it("does no sampled or observation work for an empty guide collection", () => {
    expect(resolveRequestedGuides(ordinary, resolveEditorVisualSupport("oklab-ab"), [])).toEqual(
      [],
    );
    expect(core.represent).not.toHaveBeenCalled();
    expect(core.getPickerGuide).not.toHaveBeenCalled();
    expect(core.analyzeGamut).not.toHaveBeenCalled();
  });

  it("retains requests without an editor and resolves the same preferences after switching", () => {
    const requested = Object.freeze([...guideIds]);
    expect(resolveRequestedGuides(ordinary, resolveEditorVisualSupport(null), requested)).toEqual(
      requested.map((guideId) => ({ guideId, kind: "no-editor" })),
    );
    expect(core.represent).not.toHaveBeenCalled();
    expect(core.getPickerGuide).not.toHaveBeenCalled();
    expect(
      resolveRequestedGuides(ordinary, resolveEditorVisualSupport("oklch-lc"), requested).every(
        (row) => row.kind === "resolved",
      ),
    ).toBe(true);
    expect(requested).toEqual(guideIds);
  });

  it("keeps contour and Lightness intervals when extended L prevents other L/C forms", () => {
    const value = color([1.2, 0.1, 40]);
    const before = core.snapshotColor(value);
    const row = resolvedGuide(value, "oklch-lc");
    expect(row.forms.contour.kind).toBe("available");
    expect(row.forms.lightnessIntervals.kind).toBe("available");
    for (const form of [row.forms.reference, row.forms.chromaIntervals, row.forms.hueIntervals])
      expect(form).toMatchObject({
        kind: "value-unavailable",
        reason: "lightness-out-of-range",
        lightness: 1.2,
      });
    const lab = resolvedGuide(value, "oklab-ab");
    expect(lab.forms.contour).toMatchObject({
      kind: "value-unavailable",
      reason: "lightness-out-of-range",
    });
    expect(lab.forms.lightnessIntervals.kind).toBe("available");
    expect(lab.forms.hueIntervals).toBeNull();
    expect(core.snapshotColor(value)).toEqual(before);
  });

  it("keeps an OKLab contour when OKLCH observation overflows", () => {
    const value = defined({ space: "oklab", channels: [0.5, 1.3e308, 1.3e308], alpha: 1 });
    const row = resolvedGuide(value, "oklab-ab");
    expect(row.forms.contour.kind).toBe("available");
    for (const form of [
      row.forms.reference,
      row.forms.chromaIntervals,
      row.forms.lightnessIntervals,
    ])
      expect(form).toMatchObject({
        kind: "value-unavailable",
        reason: "observation-failed",
        error: { code: "numerical-range", to: "oklch" },
      });
    expect(row.forms.hueIntervals).toBeNull();
  });

  it("does not gate usable guide forms on a field marker projection overflow", () => {
    const value = color([0.5, 1e308, 40]);
    expect(resolveField(value, resolveEditorVisualSupport("oklch-lc"))).toMatchObject({
      kind: "value-unavailable",
      reason: "projection-failed",
    });
    const row = resolvedGuide(value, "oklch-lc");
    expect(row.forms.contour.kind).toBe("available");
    expect(row.forms.reference.kind).toBe("available");
    expect(row.forms.lightnessIntervals).toEqual({ kind: "available", value: [] });
  });
});

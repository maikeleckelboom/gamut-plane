import { describe, expect, it } from "vitest";
import { createColorValue, definitionOf, OKLCH_LIGHTNESS_CHROMA_PLANE } from "@gamut-plane/core";
import { editorDefinitions, geometryDefinitions } from "@gamut-plane/core/internal/capabilities";
import { testOklchHcEditor, testOklchHcGeometry } from "./fixtures/testOklchHcEditor.js";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveGeometryField,
} from "../src/capabilities/editorResolution.js";
import { fieldCacheKey } from "../src/fieldRenderer.js";

describe("test-only second editor geometry", () => {
  it("resolves two editor geometries for one representation without reauthoring", () => {
    const created = createColorValue({ space: "oklch", channels: [0.62, 0.2, 210], alpha: 0.37 });
    if (!created.ok) throw new Error("Invalid fixture");
    const value = created.value;
    const before = definitionOf(value);
    const technicalEditors = [editorDefinitions["oklch-lc"], testOklchHcEditor] as const;
    expect(technicalEditors.map((editor) => editor.representationId)).toEqual(["oklch", "oklch"]);
    expect(technicalEditors.map((editor) => editor.geometryId)).toEqual([
      "oklch-lc-rectangle",
      "test-oklch-hc-rectangle",
    ]);
    const current = resolveField(value, resolveEditorVisualSupport("oklch-lc"));
    const alternate = resolveGeometryField(value, testOklchHcGeometry);
    expect(current.kind).toBe("available");
    expect(alternate.kind).toBe("available");
    if (current.kind !== "available" || alternate.kind !== "available") return;
    expect(current.projection).toMatchObject({
      representationId: "oklch",
      geometryId: "oklch-lc-rectangle",
      channels: { x: "oklch.c", y: "oklch.l", fixed: "oklch.h" },
      coordinates: { x: 0.2, y: 0.62, fixed: 210 },
    });
    expect(alternate.projection).toMatchObject({
      representationId: "oklch",
      geometryId: "test-oklch-hc-rectangle",
      channels: { x: "oklch.h", y: "oklch.c", fixed: "oklch.l" },
      coordinates: { x: 210, y: 0.2, fixed: 0.62 },
      point: { x: 210 / 360, y: 0.5 },
    });
    expect(current.projection.point).not.toEqual(alternate.projection.point);
    expect(current.projection.representation).toEqual(alternate.projection.representation);
    expect(current.fixedCoordinate.channelId).not.toBe(alternate.fixedCoordinate.channelId);
    expect(definitionOf(value)).toEqual(before);
    expect(value).toBe(created.value);
    expect(Object.keys(geometryDefinitions)).not.toContain(testOklchHcGeometry.id);
  });

  it("includes geometry identity in the field cache key with equal sampler inputs", () => {
    const common = {
      plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
      fixed: 0.62,
      pixelRatio: 1,
      interactionPreview: false,
    };
    const size = { width: 320, height: 320, pixelRatio: 1 };
    const current = fieldCacheKey(
      { ...common, fieldId: "oklch-lc-rectangle" },
      size,
      "srgb",
      "full",
    );
    const alternate = fieldCacheKey(
      { ...common, fieldId: testOklchHcGeometry.id },
      size,
      "srgb",
      "full",
    );
    expect(alternate).not.toBe(current);
    expect(alternate).toContain(testOklchHcEditor.geometryId);
  });
});

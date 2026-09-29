import { describe, expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
} from "../src/capabilities/index.js";
import { referenceGuidePolicy } from "../src/capabilities/guideSupport.js";
import { currentField } from "../src/current/field.js";
import { referenceDisplay } from "../src/current/referenceDisplay.js";

const created = createColorValue({ space: "oklch", channels: [0.68, 0.25, 252], alpha: 0.37 });
if (!created.ok) throw new Error("Invalid fixture");
const value = created.value;

describe("sampled spatial Reference", () => {
  it("retains sample and projection while hiding interior or exact-tolerated feedback", () => {
    const editor = resolveEditorVisualSupport("oklch-lc");
    const field = currentField(editor, resolveField(value, editor));
    const guides = resolveRequestedGuides(value, editor, ["srgb-boundary"]);
    expect(referenceDisplay("srgb-gamut", guides, field)?.showSpatial).toBe(true);
    for (const channels of [
      [0.5, 0.5, 0.5],
      [-1e-10, 0.5, 0.5],
    ] as const) {
      const created = createColorValue({ space: "srgb", channels, alpha: 1 });
      if (!created.ok) throw new Error("Invalid fixture");
      // Synthetic discrepancy proves sampled excursion cannot override accepted exact Inside/tolerance.
      const result = referenceDisplay(
        "srgb-gamut",
        guides,
        field,
        analyzeRequestedGamuts(created.value, ["srgb-gamut"]),
      );
      expect(result?.showSpatial).toBe(false);
      expect(result?.spatial.kind).toBe("available");
      expect(result?.sampled.deltaC).toBeGreaterThan(0);
    }
  });
  it.each(["oklch-lc", "oklab-ab"] as const)(
    "uses explicit guide policy in %s without constraining",
    (editorId) => {
      const editor = resolveEditorVisualSupport(editorId);
      const field = currentField(editor, resolveField(value, editor));
      const guides = resolveRequestedGuides(value, editor, [
        "display-p3-boundary",
        "srgb-boundary",
      ]);
      const constrain = vi.fn(field.geometry.constrain);
      const context = { ...field, geometry: { ...field.geometry, constrain } };
      for (const gamutId of ["srgb-gamut", "display-p3-gamut"] as const) {
        const result = referenceDisplay(gamutId, guides, context);
        expect(result?.guideId).toBe(referenceGuidePolicy[gamutId]);
        const row = guides.find((guide) => guide.guideId === result?.guideId);
        if (row?.kind !== "resolved" || row.forms.reference.kind !== "available")
          throw new Error("Missing fact");
        expect(result?.sampled).toBe(row.forms.reference.value);
        expect(result?.spatial.kind).toBe("available");
      }
      expect(referenceDisplay("srgb-gamut", guides, context)?.spatial).not.toEqual(
        referenceDisplay("display-p3-gamut", guides, context)?.spatial,
      );
      expect(constrain).not.toHaveBeenCalled();
      expect(referenceDisplay(null, guides, field)).toBeNull();
      expect(referenceDisplay("srgb-gamut", [guides[0]!], field)).toBeNull();
    },
  );

  it.each(["oklch-lc", "oklab-ab"] as const)(
    "retains sampled facts but rejects unrepresentable %s endpoints",
    (editorId) => {
      const editor = resolveEditorVisualSupport(editorId);
      const field = currentField(editor, resolveField(value, editor));
      const guides = resolveRequestedGuides(value, editor, ["srgb-boundary"]);
      const row = guides[0]!;
      if (row.kind !== "resolved" || row.forms.reference.kind !== "available")
        throw new Error("Missing fact");
      const sampled = {
        ...row.forms.reference.value,
        color: { ...row.forms.reference.value.color, c: 0.8 },
      };
      const outside = [
        {
          ...row,
          forms: { ...row.forms, reference: { kind: "available" as const, value: sampled } },
        },
      ];
      const result = referenceDisplay("srgb-gamut", outside, field);
      expect(result?.sampled).toBe(sampled);
      expect(result?.spatial).toEqual({ kind: "unavailable" });
      expect(referenceDisplay("srgb-gamut", guides, null)?.spatial).toEqual({
        kind: "unavailable",
      });
      const nonfinite = {
        ...field,
        geometry: { ...field.geometry, toPoint: () => ({ x: Infinity, y: 0 }) },
      };
      expect(referenceDisplay("srgb-gamut", guides, nonfinite)?.spatial).toEqual({
        kind: "unavailable",
      });
    },
  );
});

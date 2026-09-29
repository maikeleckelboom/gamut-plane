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
const checks = analyzeRequestedGamuts(value, ["srgb-gamut", "display-p3-gamut"]);

describe("sampled spatial Reference", () => {
  it.each(["oklch-lc", "oklab-ab"] as const)(
    "retains sampled boundary and truthful %s projection regardless of exact status or excursion",
    (editorId) => {
      const editor = resolveEditorVisualSupport(editorId);
      for (const [status, channels] of [
        ["inside", [0.3, 0.5, 0.5]],
        ["within-tolerance", [-1e-10, 0.5, 0.5]],
        ["outside", [-0.1, 0.5, 0.5]],
      ] as const) {
        const created = createColorValue({ space: "srgb", channels, alpha: 0.37 });
        if (!created.ok) throw new Error("Invalid fixture");
        const exactChecks = analyzeRequestedGamuts(created.value, ["srgb-gamut"]);
        expect(exactChecks[0]?.result).toMatchObject({
          ok: true,
          value: { status },
        });
        const field = currentField(editor, resolveField(created.value, editor));
        const guides = resolveRequestedGuides(created.value, editor, ["srgb-boundary"]);
        const result = referenceDisplay("srgb-gamut", guides, field, exactChecks);
        expect(result?.showExcursion).toBe(status === "outside");
        expect(result?.spatial.kind).toBe("available");
        const row = guides[0]!;
        if (row.kind !== "resolved" || row.forms.reference.kind !== "available")
          throw new Error("Missing fact");
        expect(result?.sampled).toBe(row.forms.reference.value);
        if (status === "inside") {
          expect(result?.sampled.deltaC).toBe(0);
          expect(result?.spatial.kind === "available" && result.spatial.point).not.toEqual(
            field.projection.point,
          );
        }
      }
    },
  );
  it.each([0, 0.1])("sampled deltaC=%s never decides excursion visibility", (deltaC) => {
    const editor = resolveEditorVisualSupport("oklch-lc");
    const field = currentField(editor, resolveField(value, editor));
    const guides = resolveRequestedGuides(value, editor, ["srgb-boundary"]);
    const row = guides[0]!;
    if (row.kind !== "resolved" || row.forms.reference.kind !== "available")
      throw new Error("Missing fact");
    const sampled = { ...row.forms.reference.value, deltaC };
    const adjusted = [
      {
        ...row,
        forms: { ...row.forms, reference: { kind: "available" as const, value: sampled } },
      },
    ];
    for (const [status, channels] of [
      ["inside", [0.3, 0.5, 0.5]],
      ["within-tolerance", [-1e-10, 0.5, 0.5]],
      ["outside", [-0.1, 0.5, 0.5]],
      ["unavailable", [1e308, 0, 0]],
    ] as const) {
      const created = createColorValue({ space: "srgb", channels, alpha: 1 });
      if (!created.ok) throw new Error("Invalid fixture");
      // Deliberately vary accepted exact facts independently of a fixed sampled endpoint.
      const exact = analyzeRequestedGamuts(created.value, ["srgb-gamut"]);
      expect(exact[0]?.result.ok ? exact[0].result.value.status : "unavailable").toBe(status);
      const result = referenceDisplay("srgb-gamut", adjusted, field, exact);
      expect(result?.showExcursion).toBe(status === "outside");
      expect(result?.sampled).toBe(sampled);
      expect(result?.spatial.kind).toBe("available");
    }
    for (const exact of [[], checks.filter((row) => row.gamutId === "display-p3-gamut")]) {
      const result = referenceDisplay("srgb-gamut", adjusted, field, exact);
      expect(result?.showExcursion).toBe(false);
      expect(result?.sampled).toBe(sampled);
      expect(result?.spatial.kind).toBe("available");
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
        const result = referenceDisplay(gamutId, guides, context, checks);
        expect(result?.guideId).toBe(referenceGuidePolicy[gamutId]);
        const row = guides.find((guide) => guide.guideId === result?.guideId);
        if (row?.kind !== "resolved" || row.forms.reference.kind !== "available")
          throw new Error("Missing fact");
        expect(result?.sampled).toBe(row.forms.reference.value);
        expect(result?.spatial.kind).toBe("available");
      }
      expect(referenceDisplay("srgb-gamut", guides, context, checks)?.spatial).not.toEqual(
        referenceDisplay("display-p3-gamut", guides, context, checks)?.spatial,
      );
      expect(constrain).not.toHaveBeenCalled();
      expect(referenceDisplay(null, guides, field, checks)).toBeNull();
      expect(referenceDisplay("srgb-gamut", [guides[0]!], field, checks)).toBeNull();
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
      const constrain = vi.fn(field.geometry.constrain);
      const context = { ...field, geometry: { ...field.geometry, constrain } };
      const result = referenceDisplay("srgb-gamut", outside, context, checks);
      expect(result?.showExcursion).toBe(true);
      expect(constrain).not.toHaveBeenCalled();
      expect(result?.sampled).toBe(sampled);
      expect(result?.spatial).toEqual({ kind: "unavailable" });
      expect(referenceDisplay("srgb-gamut", guides, null, checks)?.spatial).toEqual({
        kind: "unavailable",
      });
      const nonfinite = {
        ...field,
        geometry: { ...field.geometry, toPoint: () => ({ x: Infinity, y: 0 }) },
      };
      expect(referenceDisplay("srgb-gamut", guides, nonfinite, checks)?.spatial).toEqual({
        kind: "unavailable",
      });
    },
  );
});

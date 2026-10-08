import { describe, expect, it } from "vitest";
import { createColorValue, represent, definitionOf } from "@gamut-plane/core";
import type { EditorId } from "@gamut-plane/core/internal/capabilities";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import {
  generalizedEditableDetail,
  generalizedGuideDisplay,
} from "../src/current/generalizedDisplay.js";
import { referenceBoundaryFit } from "../src/current/referenceBoundaryFit.js";

function facts(editorId: EditorId, channels: readonly [number, number, number] = [0.5, 0.5, 0.5]) {
  const editor = resolveEditorVisualSupport(editorId);
  if (editor.kind !== "editor") throw Error("fixture");
  const created = createColorValue({
    space: editor.geometry.representationId,
    channels,
    alpha: 0.37,
  });
  if (!created.ok) throw Error("fixture");
  const value = created.value;
  const visual = generalizedEditableDetail(
    value,
    represent(value, editor.geometry.representationId),
    editor,
    resolveField(value, editor),
  );
  if (visual.kind !== "available") throw Error("fixture");
  const guides = resolveRequestedGuides(value, editor, ["srgb-boundary", "display-p3-boundary"]);
  return { value, field: visual.field, visual, guides };
}

describe("Reference fitting and self-boundary presentation", () => {
  it.each([
    "srgb-rg",
    "srgb-rb",
    "srgb-gb",
    "display-p3-rg",
    "display-p3-rb",
    "display-p3-gb",
  ] as const)(
    "%s suppresses only its own contour, retaining requests and intervals at extended fixed coordinates",
    (id) => {
      for (const fixed of [-0.1, 0, 0.5, 1, 1.1]) {
        const f = id.endsWith("rg") ? 2 : id.endsWith("rb") ? 1 : 0;
        const channels: [number, number, number] = [0.5, 0.5, 0.5];
        channels[f] = fixed;
        const { value, field, visual, guides } = facts(id, channels);
        const before = definitionOf(value);
        const display = generalizedGuideDisplay(guides, visual);
        const raw = generalizedGuideDisplay(guides);
        const srgb = id.startsWith("srgb");
        expect(srgb ? display.srgbPath : display.displayP3Path).toBeNull();
        expect(srgb ? display.displayP3Path : display.srgbPath).toBe(
          srgb ? raw.displayP3Path : raw.srgbPath,
        );
        expect(display.rgbIntervals).toEqual(raw.rgbIntervals);
        expect(guides.map((guide) => guide.guideId)).toEqual([
          "srgb-boundary",
          "display-p3-boundary",
        ]);
        expect(
          referenceBoundaryFit(srgb ? "srgb-gamut" : "display-p3-gamut", guides, field),
        ).toEqual({ kind: "unavailable", reason: "native-self-boundary" });
        expect(definitionOf(value)).toEqual(before);
      }
    },
  );
  it.each(["oklch-lc", "oklab-ab"] as const)(
    "%s keeps both contours and fits without a Status request",
    (id) => {
      const { field, visual, guides } = facts(
        id,
        id === "oklch-lc" ? [0.68, 0.15, 252] : [0.68, 0.1, 0.1],
      );
      const display = generalizedGuideDisplay(guides, visual);
      expect(display.srgbPath).toBeTruthy();
      expect(display.displayP3Path).toBeTruthy();
      for (const gamut of ["srgb-gamut", "display-p3-gamut"] as const)
        expect(referenceBoundaryFit(gamut, guides, field).kind).toBe("available");
    },
  );
  it("retains native comparison point/line intersections and distinguishes successful empty geometry", () => {
    for (const id of ["display-p3-rg", "display-p3-rb", "display-p3-gb"] as const) {
      const channels: [number, number, number] = [0, 0, 0];
      const { field, guides } = facts(id, channels);
      expect(referenceBoundaryFit("srgb-gamut", guides, field).kind).toBe("available");
    }
    const { field, guides } = facts("display-p3-rg", [0.5, 0.5, 2]);
    expect(referenceBoundaryFit("srgb-gamut", guides, field)).toEqual({
      kind: "unavailable",
      reason: "empty",
    });
  });
  it("explains missing Reference, request, field and failed contour without substitution", () => {
    const { field, guides } = facts("oklch-lc", [0.68, 0.15, 252]);
    expect(referenceBoundaryFit(null, guides, field)).toEqual({
      kind: "unavailable",
      reason: "no-reference",
    });
    expect(
      referenceBoundaryFit(
        "srgb-gamut",
        guides.filter((guide) => guide.guideId !== "srgb-boundary"),
        field,
      ),
    ).toEqual({ kind: "unavailable", reason: "boundary-not-requested" });
    expect(referenceBoundaryFit("srgb-gamut", guides, null)).toEqual({
      kind: "unavailable",
      reason: "no-field",
    });
    expect(
      referenceBoundaryFit(
        "srgb-gamut",
        [{ guideId: "srgb-boundary", kind: "no-guide-for-editor" }],
        field,
      ),
    ).toEqual({ kind: "unavailable", reason: "unavailable" });
  });
});

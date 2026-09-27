import { expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";

// Test-only missing relations, without widening EditorId or installing a runtime registry.
vi.mock("../src/capabilities/guideSupport.js", async (original) => {
  const actual = await original<typeof import("../src/capabilities/guideSupport.js")>();
  return {
    ...actual,
    guideSupport: {
      ...actual.guideSupport,
      "oklch-lc": { "srgb-boundary": actual.guideSupport["oklch-lc"]["srgb-boundary"] },
    },
  };
});

it("resolves a real guide relation without Canvas field support, and reports a distinct missing relation", () => {
  const created = createColorValue({ space: "oklch", channels: [0.5, 0.1, 40], alpha: 1 });
  if (!created.ok) throw new Error("Invalid fixture");
  const context = resolveEditorVisualSupport("oklab-ab");
  if (context.kind !== "editor") throw new Error("Expected editor");
  const noField = { ...context, field: null };
  expect(noField).toMatchObject({
    kind: "editor",
    editor: { id: "oklab-ab" },
    geometry: { id: "oklab-ab-disc" },
    field: null,
  });
  expect(resolveField(created.value, noField)).toEqual({ kind: "field-unsupported" });
  const withoutField = resolveRequestedGuides(
    created.value,
    noField,
    ["srgb-boundary", "display-p3-boundary"],
    [],
  );
  expect(withoutField[0]).toMatchObject({
    guideId: "srgb-boundary",
    kind: "resolved",
    forms: {
      contour: { kind: "available" },
      reference: { kind: "available" },
      lightnessIntervals: { kind: "available" },
      chromaIntervals: { kind: "available" },
      targetMarker: { kind: "check-not-requested" },
    },
  });
  expect(withoutField[1]).toMatchObject({
    guideId: "display-p3-boundary",
    kind: "resolved",
  });
  const rows = resolveRequestedGuides(
    created.value,
    resolveEditorVisualSupport("oklch-lc"),
    ["display-p3-boundary", "srgb-boundary"],
    [],
  );
  expect(rows[0]).toEqual({ guideId: "display-p3-boundary", kind: "no-guide-for-editor" });
  expect(rows[1]).toMatchObject({ guideId: "srgb-boundary", kind: "resolved" });
});

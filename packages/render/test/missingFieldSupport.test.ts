import { expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import { guideSupport } from "../src/capabilities/guideSupport.js";

// The test removes a renderer relation, without inventing an editor or changing core ownership.
vi.mock("../src/capabilities/fieldSupport.js", async (original) => {
  const actual = await original<typeof import("../src/capabilities/fieldSupport.js")>();
  return { fieldSupport: { "oklch-lc": actual.fieldSupport["oklch-lc"] } };
});

it("resolves core editor and geometry when the field support row is absent", () => {
  const support = resolveEditorVisualSupport("oklab-ab");
  expect(support).toMatchObject({
    kind: "editor",
    editor: { id: "oklab-ab" },
    geometry: { id: "oklab-ab-disc" },
    field: null,
  });
  const source = createColorValue({ space: "oklab", channels: [0.5, 0.1, 0.1], alpha: 1 });
  if (!source.ok) throw new Error("Invalid fixture");
  expect(resolveField(source.value, support)).toEqual({ kind: "field-unsupported" });
  const [guide] = resolveRequestedGuides(source.value, support, ["srgb-boundary"]);
  expect(guide).toMatchObject({
    guideId: "srgb-boundary",
    kind: "resolved",
    forms: {
      contour: { kind: "available" },
      reference: { kind: "available" },
      lightnessIntervals: { kind: "available" },
      chromaIntervals: { kind: "available" },
    },
  });
  if (guide?.kind !== "resolved" || guide.forms.kind !== "perceptual")
    throw new Error("Expected a guide without Canvas field support");
  expect(guide.support).toBe(guideSupport["oklab-ab"]["srgb-boundary"]);
  expect(guide.forms.hueIntervals).toBeNull();
});

it("resolves native slices independently of missing Canvas field support", () => {
  const editor = resolveEditorVisualSupport("srgb-rg");
  const source = createColorValue({ space: "srgb", channels: [0.2, 0.4, 0.6], alpha: 1 });
  if (!source.ok) throw Error("fixture");
  expect(resolveField(source.value, editor)).toEqual({ kind: "field-unsupported" });
  expect(resolveRequestedGuides(source.value, editor, ["srgb-boundary"])).toMatchObject([
    {
      kind: "resolved",
      forms: { kind: "rgb", contour: { kind: "available", value: { coverage: "full" } } },
    },
  ]);
});

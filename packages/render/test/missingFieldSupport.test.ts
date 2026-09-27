import { expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";

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
});

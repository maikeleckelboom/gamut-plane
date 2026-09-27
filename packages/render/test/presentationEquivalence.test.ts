import { describe, expect, it } from "vitest";
import { createColorValue, definitionOf, type ColorRepresentation } from "@gamut-plane/core";
import { createPickerPresentation } from "../src/pickerPresentation.js";
import { getBoundaryPresentation } from "../src/boundaryPresentation.js";
import { createPickerPresentation as beforePicker } from "./fixtures/v03PickerPresentation.js";
import { getBoundaryPresentation as beforeBoundary } from "./fixtures/v03BoundaryPresentation.js";

const fixtures = [
  ["OKLCH inside", { space: "oklch", channels: [0.6, 0.05, 45], alpha: 1 }],
  ["OKLab normal", { space: "oklab", channels: [0.6, 0.08, -0.05], alpha: 1 }],
  ["P3 only", { space: "display-p3", channels: [0, 1, 0], alpha: 0.372913 }],
  ["outside both", { space: "oklch", channels: [0.62, 0.24, 270], alpha: 0.5 }],
  ["missing Hue", { space: "oklch", channels: [0.6, 0, null], alpha: 0 }],
  ["Chroma overflow", { space: "oklch", channels: [0.62, 0.52, 45], alpha: 0.4 }],
  ["outside disc", { space: "oklab", channels: [0.6, 0.8, -0.7], alpha: 0.3 }],
  ["sRGB tolerance", { space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 }],
  ["P3 tolerance", { space: "display-p3", channels: [-1e-10, 0.5, 0.5], alpha: 1 }],
  ["sRGB endpoint", { space: "srgb", channels: [1, 0, 0], alpha: 1 }],
  ["raw Hue", { space: "oklch", channels: [0.6, 0.1, 720], alpha: 1 }],
  ["signed zero", { space: "oklab", channels: [-0, -0, -0], alpha: -0 }],
] as const satisfies readonly (readonly [string, ColorRepresentation])[];
const visibilities = [
  { srgb: true, displayP3: true },
  { srgb: false, displayP3: true },
  { srgb: true, displayP3: false },
  { srgb: false, displayP3: false },
];

describe("frozen v0.3 presentation equivalence", () => {
  it.each(fixtures)(
    "preserves every output for %s in both views, targets and all visibility states",
    (_name, definition) => {
      const selected = createColorValue(definition);
      if (!selected.ok) throw new Error("Invalid fixture");
      const original = definitionOf(selected.value);
      for (const view of ["oklch", "oklab"] as const) {
        for (const target of ["srgb", "display-p3"] as const) {
          for (const visibility of visibilities) {
            const before = beforePicker(selected.value, view, target, visibility);
            const after = createPickerPresentation(selected.value, view, target, visibility);
            // Exact structural equality also covers all gradient strings without giant snapshots.
            expect(after).toStrictEqual(before);
            expect(after.plane).toBe(before.plane);
            expect(after.plane.sampleField).toBe(before.plane.sampleField);
          }
        }
      }
      expect(definitionOf(selected.value)).toBe(original);
    },
  );

  it.each(["oklch", "oklab"] as const)(
    "preserves %s boundaries independently of exact-status inputs",
    (view) => {
      for (const c of [0.01, 0.24, 0.52]) {
        const sample = { l: 0.62, c, h: 270, alpha: 0.372913 };
        for (const target of ["srgb", "display-p3"] as const) {
          for (const visibility of visibilities) {
            for (const srgb of ["inside", "within-tolerance", "outside"] as const) {
              for (const displayP3 of ["inside", "within-tolerance", "outside"] as const) {
                const statuses = { srgb, displayP3 };
                const before = beforeBoundary(sample, view, target, visibility, statuses);
                const after = getBoundaryPresentation(sample, view, target, visibility, statuses);
                expect(after).toStrictEqual(before);
                expect(after.targetGuide).toBe(
                  after.guides[target === "srgb" ? "srgb" : "displayP3"],
                );
              }
            }
          }
        }
      }
    },
  );

  it.each([
    { space: "srgb", channels: [1e308, 0, 0], alpha: 1 },
    { space: "oklch", channels: [1.4, 0.2, 30], alpha: 1 },
  ] as const)(
    "retains the existing projection/visualization throw contract for %s",
    (definition) => {
      const selected = createColorValue(definition);
      if (!selected.ok) throw new Error("Invalid extended fixture");
      for (const view of ["oklch", "oklab"] as const) {
        let previous: unknown;
        try {
          beforePicker(selected.value, view, "srgb", visibilities[0]!);
        } catch (error) {
          previous = error;
        }
        expect(previous).toBeInstanceOf(Error);
        expect(() =>
          createPickerPresentation(selected.value, view, "srgb", visibilities[0]!),
        ).toThrow(previous as Error);
      }
    },
  );
});

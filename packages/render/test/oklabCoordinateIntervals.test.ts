import { describe, expect, it } from "vitest";
import { createColorValue, represent } from "@gamut-plane/core";
import {
  analyzeRequestedGamuts,
  editOperationDefinitions,
} from "@gamut-plane/core/internal/capabilities";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
} from "../src/capabilities/index.js";
import { currentField } from "../src/current/field.js";
import {
  generalizedEditableDetail,
  generalizedGuideDisplay,
} from "../src/current/generalizedDisplay.js";
import { oklabCoordinateIntervals } from "../src/current/oklabCoordinateIntervals.js";

const editor = resolveEditorVisualSupport("oklab-ab");

function setup(channels: readonly [number, number, number]) {
  const created = createColorValue({ space: "oklab", channels: [...channels], alpha: 1 });
  if (!created.ok) throw new Error("Invalid fixture");
  const field = currentField(editor, resolveField(created.value, editor));
  const projection = field.projection;
  if (projection.representationId !== "oklab") throw new Error("Expected an OKLab projection");
  const directRange = editOperationDefinitions["oklab-disc-coordinate"].directRange;
  const coordinates = {
    a: { range: directRange(projection, "a") },
    b: { range: directRange(projection, "b") },
  };
  const guides = resolveRequestedGuides(created.value, editor, [
    "display-p3-boundary",
    "srgb-boundary",
  ]);
  return { channels, coordinates, guides };
}

/** Independent oracle: exact analysis of the real color, not the sampled contour. */
function insideSrgb(l: number, a: number, b: number): boolean {
  const created = createColorValue({ space: "oklab", channels: [l, a, b], alpha: 1 });
  if (!created.ok) throw new Error("Invalid probe");
  const result = analyzeRequestedGamuts(created.value, ["srgb-gamut"])[0]!.result;
  return result.ok && result.value.status !== "outside";
}

describe("OKLab a/b gamut intervals", () => {
  it.each([
    [0.68, -0.05, 0.1],
    [0.45, 0.06, -0.12],
    [0.85, 0.02, 0.03],
  ] as const)("L=%s a=%s b=%s ends where exact sRGB membership ends", (l, a, b) => {
    const { channels, coordinates, guides } = setup([l, a, b]);
    const intervals = oklabCoordinateIntervals(guides, channels, coordinates);
    for (const coordinate of ["a", "b"] as const) {
      const range = coordinates[coordinate].range!;
      const srgb = intervals[coordinate].filter((interval) => interval.tone === "srgb");
      expect(srgb).toHaveLength(1);
      const { start, end } = srgb[0]!;
      const at = (fraction: number) => range.min + fraction * (range.max - range.min);
      const probe = (value: number) =>
        coordinate === "a" ? insideSrgb(l, value, b) : insideSrgb(l, a, value);
      const margin = 0.01;
      expect(probe(at(start) + margin)).toBe(true);
      expect(probe(at(start) - margin)).toBe(false);
      expect(probe(at(end) - margin)).toBe(true);
      expect(probe(at(end) + margin)).toBe(false);
    }
  });

  it("keeps the sRGB interval inside the wider Display P3 interval", () => {
    const { channels, coordinates, guides } = setup([0.68, -0.05, 0.1]);
    const intervals = oklabCoordinateIntervals(guides, channels, coordinates);
    for (const coordinate of ["a", "b"] as const) {
      const [srgb] = intervals[coordinate].filter((interval) => interval.tone === "srgb");
      const [p3] = intervals[coordinate].filter((interval) => interval.tone === "display-p3");
      expect(p3!.start).toBeLessThan(srgb!.start);
      expect(p3!.end).toBeGreaterThan(srgb!.end);
    }
  });

  it("reports nothing along a when the fixed b lies beyond the gamut at this lightness", () => {
    const { channels, coordinates, guides } = setup([0.68, 0, 0.35]);
    expect(oklabCoordinateIntervals(guides, channels, coordinates).a).toEqual([]);
  });

  it("is exposed on the guide display only when OKLab detail is supplied", () => {
    const created = createColorValue({ space: "oklab", channels: [0.68, -0.05, 0.1], alpha: 1 });
    if (!created.ok) throw new Error("Invalid fixture");
    const observation = represent(created.value, "oklab");
    const field = resolveField(created.value, editor);
    const guides = resolveRequestedGuides(created.value, editor, [
      "display-p3-boundary",
      "srgb-boundary",
    ]);
    const visual = generalizedEditableDetail(created.value, observation, editor, field);
    const display = generalizedGuideDisplay(guides, visual);
    expect(display.oklabIntervals.a.length).toBeGreaterThan(0);
    expect(display.oklabIntervals.b.length).toBeGreaterThan(0);
    expect(generalizedGuideDisplay(guides).oklabIntervals).toEqual({ a: [], b: [] });
    expect(generalizedGuideDisplay(guides, { kind: "unavailable" }).oklabIntervals).toEqual({
      a: [],
      b: [],
    });
  });

  it("reports nothing without guides, a direct range or an observed coordinate", () => {
    const { channels, coordinates, guides } = setup([0.68, -0.05, 0.1]);
    const none = { a: [], b: [] };
    expect(oklabCoordinateIntervals([], channels, coordinates)).toEqual(none);
    expect(
      oklabCoordinateIntervals(guides, channels, { a: { range: null }, b: { range: null } }),
    ).toEqual(none);
    expect(oklabCoordinateIntervals(guides, [0.68, null, null], coordinates)).toEqual(none);
  });
});

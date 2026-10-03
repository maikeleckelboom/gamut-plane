import { describe, expect, it } from "vitest";
import { createColorValue, definitionOf, represent } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
} from "../src/capabilities/index.js";
import { currentField } from "../src/current/field.js";
import { referenceDisplay } from "../src/current/referenceDisplay.js";
import { nearestRgbBoundary } from "../src/rgbReference.js";
import type { RgbContour } from "../src/rgbGuides.js";

function color(space: "srgb" | "display-p3", channels: readonly [number, number, number]) {
  const result = createColorValue({ space, channels, alpha: 0.37 });
  if (!result.ok) throw Error("fixture");
  return result.value;
}
const bindings = [
  ["srgb-rg", "srgb", 0, 1, 2],
  ["srgb-rb", "srgb", 0, 2, 1],
  ["srgb-gb", "srgb", 1, 2, 0],
  ["display-p3-rg", "display-p3", 0, 1, 2],
  ["display-p3-rb", "display-p3", 0, 2, 1],
  ["display-p3-gb", "display-p3", 1, 2, 0],
] as const;

describe("RGB slice Reference", () => {
  it.each([
    ["srgb", "srgb-rg", [1.2, 0.4, 0.5], { x: 1, y: 0.6 }],
    ["srgb", "srgb-rg", [0.4, 0.4, -0.1], null],
    ["display-p3", "display-p3-rg", [0.8, 0, 0], { x: 0, y: 1 }],
    ["display-p3", "display-p3-rb", [0.8, 1, 0.5], { x: 1, y: 0.5 }],
  ] as const)(
    "preserves extended origins and empty/point/line slices: %s %s %j",
    (space, id, channels, expected) => {
      const source = color(space, channels);
      const editor = resolveEditorVisualSupport(id);
      const field = currentField(editor, resolveField(source, editor));
      const guides = resolveRequestedGuides(source, editor, ["srgb-boundary"]);
      const checks = analyzeRequestedGamuts(source, ["srgb-gamut"]);
      const result = referenceDisplay("srgb-gamut", guides, field, checks)!;
      expect(result.showExcursion).toBe(true);
      if (expected === null) expect(result.spatial.kind).toBe("unavailable");
      else {
        if (result.spatial.kind !== "available") throw Error("endpoint");
        expect(result.spatial.point.x).toBeCloseTo(expected.x, 10);
        expect(result.spatial.point.y).toBeCloseTo(expected.y, 10);
      }
      expect(definitionOf(source).channels).toEqual(channels);
    },
  );

  it.each(bindings)(
    "%s uses the nearest visible contour with the actual fixed channel",
    (id, space, x, y, fixed) => {
      const source = color(space, [0.130072, 0.831742, 0.510769]);
      const before = definitionOf(source);
      const editor = resolveEditorVisualSupport(id);
      const field = currentField(editor, resolveField(source, editor));
      const guides = resolveRequestedGuides(source, editor, [
        "srgb-boundary",
        "display-p3-boundary",
      ]);
      const checks = analyzeRequestedGamuts(source, ["srgb-gamut", "display-p3-gamut"]);
      for (const target of ["srgb", "display-p3"] as const) {
        const result = referenceDisplay(`${target}-gamut`, guides, field, checks)!;
        expect(result.kind).toBe("rgb");
        expect(result.sampled).toBeNull();
        const row = guides.find((row) => row.guideId === `${target}-boundary`)!;
        if (
          row.kind !== "resolved" ||
          row.forms.kind !== "rgb" ||
          row.forms.contour.kind !== "available"
        )
          throw Error("contour");
        if (result.spatial.kind !== "available") {
          // A wider target can enclose the entire editor; offscreen boundaries aren't invented.
          expect(space).toBe("srgb");
          expect(target).toBe("display-p3");
          continue;
        }
        const { point, markerCss } = result.spatial;
        const native: [number, number, number] = [0, 0, 0];
        native[x] = point.x;
        native[y] = 1 - point.y;
        native[fixed] = before.channels[fixed]!;
        expect(markerCss).toBe(`color(${space} ${native.join(" ")})`);
        const converted = represent(color(space, native), target);
        if (!converted.ok) throw Error("oracle");
        // Full encoded conversion is independent of the contour intersection solver.
        expect(converted.value.channels.every((v) => v >= -0.0001 && v <= 1.0001)).toBe(true);
        expect(
          Math.min(...converted.value.channels.flatMap((v) => [Math.abs(v), Math.abs(v - 1)])),
        ).toBeLessThan(0.0001);
        const distance = Math.hypot(
          point.x - field.projection.point.x,
          point.y - field.projection.point.y,
        );
        const points = row.forms.contour.value.points;
        for (let i = 0; i < points.length; i += 2) {
          const px = points[i]!,
            py = points[i + 1]!;
          if (px >= 0 && px <= 1 && py >= 0 && py <= 1)
            expect(distance).toBeLessThanOrEqual(
              Math.hypot(px - field.projection.point.x, py - field.projection.point.y) + 1e-12,
            );
        }
        expect(referenceDisplay(`${target}-gamut`, guides, field, [])?.showExcursion).toBe(false);
      }
      expect(definitionOf(source)).toEqual(before);
      expect(referenceDisplay(null, guides, field, checks)).toBeNull();
      expect(referenceDisplay("srgb-gamut", [], field, checks)).toBeNull();
    },
  );

  it.each([
    [0.130072, 0.831742, 0.510769],
    [0.134845, 0.756961, 0.510769],
  ] as const)("connects the reported outside-sRGB color %j", (r, g, b) => {
    const source = color("display-p3", [r, g, b]);
    const editor = resolveEditorVisualSupport("display-p3-rg");
    const field = currentField(editor, resolveField(source, editor));
    const guides = resolveRequestedGuides(source, editor, ["srgb-boundary"]);
    const checks = analyzeRequestedGamuts(source, ["srgb-gamut"]);
    const result = referenceDisplay("srgb-gamut", guides, field, checks)!;
    expect(result.showExcursion).toBe(true);
    expect(result.spatial.kind).toBe("available");
    const row = guides[0]!;
    if (row.kind !== "resolved" || row.forms.kind !== "rgb") throw Error("fixture");
    const noPerceptualSample = [
      {
        ...row,
        forms: {
          ...row.forms,
          reference: { kind: "value-unavailable" as const, reason: "numerical-failure" as const },
        },
      },
    ];
    expect(referenceDisplay("srgb-gamut", noPerceptualSample, field, checks)).toEqual(result);
    const failedContour = [
      {
        ...row,
        forms: {
          ...row.forms,
          contour: { kind: "value-unavailable" as const, reason: "approximation-budget" as const },
        },
      },
    ];
    expect(referenceDisplay("srgb-gamut", failedContour, field, checks)).toMatchObject({
      showExcursion: true,
      spatial: { kind: "unavailable" },
    });
    expect(referenceDisplay("srgb-gamut", guides, null, checks)?.spatial.kind).toBe("unavailable");
  });
});

function contour(points: number[], closed = false): RgbContour {
  return {
    points: new Float64Array(points),
    closed,
    coverage: "partial",
    dimension: "line",
    nominalDimension: "line",
    errorBound: 0,
  };
}
describe("nearest visible contour geometry", () => {
  it("projects onto segment interiors, clips genuine segments, and does not close an open contour", () => {
    expect(nearestRgbBoundary(contour([-1, 0.5, 2, 0.5]), { x: 0.3, y: 0.2 })).toEqual({
      x: expect.closeTo(0.3, 12),
      y: 0.5,
    });
    expect(nearestRgbBoundary(contour([0, 0, 0, 1, 1, 1]), { x: 0.8, y: 0.1 })).toEqual({
      x: 0,
      y: 0.1,
    });
    expect(
      nearestRgbBoundary(contour([-1, -1, 2, -1, 2, 2, -1, 2], true), { x: 0.5, y: 0.5 }),
    ).toBeNull();
  });
  it("retains point/empty slices, deterministic ties, and extended authored origins", () => {
    expect(
      nearestRgbBoundary(contour([0, 0, 0, 1, 1, 1, 1, 0], true), { x: 1e308, y: 0.4 }),
    ).toEqual({ x: 1, y: expect.closeTo(0.4, 12) });
    expect(nearestRgbBoundary(contour([0, 0, 0, 1, 1, 1, 1, 0], true), { x: 0.5, y: 0.5 })).toEqual(
      { x: 0, y: 0.5 },
    );
    expect(nearestRgbBoundary(contour([0, 0, 0, 1, 1, 1], true), { x: 0.8, y: 0.2 })).toEqual({
      x: expect.closeTo(0.5, 12),
      y: expect.closeTo(0.5, 12),
    });
    expect(nearestRgbBoundary(contour([]), { x: 0.5, y: 0.5 })).toBeNull();
    expect(nearestRgbBoundary(contour([0, 1]), { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 1 });
    expect(nearestRgbBoundary(contour([-0.1, 1]), { x: 0.5, y: 0.5 })).toBeNull();
    expect(nearestRgbBoundary(contour([0, 0, 1, 0]), { x: 1e308, y: 0.5 })).toEqual({ x: 1, y: 0 });
    expect(nearestRgbBoundary(contour([0, 0, 1, 0]), { x: NaN, y: 0.5 })).toBeNull();
    expect(nearestRgbBoundary(contour([0, 0, Infinity, 0]), { x: 0, y: 0 })).toBeNull();
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import * as core from "@gamut-plane/core";
import {
  geometryDefinitions,
  convertLinearRgb,
  encodeRgbCoordinate,
} from "@gamut-plane/core/internal/capabilities";
import {
  rgbGamutSlice,
  rgbChannelInterval,
  RGB_CURVE_ERROR,
  RGB_CURVE_MAX_POINTS,
  type RgbGeometry,
} from "../src/rgbGuides.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import { resolveEditorVisualSupport } from "../src/capabilities/editorResolution.js";
import { generalizedGuideDisplay } from "../src/current/generalizedDisplay.js";
import { geometryToSvgPath } from "../src/geometry.js";

vi.mock("@gamut-plane/core", async (original) => {
  const actual = await original<typeof core>();
  return {
    ...actual,
    represent: vi.fn(actual.represent),
    analyzeGamut: vi.fn(actual.analyzeGamut),
    getPickerGuide: vi.fn(actual.getPickerGuide),
  };
});
afterEach(() => vi.restoreAllMocks());
const bindings = [
  ["srgb-rg", "srgb", 0, 1, 2],
  ["srgb-rb", "srgb", 0, 2, 1],
  ["srgb-gb", "srgb", 1, 2, 0],
  ["display-p3-rg", "display-p3", 0, 1, 2],
  ["display-p3-rb", "display-p3", 0, 2, 1],
  ["display-p3-gb", "display-p3", 1, 2, 0],
] as const;
function color(space: "srgb" | "display-p3", channels: readonly [number, number, number]) {
  const result = core.createColorValue({ space, channels, alpha: 0.37 });
  if (!result.ok) throw Error("fixture");
  return result.value;
}
function slice(geometry: RgbGeometry, target: "srgb" | "display-p3", fixed: number) {
  const result = rgbGamutSlice(geometry, target, fixed);
  if (result.kind !== "available") throw Error(result.reason);
  return result.value;
}
function observed(
  space: "srgb" | "display-p3",
  target: "srgb" | "display-p3",
  channels: readonly [number, number, number],
) {
  // Independent oracle: core's full encoded conversion, not the slice's linear cube/edge solver.
  const result = core.represent(color(space, channels), target);
  if (!result.ok) throw Error("oracle conversion");
  return result.value.channels;
}
const inside = (v: readonly number[]) => v.every((c) => c >= -1e-9 && c <= 1 + 1e-9);

describe("analytic native RGB slices", () => {
  it.each(bindings)(
    "%s preserves full, empty, deterministic and true cross-gamut boundaries",
    (editor, space, x, y, f) => {
      const geometry = geometryDefinitions[`${editor}-rectangle`];
      for (const fixed of [0, 0.04045, 0.5, 1]) {
        const result = slice(geometry, space, fixed);
        expect(result).toMatchObject({
          coverage: "full",
          dimension: "area",
          nominalDimension: "area",
          closed: true,
        });
        expect([...result.points].every((v) => v >= 0 && v <= 1)).toBe(true);
      }
      for (const fixed of [-Number.MAX_VALUE, -0.01, 1.01, Number.MAX_VALUE]) {
        expect(slice(geometry, space, fixed)).toMatchObject({
          coverage: "empty",
          dimension: "empty",
          closed: false,
        });
        expect(geometryToSvgPath(slice(geometry, space, fixed).points, true)).toBe("");
      }
      for (const target of ["srgb", "display-p3"] as const)
        for (const fixed of [-0.04, 0, 0.04045, 0.5, 1, 1.01]) {
          const result = slice(geometry, target, fixed);
          expect(result).toEqual(slice(geometry, target, fixed));
          expect(result.points.every(Number.isFinite)).toBe(true);
          expect(result.points.length / 2).toBeLessThanOrEqual(RGB_CURVE_MAX_POINTS);
          for (let i = 0; i < result.points.length; i += 2) {
            const native: [number, number, number] = [0, 0, 0];
            native[x] = result.points[i]!;
            native[y] = 1 - result.points[i + 1]!;
            native[f] = fixed;
            const converted = observed(space, target, native);
            // Rounded sRGB transfer junctions are not exact inverses (about 3e-8 encoded).
            expect(converted.every((v) => v >= -5e-8 && v <= 1 + 5e-8)).toBe(true);
            expect(
              Math.min(...converted.flatMap((v) => [Math.abs(v), Math.abs(v - 1)])),
            ).toBeLessThan(5e-8);
          }
          // A reproducible interior lattice independently disproves false full/empty declarations.
          for (const a of [0.13, 0.37, 0.71, 0.89])
            for (const b of [0.11, 0.43, 0.67, 0.93]) {
              const native: [number, number, number] = [0, 0, 0];
              native[x] = a;
              native[y] = b;
              native[f] = fixed;
              const membership = inside(observed(space, target, native));
              if (result.coverage === "full") expect(membership).toBe(true);
              if (result.coverage === "empty") expect(membership).toBe(false);
            }
        }
      const target = space === "srgb" ? "display-p3" : "srgb";
      expect(slice(geometry, target, 0.5).coverage).toBe(space === "srgb" ? "full" : "partial");
    },
  );

  it("keeps a nonempty off-square slice, and full coverage with true off-square boundaries", () => {
    const geometry = geometryDefinitions["srgb-rg-rectangle"];
    const extended = slice(geometry, "display-p3", -0.1);
    expect(extended.dimension).toBe("area");
    expect(extended.coverage).toBe("partial");
    const full = slice(geometry, "display-p3", 0.5);
    expect(full.coverage).toBe("full");
    expect([...full.points].some((v) => v < 0 || v > 1)).toBe(true);
    // A plane beyond sRGB's maximum is nonempty in P3 but cannot intersect the nominal square.
    const off = slice(geometryDefinitions["srgb-gb-rectangle"], "display-p3", 1.09);
    expect(off.dimension).toBe("area");
    expect(off.coverage).toBe("empty");
    expect(off.points.length).toBeGreaterThan(0);
  });

  it("retains tangent point/line geometry at transformed-cube extrema", () => {
    // P3 red in sRGB has the largest R; at that R, the third primary is free (R matrix B=0).
    const vertices = Array.from({ length: 8 }, (_, i) =>
      convertLinearRgb([i & 1, (i >> 1) & 1, (i >> 2) & 1], "display-p3", "srgb"),
    );
    for (const [editor, axis] of [
      ["srgb-rg", 2],
      ["srgb-gb", 0],
    ] as const) {
      const minimum = Math.min(...vertices.map((v) => v[axis]));
      const result = slice(
        geometryDefinitions[`${editor}-rectangle`],
        "display-p3",
        encodeRgbCoordinate(minimum),
      );
      expect(["point", "line"]).toContain(result.dimension);
      expect(result.closed).toBe(false);
      expect(result.points.length).toBeGreaterThan(0);
      expect(geometryToSvgPath(result.points, result.closed)).not.toContain("Z");
    }
  });

  it("bounds chord error through both transfer junctions and negative extended coordinates", () => {
    const result = slice(geometryDefinitions["srgb-rg-rectangle"], "display-p3", 0.2);
    expect(result.points.length).toBeGreaterThan(20);
    // Reconstruct each emitted segment in native linear space through independent transfer equations.
    const decode = (v: number) =>
      Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4;
    const encode = (v: number) =>
      Math.abs(v) <= 0.0031308
        ? v * 12.92
        : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055);
    for (let i = 2; i < result.points.length; i += 2) {
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9])
        for (const axis of [0, 1]) {
          const a = axis === 0 ? result.points[i - 2]! : 1 - result.points[i - 1]!;
          const b = axis === 0 ? result.points[i]! : 1 - result.points[i + 1]!;
          const exact = encode(decode(a) * (1 - t) + decode(b) * t);
          expect(Math.abs(exact - (a * (1 - t) + b * t))).toBeLessThanOrEqual(
            RGB_CURVE_ERROR + 1e-7,
          );
        }
    }
  });
  it("distinguishes nonfinite failure and serializes empty and degenerate buffers", () => {
    expect(rgbGamutSlice(geometryDefinitions["srgb-rg-rectangle"], "srgb", NaN)).toEqual({
      kind: "value-unavailable",
      reason: "numerical-failure",
    });
    expect(geometryToSvgPath(new Float32Array(), true)).toBe("");
    expect(geometryToSvgPath(new Float64Array([0.5, 0.5]), false)).toBe(
      "M 500.00 500.00 L 500.00 500.00",
    );
    expect(geometryToSvgPath(new Float64Array([0, 0, 1, 1]), false)).toBe(
      "M 0.00 0.00 L 1000.00 1000.00",
    );
  });
});

describe("native channel intersections and independent forms", () => {
  it("retains a tangent black-only interval along the P3 red primary in sRGB", () => {
    expect(rgbChannelInterval("display-p3", "srgb", [0.8, 0, 0], 0)).toMatchObject({
      kind: "available",
      value: { coverage: "partial", interval: { start: 0, end: 0 } },
    });
  });
  it.each(["srgb", "display-p3"] as const)(
    "%s intervals use actual siblings and the selected encoding",
    (space) => {
      for (const target of ["srgb", "display-p3"] as const)
        for (const axis of [0, 1, 2] as const) {
          for (const channels of [
            [0.4, 0.5, 0.6],
            [-0.02, 0.2, 0.8],
            [1.01, 0.9, 0.7],
          ] as const) {
            const result = rgbChannelInterval(space, target, channels, axis);
            expect(result.kind).toBe("available");
            if (result.kind !== "available") throw Error("interval");
            const interval = result.value.interval;
            for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
              const native: [number, number, number] = [...channels];
              native[axis] = t;
              expect(inside(observed(space, target, native))).toBe(
                interval !== null && t >= interval.start && t <= interval.end,
              );
            }
            if (interval !== null)
              for (const endpoint of [interval.start, interval.end]) {
                const native: [number, number, number] = [...channels];
                native[axis] = endpoint;
                expect(inside(observed(space, target, native))).toBe(true);
                if (endpoint > 1e-6 && endpoint < 1 - 1e-6) {
                  const converted = observed(space, target, native);
                  expect(
                    Math.min(...converted.flatMap((v) => [Math.abs(v), Math.abs(v - 1)])),
                  ).toBeLessThan(1e-8);
                }
              }
          }
          expect(rgbChannelInterval(space, space, [0, 0, 0], axis)).toMatchObject({
            kind: "available",
            value: { coverage: "full", interval: { start: 0, end: 1 } },
          });
          const extreme: [number, number, number] = [0.5, 0.5, 0.5];
          extreme[(axis + 1) % 3] = Number.MAX_VALUE;
          expect(rgbChannelInterval(space, target, extreme, axis)).toMatchObject({
            kind: "available",
            value: { coverage: "empty", interval: null },
          });
        }
    },
  );

  it("RGB slice remains available when OKLCH sampling fails, with no hidden analysis or empty-request work", () => {
    const source = color("srgb", [Number.MAX_VALUE, 0.5, 0.5]);
    const before = core.snapshotColor(source);
    const editor = resolveEditorVisualSupport("srgb-rg");
    vi.clearAllMocks();
    expect(resolveRequestedGuides(source, editor, [])).toEqual([]);
    expect(core.represent).not.toHaveBeenCalled();
    expect(core.getPickerGuide).not.toHaveBeenCalled();
    const rows = resolveRequestedGuides(source, editor, ["srgb-boundary"]);
    expect(rows[0]).toMatchObject({
      kind: "resolved",
      forms: {
        kind: "rgb",
        contour: { kind: "available", value: { coverage: "full" } },
        reference: { kind: "value-unavailable", reason: "observation-failed" },
      },
    });
    expect(core.analyzeGamut).not.toHaveBeenCalled();
    expect(core.snapshotColor(source)).toEqual(before);
  });

  it.each(bindings)("%s wires Red, Green and Blue independently of Area", (id, space) => {
    const rows = resolveRequestedGuides(
      color(space, [0.2, 0.4, 0.6]),
      resolveEditorVisualSupport(id),
      ["srgb-boundary", "display-p3-boundary"],
    );
    const display = generalizedGuideDisplay(rows);
    for (const row of rows) {
      if (row.kind !== "resolved" || row.forms.kind !== "rgb") throw Error("forms");
      for (const c of ["r", "g", "b"] as const)
        expect(row.forms.channels[c].channelId).toBe(`${space}.${c}`);
    }
    for (const [c, axis] of [
      ["r", 0],
      ["g", 1],
      ["b", 2],
    ] as const)
      for (const [target, tone] of [
        ["srgb", "srgb"],
        ["display-p3", "display-p3"],
      ] as const) {
        const result = rgbChannelInterval(space, target, [0.2, 0.4, 0.6], axis);
        if (result.kind !== "available") throw Error("interval");
        expect(display.rgbIntervals[c].filter((v) => v.tone === tone)).toEqual(
          result.value.interval ? [{ ...result.value.interval, tone }] : [],
        );
      }
  });
});

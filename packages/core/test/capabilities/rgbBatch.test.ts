import { describe, expect, it } from "vitest";
import {
  linearRgbToOklabBatch,
  MAX_RGB_BATCH_POINTS,
} from "../../src/capabilities/rgbConversion.js";

// Independently transcribed W3C CSS Color 4 section 19 (9 October 2026).
// https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code
// Test-only XYZ route: not texel's fused linear-RGB/LMS conversion route.
const rgbToXyz = {
  srgb: [
    [506752 / 1228815, 87881 / 245763, 12673 / 70218],
    [87098 / 409605, 175762 / 245763, 12673 / 175545],
    [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
  ],
  "display-p3": [
    [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
    [35783 / 156275, 247089 / 357200, 198249 / 2500400],
    [0, 32229 / 714400, 5220557 / 5000800],
  ],
};
const xyzToLms = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const lmsToLab = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const multiply = (matrix: number[][], vector: number[]) =>
  matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i]!, 0));
const fixtures = [
  [0, 0, 0],
  [1, 1, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, 0, 1],
  [0, 1, 1],
  [0.125, 0.125, 0.125],
  [1e-15, 0, 1e-12],
  [0, 0.0001, 0.9],
  [0.4, 1, 0.01],
  [-0.1, 0.4, 1.2],
  [-1, -1, -1],
  [8, 8, 8],
  [0.7, 0.2, -0.3],
];

describe("core numeric RGB bridge", () => {
  it.each(["srgb", "display-p3"] as const)(
    "agrees with independent CSS XYZ reference anchors for %s",
    (space) => {
      const input = new Float64Array(fixtures.flat());
      const copy = input.slice();
      const result = linearRgbToOklabBatch(input, space);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(input).toEqual(copy);
      fixtures.forEach((rgb, index) => {
        const expected = multiply(
          lmsToLab,
          multiply(xyzToLms, multiply(rgbToXyz[space], rgb)).map(Math.cbrt),
        );
        expected.forEach((value, axis) =>
          expect(Math.abs(result.value[index * 3 + axis]! - value)).toBeLessThan(2e-12),
        );
      });
      // Published rounded Ottosson sRGB-red anchor, independently recognizable.
      if (space === "srgb") {
        expect(result.value[6]).toBeCloseTo(0.6279554, 6);
        expect(result.value[7]).toBeCloseTo(0.2248631, 6);
        expect(result.value[8]).toBeCloseTo(0.1258463, 6);
      }
      expect(result.value[42]).toBeCloseTo(2, 12); // extended neutral, not clipped to white
      expect(result.value[39]).toBeCloseTo(-1, 12);
    },
  );
  it("validates inputs and bounds allocations before converting", () => {
    expect(linearRgbToOklabBatch(new Float64Array(0), "srgb")).toEqual({
      ok: true,
      value: new Float64Array(0),
    });
    expect(linearRgbToOklabBatch(new Float64Array(2), "srgb")).toMatchObject({
      ok: false,
      error: { code: "invalid-buffer" },
    });
    // @ts-expect-error runtime caller validation
    expect(linearRgbToOklabBatch([0, 0, 0], "srgb")).toMatchObject({
      ok: false,
      error: { code: "invalid-buffer" },
    });
    // @ts-expect-error runtime caller validation
    expect(linearRgbToOklabBatch(new Float64Array(3), "rec2020")).toMatchObject({
      ok: false,
      error: { code: "invalid-space" },
    });
    for (const invalid of [NaN, Infinity, -Infinity])
      expect(linearRgbToOklabBatch(new Float64Array([0, invalid, 0]), "srgb")).toMatchObject({
        ok: false,
        error: { code: "non-finite-input" },
      });
    expect(
      linearRgbToOklabBatch(new Float64Array(3 * (MAX_RGB_BATCH_POINTS + 1)), "srgb"),
    ).toMatchObject({ ok: false, error: { code: "resource-budget" } });
    expect(
      linearRgbToOklabBatch(
        new Float64Array([Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE]),
        "srgb",
      ),
    ).toMatchObject({ ok: false, error: { code: "numerical-range" } });
  });
});

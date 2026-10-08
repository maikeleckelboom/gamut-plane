import * as texel from "@texel/color";
import { describe, expect, it } from "vitest";
import {
  OKLAB_TO_LMS_PRIME,
  gamutRayCrossings,
  gamutRayIntervals,
} from "../src/gamut/boundaryTrace.js";
import type { DisplayGamut } from "../src/index.js";

const linear = { srgb: texel.sRGBLinear, "display-p3": texel.DisplayP3Linear } as const;

/** Independent oracle: texel's own conversion and exact [0, 1] membership, scanned then bisected. */
function oracleCrossings(l: number, h: number, gamut: DisplayGamut, step = 0.001): number[] {
  const rgb = [0, 0, 0];
  const inside = (c: number) => {
    texel.convert([l, c, h], texel.OKLCH, linear[gamut], rgb);
    return texel.isRGBInGamut(rgb, 0);
  };
  const found: number[] = [];
  let previous = inside(0);
  for (let c = step; c <= 0.5; c += step) {
    const now = inside(c);
    if (now === previous) continue;
    let low = c - step;
    let high = c;
    for (let iteration = 0; iteration < 52; iteration += 1) {
      const middle = (low + high) / 2;
      if (inside(middle) === previous) low = middle;
      else high = middle;
    }
    found.push((low + high) / 2);
    previous = now;
  }
  return found;
}

describe("numerical perceptual gamut crossings", () => {
  it("distinguishes an empty extended-lightness slice from the black and white gray points", () => {
    for (const gamut of ["srgb", "display-p3"] as const) {
      for (const l of [-0.1, 1.1]) expect(gamutRayIntervals(l, 264, gamut)).toEqual([]);
      for (const l of [0, 1])
        expect(gamutRayIntervals(l, 264, gamut)).toEqual([{ start: 0, end: 0 }]);
    }
  });
  it("uses texel's OKLab to LMS' matrix", () => {
    const runtime = (texel as unknown as { OKLab_to_LMS_M: number[][] }).OKLab_to_LMS_M;
    expect(OKLAB_TO_LMS_PRIME).toEqual(runtime);
  });

  it("finds every crossing the oracle finds, including notches", () => {
    for (const [l, h, gamut] of [
      [0.44, 264.1, "srgb"],
      [0.006, 264, "srgb"],
      [0.45, 264.125, "srgb"],
      [0.7, 140, "display-p3"],
      [0.966, 109.5, "srgb"],
    ] as const) {
      const exact = gamutRayCrossings(l, h, gamut);
      const oracle = oracleCrossings(l, h, gamut, 0.0005);
      expect(exact.map((crossing) => crossing.chroma)).toHaveLength(oracle.length);
      exact.forEach((crossing, index) => {
        expect(Math.abs(crossing.chroma - oracle[index]!)).toBeLessThan(1e-9);
        expect(crossing.exit).toBe(index % 2 === 0);
      });
    }
    // The sRGB blue notch: out, back in, out again along one ray.
    expect(gamutRayCrossings(0.44, 264.1, "srgb")).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";

import {
  assertOklabColor,
  assertOklchColor,
  isColorInGamut,
  parseCssColor,
  toOklabColor,
  toOklchColor,
  type OklchColor,
} from "../src/index";

describe("neutral color domain", () => {
  it("roundtrips OKLCH through the typed OKLab model while preserving alpha", () => {
    const original: OklchColor = { l: 0.63, c: 0.17, h: 248.5, alpha: 0.42 };
    const oklab = toOklabColor(original);
    const roundtrip = toOklchColor(oklab);

    expect(oklab.alpha).toBe(original.alpha);
    expect(roundtrip.l).toBeCloseTo(original.l, 12);
    expect(roundtrip.c).toBeCloseTo(original.c, 12);
    expect(roundtrip.h).toBeCloseTo(original.h, 10);
    expect(roundtrip.alpha).toBe(original.alpha);
  });

  it("rejects non-finite channels in both public color models", () => {
    expect(() => assertOklchColor({ l: 0.5, c: Number.NaN, h: 20, alpha: 1 })).toThrow(/finite/);
    expect(() => assertOklabColor({ l: 0.5, a: 0, b: Number.POSITIVE_INFINITY, alpha: 1 })).toThrow(
      /finite/,
    );
  });

  it("keeps sRGB and Display P3 exact membership identities distinct", () => {
    const p3Only = parseCssColor("color(display-p3 1 0.2 0.1)");

    expect(isColorInGamut(p3Only, "display-p3")).toBe(true);
    expect(isColorInGamut(p3Only, "srgb")).toBe(false);
  });

  it("rejects display gamuts outside the standalone scope", () => {
    expect(() => parseCssColor("color(rec2020 0.2 0.3 0.4)")).toThrow(/only srgb and display-p3/);
  });
});

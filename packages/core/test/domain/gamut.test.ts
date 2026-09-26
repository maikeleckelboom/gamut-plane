import { describe, expect, it } from "vitest";
import {
  analyzeGamut,
  createColorValue,
  type ColorRepresentation,
  type GamutId,
} from "../../src/index.js";

function analyze(definition: ColorRepresentation, gamut: GamutId) {
  const created = createColorValue(definition);
  if (!created.ok) throw new Error("fixture failed");
  return analyzeGamut(created.value, gamut);
}

describe("direct target gamut analysis", () => {
  it.each([
    { space: "oklch", channels: [0.5, 0.05, 200], alpha: 0 },
    { space: "oklab", channels: [0.5, 0.01, -0.01], alpha: 0 },
    { space: "srgb", channels: [0.5, 0.5, 0.5], alpha: 0 },
    { space: "display-p3", channels: [0.5, 0.5, 0.5], alpha: 0 },
  ] as ColorRepresentation[])("classifies %o for both direct targets", (definition) => {
    for (const gamut of ["srgb-gamut", "display-p3-gamut"] as const) {
      const result = analyze(definition, gamut);
      expect(result).toMatchObject({
        ok: true,
        value: { gamut, status: "inside", tolerance: 1e-9 },
      });
      if (result.ok) expect(result.value.linearRgb.every(Number.isFinite)).toBe(true);
    }
  });

  it("separates strict, tolerance fringe, and outside without alpha influence", () => {
    const base = { space: "srgb" as const, channels: [-1e-10, 0.5, 0.5] as const, alpha: 0 };
    expect(analyze(base, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "within-tolerance" },
    });
    expect(analyze({ ...base, channels: [1 + 1e-10, 0.5, 0.5] }, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "within-tolerance" },
    });
    expect(analyze({ ...base, channels: [-0.1, 0.5, 0.5] }, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "outside" },
    });
    expect(analyze({ ...base, channels: [0.5, 0.5, 0.5] }, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "inside" },
    });
  });
});

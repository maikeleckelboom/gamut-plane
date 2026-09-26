import { expect, it } from "vitest";
import { analyzeGamut, createColorValue, definitionOf, represent } from "../../src/index.js";

it("retains explicit neutral hue in the definition and returns absent hue for rectangular neutrals", () => {
  const explicit = createColorValue({ space: "oklch", channels: [0.6, 0, 300], alpha: 1 });
  if (!explicit.ok) throw new Error("fixture failed");
  expect(represent(explicit.value, "srgb").ok).toBe(true);
  expect(represent(explicit.value, "oklab")).toMatchObject({
    ok: true,
    value: { channels: [0.6, 0, 0] },
  });
  expect(definitionOf(explicit.value).channels).toEqual([0.6, 0, 300]);
  for (const definition of [
    { space: "oklab", channels: [0.6, 0, 0], alpha: 1 },
    { space: "srgb", channels: [0.4, 0.4, 0.4], alpha: 1 },
    { space: "display-p3", channels: [0.4, 0.4, 0.4], alpha: 1 },
  ] as const) {
    const created = createColorValue(definition);
    if (!created.ok) throw new Error("fixture failed");
    const observed = represent(created.value, "oklch");
    expect(observed.ok).toBe(true);
    if (observed.ok) expect(observed.value.channels.slice(1)).toEqual([0, null]);
  }
});

it("preserves genuinely tiny chroma below the vendor achromatic threshold", () => {
  for (const axes of [
    [1e-7, 0],
    [0, -1e-7],
    [1e-7, 1e-7],
  ] as const) {
    const created = createColorValue({
      space: "oklab",
      channels: [0.6, axes[0], axes[1]],
      alpha: 1,
    });
    if (!created.ok) throw new Error("fixture failed");
    const observed = represent(created.value, "oklch");
    if (!observed.ok) throw new Error("conversion failed");
    expect(observed.value.channels[1]).toBeGreaterThan(0);
    expect(observed.value.channels[1]).toBeCloseTo(Math.hypot(...axes), 16);
    expect(observed.value.channels[2]).not.toBeNull();
  }
});

it("keeps exact black, white, and gray neutral axes exact at gamut boundaries", () => {
  for (const lightness of [0, 0.5, 1]) {
    const created = createColorValue({ space: "oklch", channels: [lightness, 0, null], alpha: 1 });
    if (!created.ok) throw new Error("fixture failed");
    for (const [gamut, space] of [
      ["srgb-gamut", "srgb"],
      ["display-p3-gamut", "display-p3"],
    ] as const) {
      const observed = represent(created.value, space);
      if (!observed.ok) throw new Error("conversion failed");
      expect(observed.value.channels[0]).toBe(observed.value.channels[1]);
      expect(observed.value.channels[1]).toBe(observed.value.channels[2]);
      expect(analyzeGamut(created.value, gamut)).toMatchObject({
        ok: true,
        value: { status: "inside" },
      });
    }
  }
});

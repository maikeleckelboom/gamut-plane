import { describe, expect, it } from "vitest";
import {
  createColorValue,
  definitionOf,
  definingEquals,
  represent,
  type ColorRepresentation,
  type ColorSpaceId,
} from "../../src/index.js";

const definitions: readonly ColorRepresentation[] = [
  { space: "oklch", channels: [0.6, 0.15, 240], alpha: 0.372913 },
  { space: "oklab", channels: [0.6, -0.05, -0.1], alpha: 0.372913 },
  { space: "srgb", channels: [0.2, 0.4, 0.6], alpha: 0.372913 },
  { space: "display-p3", channels: [0.2, 0.4, 0.6], alpha: 0.372913 },
];
const spaces: readonly ColorSpaceId[] = ["oklch", "oklab", "srgb", "display-p3"];

describe("representation observations", () => {
  it.each(definitions.flatMap((definition) => spaces.map((space) => [definition, space] as const)))(
    "%o → %s returns finite frozen coordinates without changing authority",
    (definition, space) => {
      const created = createColorValue(definition);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const observed = represent(created.value, space);
      expect(observed.ok).toBe(true);
      if (!observed.ok) return;
      expect(observed.value.space).toBe(space);
      expect(observed.value.alpha).toBe(definition.alpha);
      expect(
        observed.value.channels.every(
          (component) => component === null || Number.isFinite(component),
        ),
      ).toBe(true);
      expect(Object.isFrozen(observed.value.channels)).toBe(true);
      expect(Object.isFrozen(observed.value)).toBe(true);
      const recreated = createColorValue(definitionOf(created.value));
      expect(recreated.ok).toBe(true);
      if (recreated.ok) expect(definingEquals(created.value, recreated.value)).toBe(true);
      if (space === definition.space) {
        definition.channels.forEach((component, index) =>
          expect(Object.is(observed.value.channels[index], component)).toBe(true),
        );
      }
    },
  );

  it("preserves extended coordinates and reports finite-conversion failure", () => {
    const extended = createColorValue({ space: "srgb", channels: [-0.2, 0.5, 1.1], alpha: 1 });
    if (!extended.ok) throw new Error("fixture failed");
    expect(represent(extended.value, "srgb")).toMatchObject({
      ok: true,
      value: { channels: [-0.2, 0.5, 1.1] },
    });
    const huge = createColorValue({ space: "oklab", channels: [1e308, 1e308, 1e308], alpha: 1 });
    if (!huge.ok) throw new Error("fixture failed");
    expect(represent(huge.value, "srgb")).toMatchObject({
      ok: false,
      error: { code: "numerical-range" },
    });
  });

  it("matches an independent published OKLab reference for sRGB red", () => {
    const red = createColorValue({ space: "srgb", channels: [1, 0, 0], alpha: 1 });
    if (!red.ok) throw new Error("fixture failed");
    const lab = represent(red.value, "oklab");
    if (!lab.ok) throw new Error("conversion failed");
    const reference = [0.62795536, 0.22486306, 0.1258463];
    lab.value.channels.forEach((component, index) =>
      expect(component).toBeCloseTo(reference[index]!, 6),
    );
    const p3 = createColorValue({ space: "display-p3", channels: [1, 0, 0], alpha: 1 });
    if (!p3.ok) throw new Error("fixture failed");
    const srgb = represent(p3.value, "srgb");
    if (!srgb.ok) throw new Error("conversion failed");
    expect(srgb.value.channels[0]).toBeGreaterThan(1);
    expect(srgb.value.channels[1]).toBeLessThan(0);
    expect(srgb.value.channels[2]).toBeLessThan(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  createColorValue,
  definitionOf,
  definingEquals,
  isColorValue,
  type ColorRepresentation,
} from "../../src/index.js";

function create(definition: ColorRepresentation) {
  const result = createColorValue(definition);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture failed");
  return result.value;
}

describe("defining ColorValue", () => {
  it("copies and freezes all stored data without normalizing coordinates", () => {
    const channels: [number, number, number] = [-0.2, 0.5, 1.1];
    const value = create({ space: "srgb", channels, alpha: -0 });
    channels[0] = 0;
    expect(definitionOf(value).channels).toEqual([-0.2, 0.5, 1.1]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(definitionOf(value))).toBe(true);
    expect(Object.isFrozen(definitionOf(value).channels)).toBe(true);
    expect(Object.is(definitionOf(value).alpha, -0)).toBe(true);
    expect(isColorValue(value)).toBe(true);
    expect(
      isColorValue({
        kind: "gamut-plane/color-value",
        version: 1,
        definition: definitionOf(value),
      }),
    ).toBe(false);
    expect(
      isColorValue(
        Object.freeze({
          kind: "gamut-plane/color-value",
          version: 1,
          definition: definitionOf(value),
        }),
      ),
    ).toBe(true);
  });

  it("accepts extended finite coordinates and rejects invalid tuples", () => {
    const hole = [0, 0, 0];
    delete hole[1];
    for (const definition of [
      { space: "display-p3", channels: [1.2, -0.1, 0.5], alpha: 1 },
      { space: "oklab", channels: [-0.2, 0.1, -0.4], alpha: 0.5 },
      { space: "oklch", channels: [1.4, 0.2, 720], alpha: 1 },
      { space: "oklch", channels: [0.6, 0, null], alpha: 1 },
    ] as ColorRepresentation[])
      expect(createColorValue(definition).ok).toBe(true);
    for (const definition of [
      { space: "srgb", channels: [0, 0], alpha: 1 },
      { space: "srgb", channels: [0, 0, 0, 0], alpha: 1 },
      { space: "srgb", channels: hole, alpha: 1 },
      { space: "srgb", channels: [0, Number.NaN, 0], alpha: 1 },
      { space: "oklch", channels: [0.6, -0.1, 20], alpha: 1 },
      { space: "oklch", channels: [0.6, 0.1, null], alpha: 1 },
      { space: "oklch", channels: [0.6, 0, Infinity], alpha: 1 },
      { space: "oklab", channels: [0.6, 0, 0], alpha: 1.1 },
    ])
      expect(createColorValue(definition as unknown as ColorRepresentation)).toEqual({
        ok: false,
        error: { code: "invalid-definition" },
      });
  });

  it("compares exact defining coordinates, including signed zero and explicit neutral hue", () => {
    const a = create({ space: "oklch", channels: [0.6, 0, 300], alpha: 1 });
    expect(definingEquals(a, create(definitionOf(a)))).toBe(true);
    expect(definingEquals(a, create({ space: "oklch", channels: [0.6, 0, null], alpha: 1 }))).toBe(
      false,
    );
    expect(definingEquals(a, create({ space: "oklch", channels: [0.6, -0, 300], alpha: 1 }))).toBe(
      false,
    );
    expect(
      definingEquals(
        create({ space: "oklch", channels: [0.6, 0, 0], alpha: 1 }),
        create({ space: "oklch", channels: [0.6, 0, 360], alpha: 1 }),
      ),
    ).toBe(false);
    for (const index of [0, 1, 2]) {
      const positive = [0, 0, 0] as [number, number, number];
      const negative = [0, 0, 0] as [number, number, number];
      negative[index] = -0;
      expect(
        definingEquals(
          create({ space: "oklab", channels: positive, alpha: 1 }),
          create({ space: "oklab", channels: negative, alpha: 1 }),
        ),
      ).toBe(false);
    }
    expect(
      definingEquals(
        create({ space: "srgb", channels: [0, 0, 0], alpha: 0 }),
        create({ space: "srgb", channels: [0, 0, 0], alpha: -0 }),
      ),
    ).toBe(false);
  });
});

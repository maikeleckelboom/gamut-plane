import { describe, expect, it } from "vitest";
import { serializeCss, type ColorRepresentation } from "../../src/index.js";

describe("representation CSS output", () => {
  it.each([
    [{ space: "srgb", channels: [-0.2, 0.5, 1.1], alpha: 1 }, "color(srgb -0.2 0.5 1.1 / 1)"],
    [
      { space: "display-p3", channels: [1.2, -0.1, 0.5], alpha: 0.5 },
      "color(display-p3 1.2 -0.1 0.5 / 0.5)",
    ],
    [{ space: "oklab", channels: [0.6, -0, 0.1], alpha: -0 }, "oklab(0.6 -0 0.1 / -0)"],
    [{ space: "oklch", channels: [0.6, 0, null], alpha: 1 }, "oklch(0.6 0 none / 1)"],
  ] as const)("emits %o without quantization", (definition, text) => {
    expect(
      serializeCss(definition as ColorRepresentation, { policy: "preserve-coordinates" }),
    ).toEqual({ ok: true, value: { text, quantization: "none" } });
  });

  it("requires strict target containment and rejects CSS normalization", () => {
    expect(
      serializeCss(
        { space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 },
        { policy: "require-in-gamut", gamut: "srgb-gamut" },
      ),
    ).toMatchObject({ ok: false, error: { code: "boundary-tolerance" } });
    expect(
      serializeCss(
        { space: "srgb", channels: [-0.2, 0.5, 1.1], alpha: 1 },
        { policy: "require-in-gamut", gamut: "srgb-gamut" },
      ),
    ).toMatchObject({ ok: false, error: { code: "out-of-gamut" } });
    expect(
      serializeCss(
        { space: "oklch", channels: [1.2, 0.1, 20], alpha: 1 },
        { policy: "preserve-coordinates" },
      ),
    ).toMatchObject({ ok: false, error: { code: "requires-css-normalization" } });
    expect(
      serializeCss(
        { space: "oklch", channels: [0.6, 0.1, 720], alpha: 1 },
        { policy: "preserve-coordinates" },
      ),
    ).toMatchObject({ ok: false, error: { code: "requires-css-normalization" } });
  });
});

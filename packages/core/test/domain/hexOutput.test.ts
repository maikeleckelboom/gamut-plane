import { describe, expect, it } from "vitest";
import { serializeHex } from "../../src/index.js";

describe("explicit 8-bit Hex quantization", () => {
  it("round trips every exact byte for each channel", () => {
    for (let byte = 0; byte < 256; byte++) {
      for (let index = 0; index < 3; index++) {
        const channels: [number, number, number] = [0, 0, 0];
        channels[index] = byte / 255;
        const result = serializeHex({ space: "srgb", channels, alpha: 1 }, { alpha: "omit" });
        expect(result.ok).toBe(true);
        if (result.ok)
          expect(result.value.text.slice(1 + index * 2, 3 + index * 2)).toBe(
            byte.toString(16).padStart(2, "0").toUpperCase(),
          );
      }
    }
  });

  it("uses specified half-step rounding and explicit alpha policy", () => {
    expect(
      serializeHex({ space: "srgb", channels: [0.2, 0.4, 0.6], alpha: 1 }, { alpha: "omit" }),
    ).toEqual({ ok: true, value: { text: "#336699", quantization: "rgb8" } });
    expect(
      serializeHex(
        { space: "srgb", channels: [0.5 / 255, 0, 0], alpha: 0.5 },
        { alpha: "include" },
      ),
    ).toEqual({ ok: true, value: { text: "#01000080", quantization: "rgba8" } });
    expect(
      serializeHex({ space: "srgb", channels: [0, 0, 0], alpha: 0.5 }, { alpha: "omit" }),
    ).toMatchObject({ ok: false, error: { code: "alpha-required" } });
    expect(
      serializeHex({ space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 }, { alpha: "omit" }),
    ).toMatchObject({ ok: false, error: { code: "boundary-tolerance" } });
    expect(
      serializeHex({ space: "srgb", channels: [-0.2, 0.5, 1.1], alpha: 1 }, { alpha: "omit" }),
    ).toMatchObject({ ok: false, error: { code: "out-of-gamut" } });
  });
});

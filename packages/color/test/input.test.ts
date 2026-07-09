import { describe, expect, it } from "vitest";

import { parseUserColor, serializeColor } from "../src/index";

describe("strict color input adapter", () => {
  it("converts supported input into canonical OKLCH", () => {
    const color = parseUserColor("color(display-p3 1 0.2 0.1 / 80%)");

    expect(color.l).toBeGreaterThan(0);
    expect(color.c).toBeGreaterThan(0);
    expect(color.h).toBeGreaterThanOrEqual(0);
    expect(color.h).toBeLessThan(360);
    expect(color.alpha).toBeCloseTo(0.8);
  });

  it("supports four-digit hex without relying on the upstream shorthand edge case", () => {
    expect(parseUserColor("#f008").alpha).toBeCloseTo(0x88 / 255);
  });

  it("normalizes percentage RGB channels before the @texel/color adapter", () => {
    const percentage = parseUserColor("rgb(100% 0% 0%)");
    const byte = parseUserColor("rgb(255 0 0)");

    expect(percentage.l).toBeCloseTo(byte.l, 12);
    expect(percentage.c).toBeCloseTo(byte.c, 12);
    expect(percentage.h).toBeCloseTo(byte.h, 12);
  });

  it("rejects names, malformed channels, and out-of-range RGB", () => {
    expect(() => parseUserColor("rebeccapurple")).toThrow(/Supported inputs/);
    expect(() => parseUserColor("rgb(300 0 0)")).toThrow(/between 0 and 255/);
    expect(() => parseUserColor("oklch(50% nope 20)")).toThrow(/unsupported syntax/);
  });

  it("refuses implicit clamping during RGB serialization", () => {
    const color = parseUserColor("color(display-p3 1 0.15 0.05)");

    expect(() => serializeColor(color, "srgb")).toThrow(/explicit fallback/);
  });
});

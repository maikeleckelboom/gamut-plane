import { describe, expect, it } from "vitest";

import { formatOklch, parseCssColor, serializeColor, type OklchColor } from "../src/index";

describe("strict color input adapter", () => {
  it("converts supported input into canonical OKLCH", () => {
    const color = parseCssColor("color(display-p3 1 0.2 0.1 / 80%)");

    expect(color.l).toBeGreaterThan(0);
    expect(color.c).toBeGreaterThan(0);
    expect(color.h).toBeGreaterThanOrEqual(0);
    expect(color.h).toBeLessThan(360);
    expect(color.alpha).toBeCloseTo(0.8);
  });

  it("supports four-digit hex without relying on the upstream shorthand edge case", () => {
    expect(parseCssColor("#f008").alpha).toBeCloseTo(0x88 / 255);
  });

  it("normalizes percentage RGB channels before the @texel/color adapter", () => {
    const percentage = parseCssColor("rgb(100% 0% 0%)");
    const byte = parseCssColor("rgb(255 0 0)");

    expect(percentage.l).toBeCloseTo(byte.l, 12);
    expect(percentage.c).toBeCloseTo(byte.c, 12);
    expect(percentage.h).toBeCloseTo(byte.h, 12);
  });

  it("rejects names, malformed channels, and out-of-range RGB", () => {
    expect(() => parseCssColor("rebeccapurple")).toThrow(/Supported inputs/);
    expect(() => parseCssColor("rgb(300 0 0)")).toThrow(/between 0 and 255/);
    expect(() => parseCssColor("oklch(50% nope 20)")).toThrow(/unsupported syntax/);
  });

  it("refuses implicit clamping during RGB serialization", () => {
    const color = parseCssColor("color(display-p3 1 0.15 0.05)");

    expect(() => serializeColor(color, "srgb")).toThrow(/require clipping/);
  });
});

describe("editable OKLCH formatter", () => {
  it("produces stable fixed-precision output without floating-point noise", () => {
    const noisy: OklchColor = {
      l: 0.673,
      c: 0.078,
      h: 220.3,
      alpha: 1,
    };
    expect(formatOklch(noisy)).toBe("oklch(67.3% 0.0780 220.3)");
    expect(serializeColor(noisy)).not.toBe(formatOklch(noisy));
  });

  it("pads chroma to four decimals and keeps L/H at one decimal", () => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 30, alpha: 1 })).toBe("oklch(50.0% 0.1000 30.0)");
    expect(formatOklch({ l: 1, c: 0, h: 0, alpha: 1 })).toBe("oklch(100.0% 0.0000 0.0)");
  });

  it("omits alpha when opaque and includes four-decimal alpha otherwise", () => {
    expect(formatOklch({ l: 0.62, c: 0.15, h: 200, alpha: 1 })).toBe("oklch(62.0% 0.1500 200.0)");
    expect(formatOklch({ l: 0.62, c: 0.15, h: 200, alpha: 0.5 })).toBe(
      "oklch(62.0% 0.1500 200.0 / 0.5000)",
    );
  });

  it("round-trips through parseCssColor without drift", () => {
    const original: OklchColor = { l: 0.673, c: 0.078, h: 220.3, alpha: 1 };
    const formatted = formatOklch(original);
    const reparsed = parseCssColor(formatted);
    expect(reparsed.l).toBeCloseTo(original.l, 6);
    expect(reparsed.c).toBeCloseTo(original.c, 6);
    expect(reparsed.h).toBeCloseTo(original.h, 6);
    expect(reparsed.alpha).toBe(1);
    expect(formatOklch(reparsed)).toBe(formatted);
  });

  it("is deterministic across repeated calls and rejects invalid colors", () => {
    const color: OklchColor = { l: 0.45, c: 0.23, h: 263, alpha: 0.8 };
    expect(formatOklch(color)).toBe(formatOklch(color));
    expect(() => formatOklch({ l: Number.NaN, c: 0, h: 0, alpha: 1 })).toThrow(/finite/);
  });
});

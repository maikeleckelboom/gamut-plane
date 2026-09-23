import { describe, expect, it } from "vitest";
import { parseCssColor, serializeHexColor } from "../src/index";

describe("public Hex serializer", () => {
  it.each([
    ["#000000", "#000000"],
    ["#ffffff", "#FFFFFF"],
    ["#123456", "#123456"],
    ["#12345680", "#12345680"],
    ["#abc", "#AABBCC"],
    ["#abcd", "#AABBCCDD"],
  ])("normalizes %s through the parser to %s", (input, expected) => {
    expect(serializeHexColor(parseCssColor(input))).toBe(expected);
  });

  it("rounds encoded channels and canonical alpha to the nearest 8-bit value", () => {
    const color = parseCssColor("color(srgb 0.5 0.1 0.9 / 0.5)");
    expect(serializeHexColor(color)).toBe("#801AE680");
  });

  it("retains an alpha byte when non-opaque alpha rounds to FF", () => {
    const color = parseCssColor("#123456");
    expect(serializeHexColor({ ...color, alpha: 0.999 })).toBe("#123456FF");
  });

  it("refuses P3-only colors without mutating them", () => {
    const color = parseCssColor("color(display-p3 1 0.2 0.1)");
    const original = { ...color };
    expect(() => serializeHexColor(color)).toThrow(RangeError);
    expect(color).toEqual(original);
  });
});

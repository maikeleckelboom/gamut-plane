import { describe, expect, it } from "vitest";
import { definitionOf, parseCssValue } from "../../src/index.js";

describe("limited numeric CSS import", () => {
  it.each([
    ["#369", "hex", "srgb", [0x33 / 255, 0x66 / 255, 0x99 / 255], 1],
    ["#369C", "hex", "srgb", [0x33 / 255, 0x66 / 255, 0x99 / 255], 0xcc / 255],
    ["#336699", "hex", "srgb", [0x33 / 255, 0x66 / 255, 0x99 / 255], 1],
    ["#336699CC", "hex", "srgb", [0x33 / 255, 0x66 / 255, 0x99 / 255], 0xcc / 255],
    ["RGB(51 102 153 / 0.5)", "rgb", "srgb", [51 / 255, 102 / 255, 153 / 255], 0.5],
    ["rgba(51 102 153 / 0.5)", "rgb", "srgb", [51 / 255, 102 / 255, 153 / 255], 0.5],
    ["color(srgb -0.2 0.5 1.1)", "color", "srgb", [-0.2, 0.5, 1.1], 1],
    ["color(display-p3 1.2 -0.1 0.5)", "color", "display-p3", [1.2, -0.1, 0.5], 1],
    ["oklab(0.6 0.1 -0.2)", "oklab", "oklab", [0.6, 0.1, -0.2], 1],
    ["oklch(0.6 0.2 300deg / 0.4)", "oklch", "oklch", [0.6, 0.2, 300], 0.4],
    ["oklch(0.6 0 none / 0.4)", "oklch", "oklch", [0.6, 0, null], 0.4],
  ] as const)("parses %s", (text, syntax, space, channels, alpha) => {
    const result = parseCssValue(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toEqual({ kind: "css", originalText: text, syntax });
    expect(definitionOf(result.value.value)).toEqual({ space, channels, alpha });
  });

  it("distinguishes unsupported syntax, missing components, malformed and normalizing literals", () => {
    for (const text of [
      "red",
      "rgb(1, 2, 3)",
      "rgb(50% 0% 0%)",
      "color(rec2020 1 0 0)",
      "calc(1)",
    ]) {
      expect(parseCssValue(text)).toMatchObject({
        ok: false,
        error: { code: "unsupported-syntax" },
      });
    }
    for (const text of [
      "oklab(0.6 none 0)",
      "rgb(none 0 0)",
      "rgb(none, 0, 0)",
      "oklch(0.6 0.2 none)",
    ]) {
      expect(parseCssValue(text)).toMatchObject({
        ok: false,
        error: { code: "unsupported-missing-component" },
      });
    }
    for (const text of ["#xyz", "rgb(1 2)"]) {
      expect(parseCssValue(text)).toMatchObject({ ok: false, error: { code: "invalid-literal" } });
    }
    for (const text of [
      "rgb(256 0 0)",
      "oklab(1.2 0 0)",
      "oklch(0.6 0.2 720)",
      "oklch(0.6 -0.2 20)",
      "rgb(0 0 0 / 2)",
    ]) {
      expect(parseCssValue(text)).toMatchObject({
        ok: false,
        error: { code: "requires-css-normalization" },
      });
    }
  });
});

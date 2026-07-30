import { describe, expect, it } from "vitest";

import {
  CSS_DISPLAY_DECIMALS,
  formatOklchForDisplay,
  formatRgbCssForDisplay,
} from "@/colorPresentation";

describe("CSS presentation formatting", () => {
  it("formats Display P3 channels to stable display precision without trailing zeros", () => {
    expect(
      formatRgbCssForDisplay(
        "color(display-p3 0.31650380404936257 0.5973245576847196 0.9835484146109986)",
      ),
    ).toBe("color(display-p3 0.316504 0.597325 0.983548)");
    expect(CSS_DISPLAY_DECIMALS).toBe(6);
  });

  it.each([
    ["zero", "color(display-p3 0 -0 0.0000001)", "color(display-p3 0 0 0)"],
    ["one", "color(display-p3 1 1.0000001 0.9999999)", "color(display-p3 1 1 1)"],
    [
      "small values",
      "color(display-p3 0.0000044 0.0000404 0.0040004)",
      "color(display-p3 0.000004 0.00004 0.004)",
    ],
    [
      "channel boundaries",
      "color(display-p3 0.0000006 0.9999994 0.5000005)",
      "color(display-p3 0.000001 0.999999 0.5)",
    ],
  ])("handles %s deliberately", (_case, source, expected) => {
    expect(formatRgbCssForDisplay(source)).toBe(expected);
  });

  it("keeps OKLCH display compact and stable, including alpha", () => {
    expect(formatOklchForDisplay({ l: 0.68, c: 0.18, h: 252, alpha: 1 })).toBe(
      "oklch(68% 0.18 252)",
    );
    expect(
      formatOklchForDisplay({ l: 0.000004, c: 0.0000044, h: 359.9999994, alpha: 0.5000004 }),
    ).toBe("oklch(0% 0.000004 359.999999 / 0.5)");
  });

  it("leaves integer sRGB serialization unchanged", () => {
    expect(formatRgbCssForDisplay("rgb(0, 128, 255)")).toBe("rgb(0, 128, 255)");
    expect(formatRgbCssForDisplay("rgba(0, 128, 255, 0.3333333333)")).toBe(
      "rgba(0, 128, 255, 0.333333)",
    );
  });
});

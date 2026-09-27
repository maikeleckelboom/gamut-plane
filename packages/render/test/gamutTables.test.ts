import { describe, expect, it } from "vitest";

import { findMaximumChroma, getPickerGuide } from "@gamut-plane/core";
import { PICKER_GAMUT_TABLE_DIGEST, PICKER_GAMUT_TABLES } from "../src/generated/gamutTables";

describe("bundled picker gamut facts", () => {
  it("loads the generated resolution and stable source digest", () => {
    expect(PICKER_GAMUT_TABLE_DIGEST).toBe(
      "sha256:4c73cef992515b5876e309f7bce90cd418217c7a576f54cfcead380eb416ce15",
    );
    for (const table of Object.values(PICKER_GAMUT_TABLES)) {
      expect(table.hueSteps).toBe(120);
      expect(table.lightnessSteps).toBe(65);
      expect(table.chromaMax).toHaveLength(120 * 65);
    }
  });

  it.each([
    ["srgb", 0.37, 24],
    ["srgb", 0.68, 248],
    ["srgb", 0.86, 310],
    ["display-p3", 0.37, 24],
    ["display-p3", 0.68, 248],
    ["display-p3", 0.86, 310],
  ] as const)("stays close to numerically searched %s Cmax at L %s and H %s", (gamut, l, h) => {
    const table = gamut === "srgb" ? PICKER_GAMUT_TABLES.srgb : PICKER_GAMUT_TABLES.displayP3;
    const guide = getPickerGuide({ l, c: 0, h, alpha: 1 }, table).maximumChroma;
    const searched = findMaximumChroma(l, h, gamut, 24);
    expect(Math.abs(guide - searched)).toBeLessThan(0.006);
  });
});

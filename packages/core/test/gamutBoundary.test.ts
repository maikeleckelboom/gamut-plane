import { describe, expect, it } from "vitest";

import { generateGamutBoundaryTable } from "../src/index";

describe("gamut boundary tables", () => {
  const options = { hueSteps: 12, lightnessSteps: 7, searchIterations: 10 };

  it("is deterministic", () => {
    const first = generateGamutBoundaryTable("srgb", options);
    const second = generateGamutBoundaryTable("srgb", options);

    expect([...second.chromaMax]).toEqual([...first.chromaMax]);
  });

  it("contains only finite, non-negative values", () => {
    const table = generateGamutBoundaryTable("display-p3", options);

    for (const value of table.chromaMax) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

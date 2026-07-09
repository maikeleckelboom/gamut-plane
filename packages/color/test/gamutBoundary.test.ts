import { describe, expect, it } from "vitest";

import {
  clearGamutBoundaryTableCache,
  generateGamutBoundaryTable,
  getCachedGamutBoundaryTable,
  getGamutOutline,
  getMaximumChromaFromTable,
} from "../src/index";

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

  it("supports interpolation-only outline reads", () => {
    const table = generateGamutBoundaryTable("srgb", options);
    const maximum = getMaximumChromaFromTable(table, 0.5, 45);
    const outline = getGamutOutline(table, 0.5);

    expect(maximum).toBeGreaterThan(0);
    expect(outline).toHaveLength(options.hueSteps * 2);
  });

  it("returns stable cached tables and outlines for a selected lightness", () => {
    clearGamutBoundaryTableCache();
    const first = getCachedGamutBoundaryTable("display-p3", options);
    const second = getCachedGamutBoundaryTable("display-p3", { ...options });
    const firstOutline = getGamutOutline(first, 0.62);
    const secondOutline = getGamutOutline(second, 0.62);

    expect(second).toBe(first);
    expect([...secondOutline]).toEqual([...firstOutline]);
    expect(firstOutline).toHaveLength(options.hueSteps * 2);

    clearGamutBoundaryTableCache();
    const regenerated = getCachedGamutBoundaryTable("display-p3", options);
    expect(regenerated).not.toBe(first);
    expect([...regenerated.chromaMax]).toEqual([...first.chromaMax]);
    clearGamutBoundaryTableCache();
  });
});

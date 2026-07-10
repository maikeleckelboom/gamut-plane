import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  OKLCH_PICKER_MAX_CHROMA,
  buildLightnessChromaBoundaryPath,
  clampPlanePointToInstrumentBounds,
  clearGamutBoundaryTableCache,
  getCachedGamutBoundaryTable,
  getChromaSliderMarkers,
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getMaximumChromaFromTable,
  getPickerGamutStatus,
  isColorInGamut,
  oklchToPlanePoint,
  planePointToOklch,
  type ChromavertColor,
  type GamutBoundaryTable,
  type GamutId,
  type PickerGamutBoundaryTables,
} from "../src/index";

function syntheticHueTable(gamut: GamutId, hueMaximums: readonly number[]): GamutBoundaryTable {
  return {
    gamut,
    hueSteps: hueMaximums.length,
    lightnessSteps: 2,
    chromaMax: Float32Array.from([...hueMaximums, ...hueMaximums]),
  };
}

function syntheticLightnessTable(
  gamut: GamutId,
  lightnessMaximums: readonly number[],
): GamutBoundaryTable {
  const hueSteps = 4;
  return {
    gamut,
    hueSteps,
    lightnessSteps: lightnessMaximums.length,
    chromaMax: Float32Array.from(
      lightnessMaximums.flatMap((maximum) => Array<number>(hueSteps).fill(maximum)),
    ),
  };
}

describe("OKLCH picker geometry and analysis", () => {
  const options = { hueSteps: 24, lightnessSteps: 17, searchIterations: 10 };
  let tables: PickerGamutBoundaryTables;

  beforeAll(() => {
    clearGamutBoundaryTableCache();
    tables = {
      srgb: getCachedGamutBoundaryTable("srgb", options),
      displayP3: getCachedGamutBoundaryTable("display-p3", options),
    };
  });

  afterAll(() => {
    clearGamutBoundaryTableCache();
  });

  it("locks the instrument to C=0.4 and clamps only rectangular coordinates", () => {
    expect(OKLCH_PICKER_MAX_CHROMA).toBe(0.4);
    expect(clampPlanePointToInstrumentBounds({ x: -0.25, y: 1.4 })).toEqual({ x: 0, y: 1 });
    expect(clampPlanePointToInstrumentBounds({ x: 1.25, y: -0.4 })).toEqual({ x: 1, y: 0 });
    expect(() => clampPlanePointToInstrumentBounds({ x: Number.NaN, y: 0.5 })).toThrow(/finite/);
  });

  it("roundtrips L/C while preserving hue and alpha without source-dependent math", () => {
    const color: ChromavertColor = {
      l: 0.37,
      c: 0.29,
      h: 312.5,
      alpha: 0.45,
      source: { kind: "input", raw: "color(display-p3 0.8 0.2 0.9)" },
    };
    const withoutSource: ChromavertColor = { l: 0.37, c: 0.29, h: 312.5, alpha: 0.45 };

    const point = oklchToPlanePoint(color);
    expect(point).toEqual(oklchToPlanePoint(withoutSource));
    expect(point.x).toBeCloseTo(0.725, 12);
    expect(point.y).toBeCloseTo(0.63, 12);

    const roundtrip = planePointToOklch(point, color);
    expect(roundtrip.l).toBeCloseTo(color.l, 12);
    expect(roundtrip.c).toBeCloseTo(color.c, 12);
    expect(roundtrip.h).toBe(color.h);
    expect(roundtrip.alpha).toBe(color.alpha);
    expect(roundtrip.source).toBeUndefined();
  });

  it("keeps out-of-gamut chroma until the explicit instrument edge", () => {
    const color = planePointToOklch({ x: 0.875, y: 0.5 }, { h: 20, alpha: 1 });
    expect(color.l).toBe(0.5);
    expect(color.c).toBeCloseTo(0.35, 12);
    expect(color.h).toBe(20);
    expect(color.alpha).toBe(1);
    expect(getPickerGamutStatus(color, tables).displayP3.inGamut).toBe(false);

    const bounded = planePointToOklch({ x: 2, y: -1 }, { h: 380, alpha: 0.8 });
    expect(bounded).toEqual({ l: 1, c: 0.4, h: 20, alpha: 0.8 });

    const beyondInstrument: ChromavertColor = { l: 0.5, c: 0.5, h: 20, alpha: 1 };
    expect(oklchToPlanePoint(beyondInstrument).x).toBe(1.25);
  });

  it("builds deterministic finite fixed-hue boundary geometry into reusable buffers", () => {
    const sampleCount = 33;
    const output = new Float32Array(sampleCount * 2);
    const srgb = buildLightnessChromaBoundaryPath(tables.srgb, 30, sampleCount, output);
    const repeated = buildLightnessChromaBoundaryPath(tables.srgb, 30, sampleCount);
    const displayP3 = buildLightnessChromaBoundaryPath(tables.displayP3, 30, sampleCount);

    expect(srgb).toBe(output);
    expect([...repeated]).toEqual([...srgb]);
    expect(srgb).toHaveLength(sampleCount * 2);
    expect(srgb[1]).toBe(1);
    expect(srgb.at(-1)).toBe(0);
    expect([...srgb].every(Number.isFinite)).toBe(true);
    expect([...displayP3].some((value, index) => Math.abs(value - (srgb[index] ?? 0)) > 1e-5)).toBe(
      true,
    );
  });

  it("derives exact dual gamut status and distinct table guide markers", () => {
    const l = 0.6;
    const h = 30;
    const srgbMaximum = getMaximumChromaFromTable(tables.srgb, l, h);
    const displayP3Maximum = getMaximumChromaFromTable(tables.displayP3, l, h);
    expect(displayP3Maximum).toBeGreaterThan(srgbMaximum);

    const color: ChromavertColor = {
      l,
      c: (srgbMaximum + displayP3Maximum) / 2,
      h,
      alpha: 1,
      source: { kind: "imported", source: "manual" },
    };
    const status = getPickerGamutStatus(color, tables);
    const statusWithoutSource = getPickerGamutStatus(
      { l: color.l, c: color.c, h: color.h, alpha: color.alpha },
      tables,
    );

    expect(status).toEqual(statusWithoutSource);
    expect(status.srgb.inGamut).toBe(false);
    expect(status.displayP3.inGamut).toBe(true);
    expect(status.srgb.interpolatedMaximumChroma).toBe(srgbMaximum);
    expect(status.displayP3.interpolatedMaximumChroma).toBe(displayP3Maximum);
    expect(status.srgb.interpolatedDeltaC).toBeCloseTo(color.c - srgbMaximum, 12);

    const markers = getChromaSliderMarkers(color, tables);
    expect(markers.active.chroma).toBe(color.c);
    expect(markers.srgbBoundaryGuide.chroma).toBe(srgbMaximum);
    expect(markers.displayP3BoundaryGuide.chroma).toBe(displayP3Maximum);
    expect(markers.srgbFallbackGuide).not.toBeNull();
    expect(markers.srgbFallbackGuide?.kind).toBe("srgb-fallback-guide");
    expect(markers.srgbFallbackGuide?.chroma).toBe(srgbMaximum);
    expect(markers.srgbFallbackGuide?.position).not.toBe(markers.active.position);

    const sharpBlue: ChromavertColor = { l: 0.45, c: 0.23, h: 263, alpha: 1 };
    const sharpBlueStatus = getPickerGamutStatus(sharpBlue, tables);
    expect(sharpBlueStatus.srgb.inGamut).toBe(isColorInGamut(sharpBlue, "srgb"));
    expect(sharpBlueStatus.srgb.inGamut).toBe(false);
  });

  it("solves lightness-valid intervals from piecewise table interpolation", () => {
    expect(getLightnessGamutIntervals(tables.srgb, { c: 0, h: 30 })).toEqual([
      { start: 0, end: 1 },
    ]);

    const color = { c: 0.1, h: 30 };
    const intervals = getLightnessGamutIntervals(tables.srgb, color);
    expect(intervals.length).toBeGreaterThan(0);
    expect(getLightnessGamutIntervals(tables.srgb, color)).toEqual(intervals);

    for (const interval of intervals) {
      expect(interval.start).toBeGreaterThanOrEqual(0);
      expect(interval.end).toBeLessThanOrEqual(1);
      expect(interval.end).toBeGreaterThanOrEqual(interval.start);
      const midpoint = (interval.start + interval.end) / 2;
      expect(getMaximumChromaFromTable(tables.srgb, midpoint, color.h)).toBeGreaterThanOrEqual(
        color.c - 1e-7,
      );
    }
  });

  describe("Lightness gamut intervals", () => {
    it("returns none, all, and multiple ordered intervals from synthetic table rows", () => {
      const noValid = syntheticLightnessTable("srgb", [0, 0, 0, 0, 0]);
      const allValid = syntheticLightnessTable("display-p3", [1, 1, 1, 1, 1]);
      const multiple = syntheticLightnessTable("display-p3", [0, 1, 0, 1, 0]);
      const color = { c: 0.5, h: 123 };

      expect(getLightnessGamutIntervals(noValid, color)).toEqual([]);
      expect(getLightnessGamutIntervals(allValid, color)).toEqual([{ start: 0, end: 1 }]);
      expect(getLightnessGamutIntervals(multiple, color)).toEqual([
        { start: 0.125, end: 0.375 },
        { start: 0.625, end: 0.875 },
      ]);
    });

    it("preserves an inclusive zero-length interval at an isolated table peak", () => {
      const table = syntheticLightnessTable("srgb", [0, 0, 0.5, 0, 0]);

      expect(getLightnessGamutIntervals(table, { c: 0.5, h: 0 })).toEqual([
        { start: 0.5, end: 0.5 },
      ]);
    });

    it("keeps sRGB and Display P3 facts separate without mutating input colors", () => {
      const srgb = syntheticLightnessTable("srgb", [0, 0, 0, 0]);
      const displayP3 = syntheticLightnessTable("display-p3", [1, 1, 1, 1]);
      const color = { c: 0.5, h: 45 };
      const snapshot = structuredClone(color);

      expect(getLightnessGamutIntervals(srgb, color)).toEqual([]);
      expect(getLightnessGamutIntervals(displayP3, color)).toEqual([{ start: 0, end: 1 }]);
      expect(color).toEqual(snapshot);
    });
  });

  describe("Hue gamut intervals", () => {
    it("returns no interval or the complete normalized domain deterministically", () => {
      const noValidHue = syntheticHueTable("srgb", [0, 0, 0, 0]);
      const allValidHues = syntheticHueTable("srgb", [1, 1, 1, 1]);
      const color = { l: 0.5, c: 0.5 };

      expect(getHueGamutIntervals(noValidHue, color)).toEqual([]);
      expect(getHueGamutIntervals(allValidHues, color)).toEqual([{ start: 0, end: 1 }]);
      expect(getHueGamutIntervals(allValidHues, color)).toEqual(
        getHueGamutIntervals(allValidHues, color),
      );
    });

    it("solves one normalized interval from table Hue knots", () => {
      const table = syntheticHueTable("display-p3", [0, 1, 1, 0]);

      expect(getHueGamutIntervals(table, { l: 0.5, c: 0.5 })).toEqual([
        { start: 0.125, end: 0.625 },
      ]);
    });

    it("returns multiple intervals in normalized slider order", () => {
      const table = syntheticHueTable("display-p3", [0, 1, 0, 1, 0, 0, 0, 0]);
      const intervals = getHueGamutIntervals(table, { l: 0.5, c: 0.5 });

      expect(intervals).toEqual([
        { start: 0.0625, end: 0.1875 },
        { start: 0.3125, end: 0.4375 },
      ]);
      for (const interval of intervals) {
        expect(interval.start).toBeGreaterThanOrEqual(0);
        expect(interval.end).toBeLessThanOrEqual(1);
        expect(interval.end).toBeGreaterThanOrEqual(interval.start);
      }
    });

    it("keeps a wrapped Hue interval as separate segments at equivalent slider edges", () => {
      const table = syntheticHueTable("display-p3", [1, 0, 0, 1]);

      expect(getMaximumChromaFromTable(table, 0.5, 0)).toBe(
        getMaximumChromaFromTable(table, 0.5, 360),
      );
      expect(getHueGamutIntervals(table, { l: 0.5, c: 0.5 })).toEqual([
        { start: 0, end: 0.125 },
        { start: 0.625, end: 1 },
      ]);
    });

    it("interpolates the selected Lightness row before solving Hue crossings", () => {
      const table: GamutBoundaryTable = {
        gamut: "display-p3",
        hueSteps: 4,
        lightnessSteps: 3,
        chromaMax: Float32Array.from([
          0,
          0,
          0,
          0, // L=0
          0,
          1,
          1,
          0, // L=0.5
          0,
          0,
          0,
          0, // L=1
        ]),
      };

      expect(getHueGamutIntervals(table, { l: 0, c: 0.4 })).toEqual([]);
      expect(getHueGamutIntervals(table, { l: 0.25, c: 0.4 })).toEqual([{ start: 0.2, end: 0.55 }]);
      expect(getHueGamutIntervals(table, { l: 0.5, c: 0.4 })).toEqual([{ start: 0.1, end: 0.65 }]);
    });

    it("keeps each gamut table separate and does not mutate the color or table", () => {
      const srgb = syntheticHueTable("srgb", [0, 0, 0, 0]);
      const displayP3 = syntheticHueTable("display-p3", [1, 1, 1, 1]);
      const color: ChromavertColor = {
        l: 0.5,
        c: 0.5,
        h: 42,
        alpha: 0.75,
        source: { kind: "imported", source: "manual" },
      };
      const colorSnapshot = structuredClone(color);
      const srgbData = srgb.chromaMax;
      const srgbSnapshot = [...srgbData];
      const displayP3Data = displayP3.chromaMax;
      const displayP3Snapshot = [...displayP3Data];

      expect(getHueGamutIntervals(srgb, color)).toEqual([]);
      expect(getHueGamutIntervals(displayP3, color)).toEqual([{ start: 0, end: 1 }]);
      expect(color).toEqual(colorSnapshot);
      expect(srgb.gamut).toBe("srgb");
      expect(displayP3.gamut).toBe("display-p3");
      expect(srgb.chromaMax).toBe(srgbData);
      expect(displayP3.chromaMax).toBe(displayP3Data);
      expect([...srgb.chromaMax]).toEqual(srgbSnapshot);
      expect([...displayP3.chromaMax]).toEqual(displayP3Snapshot);
    });

    it("does not mutate cached table identities, metadata, or buffers", () => {
      const color = { l: 0.63, c: 0.17 };
      const colorSnapshot = structuredClone(color);
      const snapshots = [tables.srgb, tables.displayP3].map((table) => ({
        table,
        gamut: table.gamut,
        hueSteps: table.hueSteps,
        lightnessSteps: table.lightnessSteps,
        buffer: table.chromaMax,
        values: [...table.chromaMax],
      }));

      getHueGamutIntervals(tables.srgb, color);
      getHueGamutIntervals(tables.displayP3, color);

      expect(color).toEqual(colorSnapshot);
      for (const snapshot of snapshots) {
        expect(snapshot.table.gamut).toBe(snapshot.gamut);
        expect(snapshot.table.hueSteps).toBe(snapshot.hueSteps);
        expect(snapshot.table.lightnessSteps).toBe(snapshot.lightnessSteps);
        expect(snapshot.table.chromaMax).toBe(snapshot.buffer);
        expect([...snapshot.table.chromaMax]).toEqual(snapshot.values);
      }
    });

    it("rejects invalid analysis inputs and Hue table resolution", () => {
      const table = syntheticHueTable("srgb", [1, 1, 1, 1]);

      expect(() => getHueGamutIntervals(table, { l: Number.NaN, c: 0.1 })).toThrow(/finite/);
      expect(() => getHueGamutIntervals(table, { l: -0.1, c: 0.1 })).toThrow(/between 0 and 1/);
      expect(() => getHueGamutIntervals(table, { l: 0.5, c: -0.1 })).toThrow(/non-negative/);
      expect(() =>
        getHueGamutIntervals(
          {
            gamut: "srgb",
            hueSteps: 2,
            lightnessSteps: 2,
            chromaMax: new Float32Array(4),
          },
          { l: 0.5, c: 0.1 },
        ),
      ).toThrow(/at least three hue steps/);
    });
  });
});

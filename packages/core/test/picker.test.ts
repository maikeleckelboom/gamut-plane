import { beforeAll, describe, expect, it } from "vitest";

import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  generateGamutBoundaryTable,
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  type DisplayGamut,
  type GamutBoundaryTable,
  type OklchSample,
} from "../src/index";
import { getMaximumChromaFromTable } from "../src/gamut/boundary";
import {
  clampPlanePointToInstrumentBounds,
  constrainOklabPlanePoint,
  isPointInOklabInstrumentDomain,
  OKLAB_PICKER_AXIS_LIMIT,
} from "../src/picker/geometry";
import {
  buildLightnessChromaBoundaryPath,
  buildOklabGamutContour,
  OKLAB_FIELD_COLUMN_SAMPLES,
  OKLAB_FIELD_ROW_COUNT,
} from "../src/picker/plane";

function syntheticHueTable(
  gamut: DisplayGamut,
  hueMaximums: readonly number[],
): GamutBoundaryTable {
  return {
    gamut,
    hueSteps: hueMaximums.length,
    lightnessSteps: 2,
    chromaMax: Float32Array.from([...hueMaximums, ...hueMaximums]),
  };
}

function syntheticLightnessTable(
  gamut: DisplayGamut,
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
  let tables: { srgb: GamutBoundaryTable; displayP3: GamutBoundaryTable };

  beforeAll(() => {
    tables = {
      srgb: generateGamutBoundaryTable("srgb", options),
      displayP3: generateGamutBoundaryTable("display-p3", options),
    };
  });

  it("locks the instrument to C=0.4 and clamps only rectangular coordinates", () => {
    expect(OKLCH_PICKER_MAX_CHROMA).toBe(0.4);
    expect(clampPlanePointToInstrumentBounds({ x: -0.25, y: 1.4 })).toEqual({ x: 0, y: 1 });
    expect(clampPlanePointToInstrumentBounds({ x: 1.25, y: -0.4 })).toEqual({ x: 1, y: 0 });
    expect(() => clampPlanePointToInstrumentBounds({ x: Number.NaN, y: 0.5 })).toThrow(/finite/);
  });

  it("samples the numeric OKLCH field and builds its fixed-hue contour", () => {
    const color: OklchSample = { l: 0.37, c: 0.29, h: 312.5, alpha: 0.45 };
    const point = oklchCoordinatesToPlanePoint(color.l, color.c);
    expect(OKLCH_LIGHTNESS_CHROMA_PLANE.id).toBe("oklch");
    const sampled = { l: 0, c: 0, h: 0, alpha: 1 };
    expect(OKLCH_LIGHTNESS_CHROMA_PLANE.sampleField(point, color.h, sampled)).toBe(sampled);
    expect(sampled).toEqual({ l: color.l, c: color.c, h: color.h, alpha: 1 });
    expect(OKLCH_LIGHTNESS_CHROMA_PLANE.buildGamutContour(tables.srgb, color.h, 17)).toEqual(
      buildLightnessChromaBoundaryPath(tables.srgb, color.h, 17),
    );
  });

  it("treats normalized last-bit noise at the instrument edge as inside", () => {
    expect(
      OKLCH_LIGHTNESS_CHROMA_PLANE.isPointInInstrumentDomain(
        oklchCoordinatesToPlanePoint(0.5, 0.4000000000000001),
      ),
    ).toBe(true);
    expect(
      OKLAB_AB_PLANE.isPointInInstrumentDomain(oklabCoordinatesToPlanePoint(0.4000000000000001, 0)),
    ).toBe(true);
    expect(OKLCH_LIGHTNESS_CHROMA_PLANE.isPointInInstrumentDomain({ x: 1.125, y: 0.5 })).toBe(
      false,
    );
    expect(OKLAB_AB_PLANE.isPointInInstrumentDomain(oklabCoordinatesToPlanePoint(0.45, 0))).toBe(
      false,
    );
  });

  it("builds finite fixed-hue boundary geometry into reusable buffers", () => {
    const sampleCount = 33;
    const output = new Float32Array(sampleCount * 2);
    const srgb = buildLightnessChromaBoundaryPath(tables.srgb, 30, sampleCount, output);
    const displayP3 = buildLightnessChromaBoundaryPath(tables.displayP3, 30, sampleCount);

    expect(srgb).toBe(output);
    expect(srgb).toHaveLength(sampleCount * 2);
    expect(srgb[1]).toBe(1);
    expect(srgb.at(-1)).toBe(0);
    expect([...srgb].every(Number.isFinite)).toBe(true);
    expect([...displayP3].some((value, index) => Math.abs(value - (srgb[index] ?? 0)) > 1e-5)).toBe(
      true,
    );
  });

  it("derives distinct sampled guide facts without mutating the observed coordinates", () => {
    const color: OklchSample = { l: 0.6, c: 0.2, h: 30, alpha: 0.45 };
    const snapshot = structuredClone(color);
    const srgb = getPickerGuide(color, tables.srgb);
    const displayP3 = getPickerGuide(color, tables.displayP3);

    for (const [guide, table] of [
      [srgb, tables.srgb],
      [displayP3, tables.displayP3],
    ] as const) {
      const maximum = getMaximumChromaFromTable(table, color.l, color.h);
      expect(guide.gamut).toBe(table.gamut);
      expect(guide.maximumChroma).toBe(maximum);
      expect(guide.deltaC).toBeCloseTo(Math.max(0, color.c - maximum), 6);
      expect(guide.color).toEqual({ ...color, c: maximum });
    }
    expect(displayP3.maximumChroma).toBeGreaterThan(srgb.maximumChroma);
    expect(color).toEqual(snapshot);
  });

  it("solves lightness-valid intervals from piecewise table interpolation", () => {
    expect(getLightnessGuideIntervals(tables.srgb, { c: 0, h: 30 })).toEqual([
      { start: 0, end: 1 },
    ]);

    const color = { c: 0.1, h: 30 };
    const intervals = getLightnessGuideIntervals(tables.srgb, color);
    expect(intervals.length).toBeGreaterThan(0);

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

  describe("Lightness guide intervals", () => {
    it("returns none, all, and multiple ordered intervals from synthetic table rows", () => {
      const noValid = syntheticLightnessTable("srgb", [0, 0, 0, 0, 0]);
      const allValid = syntheticLightnessTable("display-p3", [1, 1, 1, 1, 1]);
      const multiple = syntheticLightnessTable("display-p3", [0, 1, 0, 1, 0]);
      const color = { c: 0.5, h: 123 };

      expect(getLightnessGuideIntervals(noValid, color)).toEqual([]);
      expect(getLightnessGuideIntervals(allValid, color)).toEqual([{ start: 0, end: 1 }]);
      expect(getLightnessGuideIntervals(multiple, color)).toEqual([
        { start: 0.125, end: 0.375 },
        { start: 0.625, end: 0.875 },
      ]);
    });

    it("preserves an inclusive zero-length interval at an isolated table peak", () => {
      const table = syntheticLightnessTable("srgb", [0, 0, 0.5, 0, 0]);

      expect(getLightnessGuideIntervals(table, { c: 0.5, h: 0 })).toEqual([
        { start: 0.5, end: 0.5 },
      ]);
    });

    it("keeps sRGB and Display P3 facts separate without mutating input colors", () => {
      const srgb = syntheticLightnessTable("srgb", [0, 0, 0, 0]);
      const displayP3 = syntheticLightnessTable("display-p3", [1, 1, 1, 1]);
      const color = { c: 0.5, h: 45 };
      const snapshot = structuredClone(color);

      expect(getLightnessGuideIntervals(srgb, color)).toEqual([]);
      expect(getLightnessGuideIntervals(displayP3, color)).toEqual([{ start: 0, end: 1 }]);
      expect(color).toEqual(snapshot);
    });
  });

  describe("Hue guide intervals", () => {
    it("returns no interval or the complete normalized domain", () => {
      const noValidHue = syntheticHueTable("srgb", [0, 0, 0, 0]);
      const allValidHues = syntheticHueTable("srgb", [1, 1, 1, 1]);
      const color = { l: 0.5, c: 0.5 };

      expect(getHueGuideIntervals(noValidHue, color)).toEqual([]);
      expect(getHueGuideIntervals(allValidHues, color)).toEqual([{ start: 0, end: 1 }]);
    });

    it("solves one normalized interval from table Hue knots", () => {
      const table = syntheticHueTable("display-p3", [0, 1, 1, 0]);

      expect(getHueGuideIntervals(table, { l: 0.5, c: 0.5 })).toEqual([
        { start: 0.125, end: 0.625 },
      ]);
    });

    it("returns multiple intervals in normalized slider order", () => {
      const table = syntheticHueTable("display-p3", [0, 1, 0, 1, 0, 0, 0, 0]);
      const intervals = getHueGuideIntervals(table, { l: 0.5, c: 0.5 });

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
      expect(getHueGuideIntervals(table, { l: 0.5, c: 0.5 })).toEqual([
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

      expect(getHueGuideIntervals(table, { l: 0, c: 0.4 })).toEqual([]);
      expect(getHueGuideIntervals(table, { l: 0.25, c: 0.4 })).toEqual([{ start: 0.2, end: 0.55 }]);
      expect(getHueGuideIntervals(table, { l: 0.5, c: 0.4 })).toEqual([{ start: 0.1, end: 0.65 }]);
    });

    it("keeps each gamut table separate and does not mutate the color or table", () => {
      const srgb = syntheticHueTable("srgb", [0, 0, 0, 0]);
      const displayP3 = syntheticHueTable("display-p3", [1, 1, 1, 1]);
      const color: OklchSample = {
        l: 0.5,
        c: 0.5,
        h: 42,
        alpha: 0.75,
      };
      const colorSnapshot = structuredClone(color);
      const srgbData = srgb.chromaMax;
      const srgbSnapshot = [...srgbData];
      const displayP3Data = displayP3.chromaMax;
      const displayP3Snapshot = [...displayP3Data];

      expect(getHueGuideIntervals(srgb, color)).toEqual([]);
      expect(getHueGuideIntervals(displayP3, color)).toEqual([{ start: 0, end: 1 }]);
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

      getHueGuideIntervals(tables.srgb, color);
      getHueGuideIntervals(tables.displayP3, color);

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

      expect(() => getHueGuideIntervals(table, { l: Number.NaN, c: 0.1 })).toThrow(/finite/);
      expect(() => getHueGuideIntervals(table, { l: -0.1, c: 0.1 })).toThrow(/between 0 and 1/);
      expect(() => getHueGuideIntervals(table, { l: 0.5, c: -0.1 })).toThrow(/non-negative/);
      expect(() =>
        getHueGuideIntervals(
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

  describe("OKLab a/b picker geometry", () => {
    it("locks the viewport to a,b ±0.4 and projects pointer overflow to the radial edge", () => {
      expect(OKLAB_PICKER_AXIS_LIMIT).toBe(0.4);
      expect(OKLAB_AB_PLANE.xAxis).toMatchObject({ min: -0.4, max: 0.4 });
      expect(OKLAB_AB_PLANE.yAxis).toMatchObject({ min: -0.4, max: 0.4 });
      expect(isPointInOklabInstrumentDomain({ x: 1, y: 1 })).toBe(false);

      const bounded = constrainOklabPlanePoint({ x: 1.5, y: -0.5 });
      expect(Math.hypot(bounded.x - 0.5, bounded.y - 0.5)).toBeCloseTo(0.5, 12);
      expect(OKLAB_AB_PLANE.isPointInInstrumentDomain(bounded)).toBe(true);
    });

    it("samples the numeric OKLab field", () => {
      expect(OKLAB_FIELD_ROW_COUNT).toBe(80);
      expect(OKLAB_FIELD_COLUMN_SAMPLES).toBe(24);
      const points = [
        { x: 0.5, y: 0.5 },
        { x: 0.75, y: 0.32 },
        { x: 0.12, y: 0.56 },
      ];
      const samples = points.map((point) => {
        const output: OklchSample = { l: 0, c: 0, h: 0, alpha: 1 };
        OKLAB_AB_PLANE.sampleField(point, 0.64, output, {
          input: [0, 0, 0],
          converted: [0, 0, 0],
        });
        return { ...output };
      });

      expect(samples.every((color) => color.l === 0.64 && color.alpha === 1)).toBe(true);

      const corner: OklchSample = { l: 0, c: 0, h: 0, alpha: 1 };
      OKLAB_AB_PLANE.sampleField({ x: 0, y: 0 }, 0.64, corner);
      expect(corner.c).toBeCloseTo(Math.hypot(0.4, 0.4), 11);
    });

    it("builds finite closed contours and retains gamut association", () => {
      const sampleCount = 49;
      const srgbOutput = new Float32Array(sampleCount * 2);
      const srgb = buildOklabGamutContour(tables.srgb, 0.62, sampleCount, srgbOutput);
      const displayP3 = buildOklabGamutContour(tables.displayP3, 0.62, sampleCount);

      expect(srgb).toBe(srgbOutput);
      expect([...srgb].every(Number.isFinite)).toBe(true);
      expect([...displayP3].every(Number.isFinite)).toBe(true);
      expect(srgb.at(-2)).toBe(srgb[0]);
      expect(srgb.at(-1)).toBe(srgb[1]);
      expect(displayP3.at(-2)).toBe(displayP3[0]);
      expect(displayP3.at(-1)).toBe(displayP3[1]);
      expect(tables.srgb.gamut).toBe("srgb");
      expect(tables.displayP3.gamut).toBe("display-p3");
      expect(srgb[0]).toBeCloseTo(
        0.5 + getMaximumChromaFromTable(tables.srgb, 0.62, 0) / (OKLAB_PICKER_AXIS_LIMIT * 2),
        6,
      );
      expect(displayP3[0]).toBeCloseTo(
        0.5 + getMaximumChromaFromTable(tables.displayP3, 0.62, 0) / (OKLAB_PICKER_AXIS_LIMIT * 2),
        6,
      );
      expect(
        [...displayP3].some((value, index) => Math.abs(value - (srgb[index] ?? 0)) > 1e-5),
      ).toBe(true);
      expect(OKLAB_AB_PLANE.gamutContourClosed).toBe(true);
    });
  });
});

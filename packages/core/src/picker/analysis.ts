import { isColorInGamut } from "../color/convert.js";
import { assertOklchColor, type DisplayGamut, type OklchColor } from "../color/types.js";
import { getMaximumChromaFromTable } from "../gamut/boundary.js";
import type { GamutBoundaryTable } from "../gamut/types.js";
import { OKLCH_PICKER_MAX_CHROMA } from "./plane.js";

const PICKER_CHROMA_EPSILON = 1e-6;

export interface PickerGamutBoundaryTables {
  srgb: GamutBoundaryTable;
  displayP3: GamutBoundaryTable;
}

export interface PickerGamutStatus {
  srgb: PickerGamutStatusEntry;
  displayP3: PickerGamutStatusEntry;
}

/** Exact membership plus table-interpolated interaction guides. */
export interface PickerGamutStatusEntry {
  gamut: DisplayGamut;
  /** Exact membership from one RGB conversion, not table interpolation. */
  inGamut: boolean;
  activeChroma: number;
  /** Interpolated guide only. Exact membership and serialization stay separate. */
  interpolatedMaximumChroma: number;
  interpolatedDeltaC: number;
}

export interface BoundaryGuidePoint {
  /** Unclamped canonical/table chroma represented by this point. */
  chroma: number;
  /** Normalized position clamped only to the 0..0.4 instrument domain. */
  position: number;
  color: OklchColor;
}

export interface TargetBoundaryAnalysis {
  target: DisplayGamut;
  /** Exact membership from direct conversion, independent of sampled guide data. */
  inGamut: boolean;
  activeChroma: number;
  /** Interpolated guide only; this is not an exact gamut boundary solution. */
  boundaryGuide: BoundaryGuidePoint;
  /** Positive authored-chroma excursion beyond the interpolated guide. */
  guideDeltaC: number;
  /** Present only when exact target membership says the authored color is outside. */
  projection: BoundaryGuidePoint | null;
}

export interface PickerBoundaryAnalysis {
  /** Exact membership and sampled guide values for both display gamuts. */
  status: PickerGamutStatus;
  /** Projection/reference result for the explicitly selected target gamut. */
  target: TargetBoundaryAnalysis;
}

export interface LightnessGamutInterval {
  /** Inclusive canonical OKLCH lightness at the start of the interval. */
  start: number;
  /** Inclusive canonical OKLCH lightness at the end of the interval. */
  end: number;
}

export interface HueGamutInterval {
  /** Inclusive normalized Hue slider position at the start of the interval. */
  start: number;
  /** Inclusive normalized Hue slider position at the end of the interval. */
  end: number;
}

type LightnessAnalysisColor = Pick<OklchColor, "c" | "h">;
type HueAnalysisColor = Pick<OklchColor, "l" | "c">;

function assertPickerTables(tables: PickerGamutBoundaryTables): void {
  if (tables.srgb.gamut !== "srgb") {
    throw new TypeError("Picker sRGB table must describe the srgb gamut");
  }
  if (tables.displayP3.gamut !== "display-p3") {
    throw new TypeError("Picker Display P3 table must describe the display-p3 gamut");
  }
}

function readMaximumChroma(table: GamutBoundaryTable, l: number, h: number): number {
  const maximumChroma = getMaximumChromaFromTable(table, l, h);
  if (!Number.isFinite(maximumChroma) || maximumChroma < 0) {
    throw new RangeError("Boundary table returned an invalid maximum chroma");
  }
  return maximumChroma;
}

function statusFromTable(color: OklchColor, table: GamutBoundaryTable): PickerGamutStatusEntry {
  const interpolatedMaximumChroma = readMaximumChroma(table, color.l, color.h);
  const excursion = Math.max(0, color.c - interpolatedMaximumChroma);
  return {
    gamut: table.gamut,
    inGamut: isColorInGamut(color, table.gamut),
    activeChroma: color.c,
    interpolatedMaximumChroma,
    interpolatedDeltaC: excursion <= PICKER_CHROMA_EPSILON ? 0 : excursion,
  };
}

/** Derives exact membership while keeping boundary guides interpolation-only. */
export function getPickerGamutStatus(
  color: OklchColor,
  tables: PickerGamutBoundaryTables,
): PickerGamutStatus {
  assertOklchColor(color);
  assertPickerTables(tables);
  return {
    srgb: statusFromTable(color, tables.srgb),
    displayP3: statusFromTable(color, tables.displayP3),
  };
}

function boundaryGuidePoint(color: OklchColor, chroma: number): BoundaryGuidePoint {
  return {
    chroma,
    position: Math.min(1, Math.max(0, chroma / OKLCH_PICKER_MAX_CHROMA)),
    color: { ...color, c: chroma },
  };
}

/**
 * Returns exact dual-gamut membership and the sampled guide result for one
 * explicit projection/reference target. The authored color is never changed.
 */
export function getPickerBoundaryAnalysis(
  color: OklchColor,
  target: DisplayGamut,
  tables: PickerGamutBoundaryTables,
  status: PickerGamutStatus = getPickerGamutStatus(color, tables),
): PickerBoundaryAnalysis {
  assertOklchColor(color);
  assertPickerTables(tables);
  const targetStatus = target === "srgb" ? status.srgb : status.displayP3;
  const boundaryGuide = boundaryGuidePoint(color, targetStatus.interpolatedMaximumChroma);
  return {
    status,
    target: {
      target,
      inGamut: targetStatus.inGamut,
      activeChroma: color.c,
      boundaryGuide,
      guideDeltaC: targetStatus.interpolatedDeltaC,
      projection: targetStatus.inGamut
        ? null
        : boundaryGuidePoint(color, Math.min(color.c, targetStatus.interpolatedMaximumChroma)),
    },
  };
}

function assertLightnessAnalysisColor(color: LightnessAnalysisColor): void {
  if (!Number.isFinite(color.c) || color.c < 0) {
    throw new RangeError("Lightness interval chroma must be finite and non-negative");
  }
  if (!Number.isFinite(color.h)) throw new TypeError("Lightness interval hue must be finite");
}

function assertHueAnalysisColor(color: HueAnalysisColor): void {
  if (!Number.isFinite(color.l)) {
    throw new TypeError("Hue interval lightness must be finite");
  }
  if (color.l < 0 || color.l > 1) {
    throw new RangeError("Hue interval lightness must be between 0 and 1");
  }
  if (!Number.isFinite(color.c) || color.c < 0) {
    throw new RangeError("Hue interval chroma must be finite and non-negative");
  }
}

function appendInterval(
  intervals: Array<{ start: number; end: number }>,
  start: number,
  end: number,
): void {
  const previous = intervals.at(-1);
  if (previous && start <= previous.end + Number.EPSILON * 16) {
    previous.end = Math.max(previous.end, end);
    return;
  }
  intervals.push({ start, end });
}

/**
 * Finds lightness intervals valid at the supplied C/H by solving crossings in
 * the table's piecewise-linear lightness interpolation. No gamut search runs.
 */
export function getLightnessGamutIntervals(
  table: GamutBoundaryTable,
  color: LightnessAnalysisColor,
): LightnessGamutInterval[] {
  assertLightnessAnalysisColor(color);
  if (!Number.isInteger(table.lightnessSteps) || table.lightnessSteps < 2) {
    throw new RangeError("Boundary table must contain at least two lightness steps");
  }

  const intervals: LightnessGamutInterval[] = [];
  const denominator = table.lightnessSteps - 1;
  let previousLightness = 0;
  let previousMaximum = readMaximumChroma(table, previousLightness, color.h);
  let previousValid = color.c <= previousMaximum;

  for (let index = 1; index < table.lightnessSteps; index += 1) {
    const lightness = index / denominator;
    const maximum = readMaximumChroma(table, lightness, color.h);
    const valid = color.c <= maximum;

    if (previousValid && valid) {
      appendInterval(intervals, previousLightness, lightness);
    } else if (previousValid !== valid) {
      const maximumDelta = maximum - previousMaximum;
      const ratio = maximumDelta === 0 ? 0 : (color.c - previousMaximum) / maximumDelta;
      const crossing = previousLightness + Math.min(1, Math.max(0, ratio)) / denominator;
      if (previousValid) appendInterval(intervals, previousLightness, crossing);
      else appendInterval(intervals, crossing, lightness);
    }

    previousLightness = lightness;
    previousMaximum = maximum;
    previousValid = valid;
  }

  return intervals;
}

/**
 * Finds normalized Hue intervals valid at the supplied L/C by solving crossings
 * in the table's periodic piecewise-linear Hue interpolation. No gamut search runs.
 * An interval crossing the 0/360 seam remains split across the slider edges.
 */
export function getHueGamutIntervals(
  table: GamutBoundaryTable,
  color: HueAnalysisColor,
): HueGamutInterval[] {
  assertHueAnalysisColor(color);
  if (!Number.isInteger(table.hueSteps) || table.hueSteps < 3) {
    throw new RangeError("Boundary table must contain at least three hue steps");
  }
  if (!Number.isInteger(table.lightnessSteps) || table.lightnessSteps < 2) {
    throw new RangeError("Boundary table must contain at least two lightness steps");
  }

  const intervals: HueGamutInterval[] = [];
  const denominator = table.hueSteps;
  let previousPosition = 0;
  let previousMaximum = readMaximumChroma(table, color.l, 0);
  let previousValid = color.c <= previousMaximum;

  for (let index = 1; index <= table.hueSteps; index += 1) {
    const position = index / denominator;
    const maximum = readMaximumChroma(table, color.l, position * 360);
    const valid = color.c <= maximum;

    if (previousValid && valid) {
      appendInterval(intervals, previousPosition, position);
    } else if (previousValid !== valid) {
      const maximumDelta = maximum - previousMaximum;
      const ratio = maximumDelta === 0 ? 0 : (color.c - previousMaximum) / maximumDelta;
      const crossing = previousPosition + Math.min(1, Math.max(0, ratio)) / denominator;
      if (previousValid) appendInterval(intervals, previousPosition, crossing);
      else appendInterval(intervals, crossing, position);
    }

    previousPosition = position;
    previousMaximum = maximum;
    previousValid = valid;
  }

  return intervals;
}

import { convertOklabToOklch } from "../color/convert.js";
import { normalizeHue, type OklchColor } from "../color/types.js";
import { getMaximumChromaFromTable } from "../gamut/boundary.js";
import type { GamutBoundaryTable } from "../gamut/types.js";
import {
  clampPlanePointToInstrumentBounds,
  clampUnit,
  constrainOklabPlanePoint,
  isPointInOklabInstrumentDomain,
  isPointInRectangularInstrument,
  oklabCoordinatesFromPlanePoint,
  oklabCoordinatesToPlanePoint,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_PICKER_MAX_CHROMA,
  type PickerPlaneId,
  type PlanePoint,
} from "./geometry.js";

export {
  clampPlanePointToInstrumentBounds,
  constrainOklabPlanePoint,
  isPointInOklabInstrumentDomain,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_PICKER_MAX_CHROMA,
  type PickerPlaneId,
  type PlanePoint,
} from "./geometry.js";
const OKLAB_NEUTRAL_RADIUS_EPSILON = 1e-7;
export const OKLAB_FIELD_ROW_COUNT = 80;
export const OKLAB_FIELD_COLUMN_SAMPLES = 24;

export type PickerPlaneAxisId = "lightness" | "chroma" | "hue" | "oklab-a" | "oklab-b";

export interface PickerPlaneAxis {
  id: PickerPlaneAxisId;
  symbol: string;
  label: string;
  min: number;
  max: number;
}

export interface PickerPlaneSampleScratch {
  input: number[];
  converted: number[];
}

export type PickerPlaneFieldSampling =
  | { kind: "column-gradient"; rowStep: number }
  | { kind: "disc-gradient"; rowCount: number; columnSamples: number };

/** Coordinate geometry and labels consumed by instrument presentation. */
export interface PickerPlaneGeometry {
  id: PickerPlaneId;
  label: string;
  xAxis: PickerPlaneAxis;
  yAxis: PickerPlaneAxis;
  fixedAxis: PickerPlaneAxis;
  gamutContourClosed: boolean;
  buildGamutContour(
    table: GamutBoundaryTable,
    fixed: number,
    sampleCount?: number,
    output?: Float32Array,
  ): Float32Array;
  constrainPoint(point: PlanePoint): PlanePoint;
  isPointInInstrumentDomain(point: PlanePoint): boolean;
}

/** Numeric mutable sampling for the Canvas field. */
export interface PickerPlaneFieldSampler {
  id: PickerPlaneId;
  fieldSampling: PickerPlaneFieldSampling;
  sampleField(
    point: PlanePoint,
    fixed: number,
    output: OklchColor,
    scratch?: PickerPlaneSampleScratch,
  ): OklchColor;
}

function resolveSampleCount(sampleCount: number): number {
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new RangeError("Boundary path sampleCount must be an integer of at least 2");
  }
  return sampleCount;
}

/**
 * Returns interleaved normalized x/y points for a fixed-hue L/C boundary.
 * Samples run from L=0 to L=1 and use table interpolation only.
 */
export function buildLightnessChromaBoundaryPath(
  table: GamutBoundaryTable,
  hue: number,
  sampleCount = table.lightnessSteps,
  output?: Float32Array,
): Float32Array {
  if (!Number.isFinite(hue)) throw new TypeError("Boundary hue must be finite");
  const count = resolveSampleCount(sampleCount);
  const requiredLength = count * 2;
  if (output !== undefined && output.length !== requiredLength) {
    throw new RangeError(`Boundary output must contain exactly ${requiredLength} values`);
  }
  const path = output ?? new Float32Array(requiredLength);

  for (let index = 0; index < count; index += 1) {
    const lightness = index / (count - 1);
    const maximumChroma = getMaximumChromaFromTable(table, lightness, hue);
    if (!Number.isFinite(maximumChroma) || maximumChroma < 0) {
      throw new RangeError("Boundary table returned an invalid maximum chroma");
    }
    path[index * 2] = clampUnit(maximumChroma / OKLCH_PICKER_MAX_CHROMA);
    path[index * 2 + 1] = 1 - lightness;
  }

  return path;
}

function sampleOklchField(
  point: PlanePoint,
  fixed: number,
  output: OklchColor,
  _scratch?: PickerPlaneSampleScratch,
): OklchColor {
  const bounded = clampPlanePointToInstrumentBounds(point);
  output.l = 1 - bounded.y;
  output.c = bounded.x * OKLCH_PICKER_MAX_CHROMA;
  output.h = normalizeHue(fixed);
  output.alpha = 1;
  return output;
}

export const OKLCH_LIGHTNESS_CHROMA_PLANE: PickerPlaneGeometry & PickerPlaneFieldSampler = {
  id: "oklch",
  label: "OKLCH",
  xAxis: {
    id: "chroma",
    symbol: "C",
    label: "chroma",
    min: 0,
    max: OKLCH_PICKER_MAX_CHROMA,
  },
  yAxis: { id: "lightness", symbol: "L", label: "lightness", min: 0, max: 1 },
  fixedAxis: { id: "hue", symbol: "H", label: "hue", min: 0, max: 360 },
  fieldSampling: { kind: "column-gradient", rowStep: 10 },
  gamutContourClosed: false,
  sampleField: sampleOklchField,
  buildGamutContour: buildLightnessChromaBoundaryPath,
  constrainPoint: clampPlanePointToInstrumentBounds,
  isPointInInstrumentDomain: isPointInRectangularInstrument,
};
function sampleOklabField(
  point: PlanePoint,
  fixed: number,
  output: OklchColor,
  scratch: PickerPlaneSampleScratch = { input: [0, 0, 0], converted: [0, 0, 0] },
): OklchColor {
  const { a, b } = oklabCoordinatesFromPlanePoint(point);
  const radius = Math.hypot(a, b);
  scratch.input[0] = clampUnit(fixed);
  scratch.input[1] = a;
  scratch.input[2] = b;
  convertOklabToOklch(scratch.input, scratch.converted, scratch.input);

  output.l = clampUnit(scratch.converted[0] ?? Number.NaN);
  output.c = radius;
  output.h =
    radius <= OKLAB_NEUTRAL_RADIUS_EPSILON ? 0 : normalizeHue(scratch.converted[2] ?? Number.NaN);
  output.alpha = 1;
  return output;
}

export function buildOklabGamutContour(
  table: GamutBoundaryTable,
  lightness: number,
  sampleCount = table.hueSteps + 1,
  output?: Float32Array,
): Float32Array {
  if (!Number.isFinite(lightness)) throw new TypeError("Contour lightness must be finite");
  const boundedLightness = clampUnit(lightness);
  if (!Number.isInteger(sampleCount) || sampleCount < 4) {
    throw new RangeError("Closed contour sampleCount must be an integer of at least 4");
  }
  const requiredLength = sampleCount * 2;
  if (output !== undefined && output.length !== requiredLength) {
    throw new RangeError(`Contour output must contain exactly ${requiredLength} values`);
  }
  const contour = output ?? new Float32Array(requiredLength);

  for (let index = 0; index < sampleCount - 1; index += 1) {
    const hue = (index / (sampleCount - 1)) * 360;
    const chroma = getMaximumChromaFromTable(table, boundedLightness, hue);
    if (!Number.isFinite(chroma) || chroma < 0) {
      throw new RangeError("Boundary table returned an invalid maximum chroma");
    }
    const radians = (hue * Math.PI) / 180;
    const point = oklabCoordinatesToPlanePoint(
      chroma * Math.cos(radians),
      chroma * Math.sin(radians),
    );
    contour[index * 2] = point.x;
    contour[index * 2 + 1] = point.y;
  }

  contour[requiredLength - 2] = contour[0]!;
  contour[requiredLength - 1] = contour[1]!;
  return contour;
}

export const OKLAB_AB_PLANE: PickerPlaneGeometry & PickerPlaneFieldSampler = {
  id: "oklab",
  label: "OKLab a/b",
  xAxis: {
    id: "oklab-a",
    symbol: "a",
    label: "OKLab a",
    min: -OKLAB_PICKER_AXIS_LIMIT,
    max: OKLAB_PICKER_AXIS_LIMIT,
  },
  yAxis: {
    id: "oklab-b",
    symbol: "b",
    label: "OKLab b",
    min: -OKLAB_PICKER_AXIS_LIMIT,
    max: OKLAB_PICKER_AXIS_LIMIT,
  },
  fixedAxis: { id: "lightness", symbol: "L", label: "OKLab lightness", min: 0, max: 1 },
  fieldSampling: {
    kind: "disc-gradient",
    rowCount: OKLAB_FIELD_ROW_COUNT,
    columnSamples: OKLAB_FIELD_COLUMN_SAMPLES,
  },
  gamutContourClosed: true,
  sampleField: sampleOklabField,
  buildGamutContour: buildOklabGamutContour,
  constrainPoint: constrainOklabPlanePoint,
  isPointInInstrumentDomain: isPointInOklabInstrumentDomain,
};

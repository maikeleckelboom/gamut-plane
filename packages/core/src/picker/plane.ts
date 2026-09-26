import { convertOklabToOklch, convertOklchToOklab } from "../color/convert.js";
import { assertOklchColor, normalizeHue, type OklchColor } from "../color/types.js";
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
  oklchCoordinatesFromPlanePoint,
  oklchCoordinatesToPlanePoint,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_PICKER_MAX_CHROMA,
  type PickerPlaneId,
  type PlanePoint,
} from "./geometry.js";

export {
  clampPlanePointToInstrumentBounds,
  constrainOklabPlanePoint,
  isPointInOklabInstrumentDomain,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_PICKER_MAX_CHROMA,
  type PickerPlaneId,
  type PlanePoint,
} from "./geometry.js";
export const OKLAB_NEUTRAL_RADIUS_EPSILON = 1e-7;
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

export type PlaneColorReference = Pick<OklchColor, "h" | "alpha">;

export interface PickerPlaneProjection {
  /** Raw canonical projection; it may sit outside the editable instrument domain. */
  point: PlanePoint;
  x: number;
  y: number;
  fixed: number;
}

export interface PickerPlaneSampleScratch {
  input: number[];
  converted: number[];
}

export type PickerPlaneKeyboardAction =
  | "decrease-x"
  | "increase-x"
  | "increase-y"
  | "decrease-y"
  | "minimum-x"
  | "maximum-x";

export type PickerPlaneFieldSampling =
  | { kind: "column-gradient"; rowStep: number }
  | { kind: "disc-gradient"; rowCount: number; columnSamples: number };

/**
 * Released OklchColor picker contract retained for the existing adapters.
 * ColorValue observation and authorship live separately in edit.ts.
 */
export interface PickerPlaneContract {
  id: PickerPlaneId;
  label: string;
  xAxis: PickerPlaneAxis;
  yAxis: PickerPlaneAxis;
  fixedAxis: PickerPlaneAxis;
  fieldSampling: PickerPlaneFieldSampling;
  gamutContourClosed: boolean;
  project(color: OklchColor): PickerPlaneProjection;
  unproject(point: PlanePoint, fixed: number, reference: PlaneColorReference): OklchColor;
  sampleField(
    point: PlanePoint,
    fixed: number,
    output: OklchColor,
    scratch?: PickerPlaneSampleScratch,
  ): OklchColor;
  /** Positions display annotations, including any deliberate instrument-domain projection. */
  positionActivePoint(color: OklchColor): PlanePoint;
  buildGamutContour(
    table: GamutBoundaryTable,
    fixed: number,
    sampleCount?: number,
    output?: Float32Array,
  ): Float32Array;
  constrainPoint(point: PlanePoint): PlanePoint;
  isPointInInstrumentDomain(point: PlanePoint): boolean;
  /** Edits only the fixed axis while preserving both raw plane coordinates. */
  editFixedAxis(color: OklchColor, fixed: number): OklchColor;
  editFromKeyboard(
    color: OklchColor,
    action: PickerPlaneKeyboardAction,
    coarse: boolean,
  ): OklchColor;
}

function assertFiniteFixedAxis(value: number): void {
  if (!Number.isFinite(value)) throw new TypeError("Fixed-axis value must be finite");
}

/** Projects a canonical OKLCH value into the rectangular instrument domain. */
export function oklchToPlanePoint(color: OklchColor): PlanePoint {
  assertOklchColor(color);
  return oklchCoordinatesToPlanePoint(color.l, color.c);
}

/** Maps an instrument point to OKLCH while preserving the supplied hue and alpha. */
export function planePointToOklch(point: PlanePoint, reference: PlaneColorReference): OklchColor {
  const { l, c } = oklchCoordinatesFromPlanePoint(point);
  const color: OklchColor = {
    l,
    c,
    h: normalizeHue(reference.h),
    alpha: reference.alpha,
  };
  assertOklchColor(color);
  return color;
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

function projectOklch(color: OklchColor): PickerPlaneProjection {
  const point = oklchToPlanePoint(color);
  return { point, x: color.c, y: color.l, fixed: normalizeHue(color.h) };
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

function editOklchFromKeyboard(
  color: OklchColor,
  action: PickerPlaneKeyboardAction,
  coarse: boolean,
): OklchColor {
  assertOklchColor(color);
  const step = coarse ? 0.02 : 0.005;
  const next: OklchColor = {
    l: color.l,
    c: color.c,
    h: color.h,
    alpha: color.alpha,
  };

  if (action === "decrease-x") next.c -= step;
  else if (action === "increase-x") next.c += step;
  else if (action === "increase-y") next.l += step;
  else if (action === "decrease-y") next.l -= step;
  else if (action === "minimum-x") next.c = 0;
  else next.c = OKLCH_PICKER_MAX_CHROMA;

  next.l = clampUnit(next.l);
  next.c = Math.min(OKLCH_PICKER_MAX_CHROMA, Math.max(0, next.c));
  return next;
}

function editOklchFixedHue(color: OklchColor, hue: number): OklchColor {
  assertOklchColor(color);
  assertFiniteFixedAxis(hue);
  return {
    l: color.l,
    c: color.c,
    h: normalizeHue(hue),
    alpha: color.alpha,
  };
}

export const OKLCH_LIGHTNESS_CHROMA_PLANE: PickerPlaneContract = {
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
  project: projectOklch,
  unproject: (point, _fixed, reference) => planePointToOklch(point, reference),
  sampleField: sampleOklchField,
  positionActivePoint: (color) => clampPlanePointToInstrumentBounds(oklchToPlanePoint(color)),
  buildGamutContour: buildLightnessChromaBoundaryPath,
  constrainPoint: clampPlanePointToInstrumentBounds,
  isPointInInstrumentDomain: isPointInRectangularInstrument,
  editFixedAxis: editOklchFixedHue,
  editFromKeyboard: editOklchFromKeyboard,
};

export function oklchToOklabPlanePoint(color: OklchColor): PlanePoint {
  const coordinates = convertOklchToOklab(color);
  return oklabCoordinatesToPlanePoint(coordinates[1]!, coordinates[2]!);
}

function writeOklabPointToCanonical(
  point: PlanePoint,
  fixed: number,
  reference: PlaneColorReference,
  output: OklchColor,
  scratch: PickerPlaneSampleScratch = { input: [0, 0, 0], converted: [0, 0, 0] },
  constrainToInstrument = true,
): OklchColor {
  const sampledPoint = constrainToInstrument ? constrainOklabPlanePoint(point) : point;
  const { a, b } = oklabCoordinatesFromPlanePoint(sampledPoint);
  const radius = Math.hypot(a, b);
  scratch.input[0] = clampUnit(fixed);
  scratch.input[1] = a;
  scratch.input[2] = b;
  convertOklabToOklch(scratch.input, scratch.converted, scratch.input);

  output.l = clampUnit(scratch.converted[0] ?? Number.NaN);
  output.c = radius;
  output.h =
    radius <= OKLAB_NEUTRAL_RADIUS_EPSILON
      ? normalizeHue(reference.h)
      : normalizeHue(scratch.converted[2] ?? Number.NaN);
  output.alpha = reference.alpha;
  assertOklchColor(output);
  return output;
}

export function oklabPlanePointToOklch(
  point: PlanePoint,
  fixed: number,
  reference: PlaneColorReference,
): OklchColor {
  return writeOklabPointToCanonical(point, fixed, reference, {
    l: 0,
    c: 0,
    h: 0,
    alpha: reference.alpha,
  });
}

function projectOklab(color: OklchColor): PickerPlaneProjection {
  const coordinates = convertOklchToOklab(color);
  return {
    point: oklabCoordinatesToPlanePoint(coordinates[1]!, coordinates[2]!),
    x: coordinates[1]!,
    y: coordinates[2]!,
    fixed: coordinates[0]!,
  };
}

function sampleOklabField(
  point: PlanePoint,
  fixed: number,
  output: OklchColor,
  scratch?: PickerPlaneSampleScratch,
): OklchColor {
  return writeOklabPointToCanonical(point, fixed, { h: 0, alpha: 1 }, output, scratch, false);
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

function editOklabFromKeyboard(
  color: OklchColor,
  action: PickerPlaneKeyboardAction,
  coarse: boolean,
): OklchColor {
  const projection = projectOklab(color);
  const step = coarse ? 0.02 : 0.005;
  let a = projection.x;
  let b = projection.y;

  if (action === "decrease-x") a -= step;
  else if (action === "increase-x") a += step;
  else if (action === "increase-y") b += step;
  else if (action === "decrease-y") b -= step;
  else {
    const boundedB = Math.min(OKLAB_PICKER_AXIS_LIMIT, Math.max(-OKLAB_PICKER_AXIS_LIMIT, b));
    const horizontalExtent = Math.sqrt(Math.max(0, OKLAB_PICKER_AXIS_LIMIT ** 2 - boundedB ** 2));
    a = action === "minimum-x" ? -horizontalExtent : horizontalExtent;
    b = boundedB;
    return writeOklabPointToCanonical(
      oklabCoordinatesToPlanePoint(a, b),
      projection.fixed,
      color,
      { l: 0, c: 0, h: 0, alpha: color.alpha },
      undefined,
      false,
    );
  }

  return oklabPlanePointToOklch(oklabCoordinatesToPlanePoint(a, b), projection.fixed, color);
}

function editOklabFixedLightness(color: OklchColor, lightness: number): OklchColor {
  assertOklchColor(color);
  assertFiniteFixedAxis(lightness);
  return {
    l: clampUnit(lightness),
    c: color.c,
    h: color.h,
    alpha: color.alpha,
  };
}

export const OKLAB_AB_PLANE: PickerPlaneContract = {
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
  project: projectOklab,
  unproject: oklabPlanePointToOklch,
  sampleField: sampleOklabField,
  positionActivePoint: (color) => constrainOklabPlanePoint(oklchToOklabPlanePoint(color)),
  buildGamutContour: buildOklabGamutContour,
  constrainPoint: constrainOklabPlanePoint,
  isPointInInstrumentDomain: isPointInOklabInstrumentDomain,
  editFixedAxis: editOklabFixedLightness,
  editFromKeyboard: editOklabFromKeyboard,
};

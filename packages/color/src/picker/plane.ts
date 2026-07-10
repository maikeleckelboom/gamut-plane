import { getMaximumChromaFromTable } from "../math/gamutBoundary";
import { assertChromavertColor, normalizeHue, type ChromavertColor } from "../model/color";
import type { GamutBoundaryTable } from "../model/gamut";

export const OKLCH_PICKER_MAX_CHROMA = 0.4;

export type PickerPlaneId = "oklch" | "oklab";

export type PickerPlaneAxisId = "lightness" | "chroma" | "hue" | "oklab-a" | "oklab-b";

export interface PickerPlaneAxis {
  id: PickerPlaneAxisId;
  symbol: string;
  label: string;
  min: number;
  max: number;
}

export interface PlanePoint {
  /** Normalized chroma position. Values outside 0..1 are outside the instrument domain. */
  x: number;
  /** Normalized inverse-lightness position: 0 is L=1 and 1 is L=0. */
  y: number;
}

export type PlaneColorReference = Pick<ChromavertColor, "h" | "alpha">;

export interface PickerPlaneProjection {
  point: PlanePoint;
  x: number;
  y: number;
  fixed: number;
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
  | { kind: "square-grid"; resolution: number };

/**
 * The deliberately small contract shared by Chromavert's approved editable
 * coordinate views. Every method projects over canonical OKLCH state.
 */
export interface PickerPlaneContract {
  id: PickerPlaneId;
  label: string;
  xAxis: PickerPlaneAxis;
  yAxis: PickerPlaneAxis;
  fixedAxis: PickerPlaneAxis;
  fieldSampling: PickerPlaneFieldSampling;
  project(color: ChromavertColor): PickerPlaneProjection;
  unproject(point: PlanePoint, fixed: number, reference: PlaneColorReference): ChromavertColor;
  sampleField(point: PlanePoint, fixed: number, output: ChromavertColor): ChromavertColor;
  positionActivePoint(color: ChromavertColor): PlanePoint;
  buildGamutContour(
    table: GamutBoundaryTable,
    fixed: number,
    sampleCount?: number,
    output?: Float32Array,
  ): Float32Array;
  constrainPoint(point: PlanePoint): PlanePoint;
  isPointInInstrumentDomain(point: PlanePoint): boolean;
  editFromKeyboard(
    color: ChromavertColor,
    action: PickerPlaneKeyboardAction,
    coarse: boolean,
  ): ChromavertColor;
}

function assertFinitePoint(point: PlanePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError("Plane coordinates must be finite numbers");
  }
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Clamps only to the rectangular picker domain, never to an output gamut. */
export function clampPlanePointToInstrumentBounds(point: PlanePoint): PlanePoint {
  assertFinitePoint(point);
  return { x: clampUnit(point.x), y: clampUnit(point.y) };
}

/** Projects canonical OKLCH without consulting source/provenance metadata. */
export function oklchToPlanePoint(color: ChromavertColor): PlanePoint {
  assertChromavertColor(color);
  return {
    x: color.c / OKLCH_PICKER_MAX_CHROMA,
    y: 1 - color.l,
  };
}

/**
 * Maps an instrument point to canonical OKLCH while preserving the supplied
 * hue and alpha. Source/provenance remains a caller-owned concern.
 */
export function planePointToOklch(
  point: PlanePoint,
  reference: PlaneColorReference,
): ChromavertColor {
  const bounded = clampPlanePointToInstrumentBounds(point);
  const color: ChromavertColor = {
    l: 1 - bounded.y,
    c: bounded.x * OKLCH_PICKER_MAX_CHROMA,
    h: normalizeHue(reference.h),
    alpha: reference.alpha,
  };
  assertChromavertColor(color);
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

function projectOklch(color: ChromavertColor): PickerPlaneProjection {
  const point = oklchToPlanePoint(color);
  return { point, x: color.c, y: color.l, fixed: normalizeHue(color.h) };
}

function sampleOklchField(
  point: PlanePoint,
  fixed: number,
  output: ChromavertColor,
): ChromavertColor {
  const bounded = clampPlanePointToInstrumentBounds(point);
  output.l = 1 - bounded.y;
  output.c = bounded.x * OKLCH_PICKER_MAX_CHROMA;
  output.h = normalizeHue(fixed);
  output.alpha = 1;
  return output;
}

function isPointInRectangularInstrument(point: PlanePoint): boolean {
  assertFinitePoint(point);
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function editOklchFromKeyboard(
  color: ChromavertColor,
  action: PickerPlaneKeyboardAction,
  coarse: boolean,
): ChromavertColor {
  assertChromavertColor(color);
  const step = coarse ? 0.02 : 0.005;
  const next: ChromavertColor = {
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
  project: projectOklch,
  unproject: (point, _fixed, reference) => planePointToOklch(point, reference),
  sampleField: sampleOklchField,
  positionActivePoint: (color) => clampPlanePointToInstrumentBounds(oklchToPlanePoint(color)),
  buildGamutContour: buildLightnessChromaBoundaryPath,
  constrainPoint: clampPlanePointToInstrumentBounds,
  isPointInInstrumentDomain: isPointInRectangularInstrument,
  editFromKeyboard: editOklchFromKeyboard,
};

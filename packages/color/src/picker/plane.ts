import { getMaximumChromaFromTable } from "../math/gamutBoundary";
import { assertChromavertColor, normalizeHue, type ChromavertColor } from "../model/color";
import type { GamutBoundaryTable } from "../model/gamut";

export const OKLCH_PICKER_MAX_CHROMA = 0.4;

export interface PlanePoint {
  /** Normalized chroma position. Values outside 0..1 are outside the instrument domain. */
  x: number;
  /** Normalized inverse-lightness position: 0 is L=1 and 1 is L=0. */
  y: number;
}

export type PlaneColorReference = Pick<ChromavertColor, "h" | "alpha">;

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

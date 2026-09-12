import {
  DisplayP3,
  DisplayP3Gamut,
  DisplayP3Linear,
  OKLab,
  OKLCH,
  convert,
  isRGBInGamut,
  sRGB,
  sRGBGamut,
  sRGBLinear,
} from "@texel/color";

import {
  assertOklabColor,
  assertOklchColor,
  normalizeHue,
  type DisplayGamut,
  type OklabColor,
  type OklchColor,
} from "./types.js";
import { GAMUT_EPSILON } from "../gamut/types.js";

export const GAMUT_DEFINITIONS = {
  srgb: { encoded: sRGB, linear: sRGBLinear, gamut: sRGBGamut },
  "display-p3": { encoded: DisplayP3, linear: DisplayP3Linear, gamut: DisplayP3Gamut },
} as const;

export function colorToVector(color: OklchColor): number[] {
  assertOklchColor(color);
  return color.alpha === 1 ? [color.l, color.c, color.h] : [color.l, color.c, color.h, color.alpha];
}

export function colorFromVector(vector: readonly number[]): OklchColor {
  const color = {
    l: Math.min(1, Math.max(0, vector[0] ?? Number.NaN)),
    c: Math.max(0, vector[1] ?? Number.NaN),
    h: normalizeHue(vector[2] ?? 0),
    alpha: Math.min(1, Math.max(0, vector[3] ?? 1)),
  };
  assertOklchColor(color);
  return color;
}

export function convertFromOklch(
  color: OklchColor,
  targetGamut: DisplayGamut,
  linear = false,
): number[] {
  assertOklchColor(color);
  const definition = GAMUT_DEFINITIONS[targetGamut];
  return convert(
    [color.l, color.c, color.h],
    OKLCH,
    linear ? definition.linear : definition.encoded,
  );
}

function assertOklabVector(vector: readonly number[]): void {
  if (
    vector.length < 3 ||
    !Number.isFinite(vector[0]) ||
    !Number.isFinite(vector[1]) ||
    !Number.isFinite(vector[2])
  ) {
    throw new TypeError("OKLab coordinates must contain finite L, a, and b values");
  }
}

/**
 * Converts canonical OKLCH to OKLab coordinates. Optional arrays keep the
 * renderer's hot path allocation-free.
 */
export function convertOklchToOklab(
  color: OklchColor,
  output: number[] = [0, 0, 0],
  input: number[] = [0, 0, 0],
): number[] {
  assertOklchColor(color);
  input[0] = color.l;
  input[1] = color.c;
  input[2] = color.h;
  return convert(input, OKLCH, OKLab, output);
}

/** Converts OKLab coordinates to an OKLCH vector with reusable buffers. */
export function convertOklabToOklch(
  oklab: readonly number[],
  output: number[] = [0, 0, 0],
  input: number[] = [0, 0, 0],
): number[] {
  assertOklabVector(oklab);
  input[0] = oklab[0]!;
  input[1] = oklab[1]!;
  input[2] = oklab[2]!;
  return convert(input, OKLab, OKLCH, output);
}

export function toOklabColor(color: OklchColor): OklabColor {
  const vector = convertOklchToOklab(color);
  const result = {
    l: vector[0] ?? Number.NaN,
    a: vector[1] ?? Number.NaN,
    b: vector[2] ?? Number.NaN,
    alpha: color.alpha,
  };
  assertOklabColor(result);
  return result;
}

export function toOklchColor(color: OklabColor): OklchColor {
  assertOklabColor(color);
  const vector = convertOklabToOklch([color.l, color.a, color.b]);
  return colorFromVector([vector[0]!, vector[1]!, vector[2]!, color.alpha]);
}

export function isColorInGamut(
  color: OklchColor,
  gamut: DisplayGamut,
  epsilon = GAMUT_EPSILON,
): boolean {
  return isRGBInGamut(convertFromOklch(color, gamut, true), epsilon);
}

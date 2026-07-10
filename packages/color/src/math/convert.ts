import {
  DisplayP3,
  DisplayP3Gamut,
  DisplayP3Linear,
  OKLab,
  OKLCH,
  Rec2020,
  Rec2020Gamut,
  Rec2020Linear,
  convert,
  isRGBInGamut,
  sRGB,
  sRGBGamut,
  sRGBLinear,
} from "@texel/color";

import {
  assertChromavertColor,
  normalizeHue,
  type ChromavertColor,
  type GamutId,
} from "../model/color";
import { GAMUT_EPSILON } from "../model/gamut";

export const GAMUT_DEFINITIONS = {
  srgb: { encoded: sRGB, linear: sRGBLinear, gamut: sRGBGamut },
  "display-p3": { encoded: DisplayP3, linear: DisplayP3Linear, gamut: DisplayP3Gamut },
  rec2020: { encoded: Rec2020, linear: Rec2020Linear, gamut: Rec2020Gamut },
} as const;

export function colorToVector(color: ChromavertColor): number[] {
  assertChromavertColor(color);
  return color.alpha === 1 ? [color.l, color.c, color.h] : [color.l, color.c, color.h, color.alpha];
}

export function colorFromVector(
  vector: readonly number[],
  source?: ChromavertColor["source"],
): ChromavertColor {
  const base = {
    l: Math.min(1, Math.max(0, vector[0] ?? Number.NaN)),
    c: Math.max(0, vector[1] ?? Number.NaN),
    h: normalizeHue(vector[2] ?? 0),
    alpha: Math.min(1, Math.max(0, vector[3] ?? 1)),
  };
  const color: ChromavertColor = source === undefined ? base : { ...base, source };
  assertChromavertColor(color);
  return color;
}

export function convertFromOklch(
  color: ChromavertColor,
  targetGamut: GamutId,
  linear = false,
): number[] {
  assertChromavertColor(color);
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

/** Converts canonical OKLCH to transient OKLab coordinates behind the engine adapter. */
export function convertOklchToOklab(
  color: ChromavertColor,
  output: number[] = [0, 0, 0],
  input: number[] = [0, 0, 0],
): number[] {
  assertChromavertColor(color);
  input[0] = color.l;
  input[1] = color.c;
  input[2] = color.h;
  return convert(input, OKLCH, OKLab, output);
}

/** Converts transient OKLab coordinates to an OKLCH vector without creating canonical state. */
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

export function isColorInGamut(
  color: ChromavertColor,
  gamut: GamutId,
  epsilon = GAMUT_EPSILON,
): boolean {
  return isRGBInGamut(convertFromOklch(color, gamut, true), epsilon);
}

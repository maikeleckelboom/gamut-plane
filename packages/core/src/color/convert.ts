import { OKLab, OKLCH, convert } from "@texel/color";

import { assertOklchSample, type OklchSample } from "./types.js";

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
 * Converts numeric OKLCH to OKLab coordinates. Optional arrays keep the
 * renderer's hot path allocation-free.
 */
export function convertOklchToOklab(
  color: OklchSample,
  output: number[] = [0, 0, 0],
  input: number[] = [0, 0, 0],
): number[] {
  assertOklchSample(color);
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

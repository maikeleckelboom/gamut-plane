import { convert, sRGB, sRGBLinear, DisplayP3Linear, OKLCH, OKLab } from "@texel/color";
import { DisplayP3 } from "@texel/color";
import type { ColorResult } from "../result.js";
import type { OklchSample } from "../color/types.js";
import type { RgbChannels, RgbRepresentationId } from "./types/rgbEditing.js";

const linear = { srgb: sRGBLinear, "display-p3": DisplayP3Linear } as const;
const encoded = { srgb: sRGB, "display-p3": DisplayP3 } as const;
const tuple = (v: number[]): RgbChannels => [v[0]!, v[1]!, v[2]!];

/** Revision includes the numeric dependency; change when its conversion definitions change. */
export const RGB_NUMERIC_REVISION = "texel-1.1.11-linear-oklab-v1";
export const MAX_RGB_BATCH_POINTS = 400_000;
export type RgbBatchError = Readonly<{
  code:
    | "invalid-space"
    | "invalid-buffer"
    | "non-finite-input"
    | "numerical-range"
    | "resource-budget";
}>;

/** Packed [L,a,b] output, not scene coordinates. Raw extended conversion; no color authorship. */
export function linearRgbToOklabBatch(
  input: Float64Array,
  space: RgbRepresentationId,
): ColorResult<Float64Array, RgbBatchError> {
  if (space !== "srgb" && space !== "display-p3")
    return { ok: false, error: { code: "invalid-space" } };
  if (!(input instanceof Float64Array) || input.length % 3 !== 0)
    return { ok: false, error: { code: "invalid-buffer" } };
  if (input.length / 3 > MAX_RGB_BATCH_POINTS)
    return { ok: false, error: { code: "resource-budget" } };
  for (const value of input)
    if (!Number.isFinite(value)) return { ok: false, error: { code: "non-finite-input" } };
  const output = new Float64Array(input.length);
  const source = [0, 0, 0];
  const result = [0, 0, 0];
  for (let offset = 0; offset < input.length; offset += 3) {
    source[0] = input[offset]!;
    source[1] = input[offset + 1]!;
    source[2] = input[offset + 2]!;
    convert(source, linear[space], OKLab, result);
    for (let axis = 0; axis < 3; axis++) {
      const value = result[axis]!;
      if (!Number.isFinite(value)) return { ok: false, error: { code: "numerical-range" } };
      output[offset + axis] = value;
    }
  }
  return { ok: true, value: output };
}

/** Internal observation bridge. No authorship, gamut analysis or clipping. */
export function convertLinearRgb(
  channels: RgbChannels,
  from: RgbRepresentationId,
  to: RgbRepresentationId,
): RgbChannels {
  return from === to ? channels : tuple(convert([...channels], linear[from], linear[to]));
}

/** Both shipped RGB encodings use the library's extended sRGB transfer function. */
export function decodeRgbCoordinate(value: number): number {
  return convert([value, 0, 0], sRGB, sRGBLinear)[0]!;
}
export function encodeRgbCoordinate(value: number): number {
  // Preserve the exact unit-cube endpoints, including signed zero.
  return value === 0 || value === 1 ? value : convert([value, 0, 0], sRGBLinear, sRGB)[0]!;
}
export function convertRgbReference(
  sample: OklchSample,
  to: RgbRepresentationId,
): RgbChannels | null {
  const result = tuple(convert([sample.l, sample.c, sample.h], OKLCH, encoded[to]));
  return result.every(Number.isFinite) ? result : null;
}

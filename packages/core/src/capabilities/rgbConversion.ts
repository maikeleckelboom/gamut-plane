import { convert, sRGB, sRGBLinear, DisplayP3Linear, OKLCH } from "@texel/color";
import { DisplayP3 } from "@texel/color";
import type { OklchSample } from "../color/types.js";
import type { RgbChannels, RgbRepresentationId } from "./types/rgbEditing.js";

const linear = { srgb: sRGBLinear, "display-p3": DisplayP3Linear } as const;
const encoded = { srgb: sRGB, "display-p3": DisplayP3 } as const;
const tuple = (v: number[]): RgbChannels => [v[0]!, v[1]!, v[2]!];

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

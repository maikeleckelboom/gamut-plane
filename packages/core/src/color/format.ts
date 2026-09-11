import { assertOklchColor, type OklchColor } from "./types.js";

export const OKLCH_FORMAT_LIGHTNESS_DECIMALS = 1;
export const OKLCH_FORMAT_CHROMA_DECIMALS = 4;
export const OKLCH_FORMAT_HUE_DECIMALS = 1;
export const OKLCH_FORMAT_ALPHA_DECIMALS = 4;

/** Formats OKLCH as stable, human-readable CSS without altering canonical precision. */
export function formatOklch(color: OklchColor): string {
  assertOklchColor(color);
  const core = `${(color.l * 100).toFixed(OKLCH_FORMAT_LIGHTNESS_DECIMALS)}% ${color.c.toFixed(
    OKLCH_FORMAT_CHROMA_DECIMALS,
  )} ${color.h.toFixed(OKLCH_FORMAT_HUE_DECIMALS)}`;
  if (color.alpha >= 1) return `oklch(${core})`;
  return `oklch(${core} / ${color.alpha.toFixed(OKLCH_FORMAT_ALPHA_DECIMALS)})`;
}

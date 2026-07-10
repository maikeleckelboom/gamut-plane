import { assertChromavertColor, type ChromavertColor } from "../model/color";

/**
 * Fixed precision for the editable OKLCH text surface. Canonical state keeps
 * full numeric precision; only the display/input text is rounded so gestures
 * and sliders never emit floating-point noise into the input field or URL.
 */
export const OKLCH_EDITABLE_LIGHTNESS_DECIMALS = 1;
export const OKLCH_EDITABLE_CHROMA_DECIMALS = 4;
export const OKLCH_EDITABLE_HUE_DECIMALS = 1;
export const OKLCH_EDITABLE_ALPHA_DECIMALS = 4;

function formatLightness(l: number): string {
  return `${(l * 100).toFixed(OKLCH_EDITABLE_LIGHTNESS_DECIMALS)}%`;
}

function formatChroma(c: number): string {
  return c.toFixed(OKLCH_EDITABLE_CHROMA_DECIMALS);
}

function formatHue(h: number): string {
  return h.toFixed(OKLCH_EDITABLE_HUE_DECIMALS);
}

function formatAlpha(alpha: number): string {
  return alpha.toFixed(OKLCH_EDITABLE_ALPHA_DECIMALS);
}

/**
 * Formats a canonical OKLCH color as a stable, human-readable, editable string.
 * Output is deterministic for URL/query handoff and round-trips through
 * parseUserColor. Canonical numeric precision is not modified.
 */
export function formatEditableOklch(color: ChromavertColor): string {
  assertChromavertColor(color);
  const core = `${formatLightness(color.l)} ${formatChroma(color.c)} ${formatHue(color.h)}`;
  if (color.alpha >= 1) return `oklch(${core})`;
  return `oklch(${core} / ${formatAlpha(color.alpha)})`;
}

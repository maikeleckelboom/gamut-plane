import { OKLCH, serialize } from "@texel/color";

import { GAMUT_DEFINITIONS, colorToVector, convertFromOklch, isColorInGamut } from "./convert.js";
import type { DisplayGamut, OklchColor } from "./types.js";
import { GAMUT_EPSILON } from "../gamut/types.js";

export type SerializationSpace = "oklch" | DisplayGamut;

/**
 * Serializes through @texel/color. RGB serialization refuses out-of-gamut
 * values so the canonical color is never silently clipped.
 */
export function serializeColor(color: OklchColor, space: SerializationSpace = "oklch"): string {
  if (space === "oklch") return serialize(colorToVector(color), OKLCH, OKLCH);
  if (!isColorInGamut(color, space, GAMUT_EPSILON)) {
    throw new RangeError(`Color is outside ${space}; serialization would require clipping`);
  }
  return serialize(colorToVector(color), OKLCH, GAMUT_DEFINITIONS[space].encoded);
}

/** Serializes accepted sRGB colors as uppercase, nearest-8-bit Hex. */
export function serializeHexColor(color: OklchColor): string {
  if (!isColorInGamut(color, "srgb", GAMUT_EPSILON)) {
    throw new RangeError("Color is outside srgb; Hex serialization would require clipping");
  }
  const byte = (channel: number): string =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255 + Number.EPSILON * 255 * 4)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  const channels = convertFromOklch(color, "srgb");
  return `#${channels.slice(0, 3).map(byte).join("")}${color.alpha === 1 ? "" : byte(color.alpha)}`;
}

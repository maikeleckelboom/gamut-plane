import { OKLCH, serialize } from "@texel/color";

import { GAMUT_DEFINITIONS, colorToVector, isColorInGamut } from "./convert.js";
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

import { OKLCH, serialize } from "@texel/color";

import { GAMUT_DEFINITIONS, colorToVector, isColorInGamut } from "../math/convert";
import type { ChromavertColor, GamutId } from "../model/color";
import { GAMUT_EPSILON } from "../model/gamut";

export type SerializationSpace = "oklch" | GamutId;

/**
 * Serializes through @texel/color. RGB serialization refuses out-of-gamut values
 * so callers must explicitly derive a fallback rather than silently clamp.
 */
export function serializeColor(
  color: ChromavertColor,
  space: SerializationSpace = "oklch",
): string {
  if (space === "oklch") return serialize(colorToVector(color), OKLCH, OKLCH);
  if (!isColorInGamut(color, space, GAMUT_EPSILON)) {
    throw new RangeError(
      `Color is outside ${space}; derive an explicit fallback before serialization`,
    );
  }
  return serialize(colorToVector(color), OKLCH, GAMUT_DEFINITIONS[space].encoded);
}

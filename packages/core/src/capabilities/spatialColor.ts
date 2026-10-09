import { sRGBLinear, DisplayP3Linear } from "@texel/color";
import { OKLAB_TO_LMS_PRIME } from "../gamut/boundaryTrace.js";
import { RGB_NUMERIC_REVISION } from "./rgbConversion.js";

/** Numeric definitions only. Rendering and output clipping are not core gamut policy. */
export function spatialColorDefinition(space: "srgb" | "display-p3") {
  if (space !== "srgb" && space !== "display-p3")
    throw new RangeError("Unsupported spatial output");
  const matrix = (space === "srgb" ? sRGBLinear : DisplayP3Linear).fromLMS_M;
  if (!matrix) throw new Error("Missing core LMS conversion");
  return {
    revision: RGB_NUMERIC_REVISION,
    oklabToLmsPrime: OKLAB_TO_LMS_PRIME.map((row) => [...row]),
    lmsToLinearRgb: matrix.map((row) => [...row]),
    // Both admitted definitions use this extended, sign-preserving transfer.
    transfer: {
      threshold: 0.0031308,
      slope: 12.92,
      scale: 1.055,
      offset: 0.055,
      exponent: 1 / 2.4,
    },
  } as const;
}

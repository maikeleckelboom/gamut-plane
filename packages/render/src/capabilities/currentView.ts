import type { DisplayGamut } from "@gamut-plane/core";
import type { GuideId } from "./guideSupport.js";

/** Old visibility/target references resolve visual identity only, never exact analysis. */
export const currentGuideByGamut = Object.freeze({
  srgb: "srgb-boundary",
  "display-p3": "display-p3-boundary",
} satisfies Readonly<Record<DisplayGamut, GuideId>>);

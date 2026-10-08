import type { GuideId } from "../capabilities/guideSupport.js";
import type { CurrentField } from "./field.js";

/** Presentation only: an RGB Area already supplies its own native gamut domain. */
export function nativeSelfBoundary(field: CurrentField | null): GuideId | null {
  const representation = field?.geometry.representationId;
  return representation === "srgb"
    ? "srgb-boundary"
    : representation === "display-p3"
      ? "display-p3-boundary"
      : null;
}

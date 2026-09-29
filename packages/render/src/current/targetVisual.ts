import {
  OKLCH_PICKER_MAX_CHROMA,
  serializeOklchSample,
  type ColorRepresentation,
  type DisplayGamut,
  type PlanePoint,
} from "@gamut-plane/core";
import type { EditorId } from "@gamut-plane/core/internal/capabilities";
import type { GuideResolution } from "../capabilities/guideResolution.js";
import { guideDefinitions, guideSupport } from "../capabilities/guideSupport.js";
import { currentGuideByGamut } from "../capabilities/currentView.js";
import { currentGuideValue } from "./guideDisplay.js";

/** One missing hidden reference or borrowed visible facts; no product copy or exact analysis. */
export function currentTargetVisual(
  editorId: EditorId,
  target: DisplayGamut,
  guides: readonly GuideResolution[],
  oklch: ColorRepresentation<"oklch">,
) {
  const guideId = currentGuideByGamut[target];
  const visible = guides.find((row) => row.guideId === guideId);
  if (visible && visible.kind !== "resolved") {
    throw new Error("Current target requires supported requested guide forms");
  }
  const [l, c, h] = oklch.channels;
  // Exactly one missing reference, with no hidden ordinary request, contour, interval or check.
  const reference = visible
    ? currentGuideValue(visible.forms.reference)
    : guideSupport[editorId][guideId].forms.reference(
        { l, c, h: h ?? 0, alpha: oklch.alpha },
        guideDefinitions[guideId].table,
      );
  let targetGuidePoint: PlanePoint | null = null;
  if (visible) {
    const marker = visible.forms.targetMarker;
    switch (marker.kind) {
      case "available":
        targetGuidePoint = marker.value;
        break;
      case "exact-not-outside":
        break;
      case "value-unavailable":
        currentGuideValue(marker);
        break;
      case "exact-unavailable":
        throw new RangeError("Selected color cannot be analyzed for picker gamut status");
      case "check-not-requested":
        throw new Error("Current target requires its accepted exact check");
    }
  }
  const targetGuideCss = targetGuidePoint
    ? serializeOklchSample({ ...reference.color, alpha: 1 })
    : "";
  return {
    targetGuidePoint,
    targetGuideCss,
    maximumChroma: reference.maximumChroma,
    deltaC: reference.deltaC,
    swatchCss: serializeOklchSample(reference.color),
    marker:
      editorId === "oklch-lc" && targetGuidePoint
        ? {
            chroma: reference.color.c,
            position: Math.min(1, Math.max(0, reference.color.c / OKLCH_PICKER_MAX_CHROMA)),
          }
        : null,
  };
}

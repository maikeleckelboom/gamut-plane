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
import type { LinearControlMarker } from "../channelGeometry.js";
import { currentGuideValue } from "./guideDisplay.js";
import type { currentExactChecks } from "./exactChecks.js";

/** The focused v0.3 target is separate from ordinary requested guides and checks. */
export function legacyTargetCompatibility(
  editorId: EditorId,
  target: DisplayGamut,
  checks: ReturnType<typeof currentExactChecks>,
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
  const targetLabel = target === "srgb" ? "sRGB" : "Display P3";
  const status = (target === "srgb" ? checks.srgb : checks.displayP3).status;
  const targetGuideCss = targetGuidePoint
    ? serializeOklchSample({ ...reference.color, alpha: 1 })
    : "";
  const markers: LinearControlMarker[] = [];
  if (editorId === "oklch-lc" && targetGuidePoint) {
    markers.push({
      id: `${target}-target-guide`,
      label: `${targetLabel} sampled target guide C ${reference.color.c.toFixed(4)}`,
      position: Math.min(1, Math.max(0, reference.color.c / OKLCH_PICKER_MAX_CHROMA)),
      tone: "guide",
      lane: target,
      cssColor: targetGuideCss,
    });
  }
  return {
    targetGuidePoint,
    targetGuideCss,
    targetGuideLabel: `${targetLabel} sampled target guide`,
    markers,
    targetResult: {
      target,
      targetLabel,
      status,
      guideChroma: reference.maximumChroma.toFixed(4),
      guideDelta: reference.deltaC.toFixed(4),
      showGuideDelta: reference.deltaC > 0,
      swatchCss: serializeOklchSample(reference.color),
    },
  };
}

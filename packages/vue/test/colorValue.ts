import { createColorValue, type ColorValue, type PickerPlaneId } from "@gamut-plane/core";
import {
  generalizedEditableDetail,
  generalizedGuideDisplay,
} from "@gamut-plane/render/internal/current";
import { resolveAcceptedRevision } from "../src/model/acceptedResolution.js";

export function color(l: number, c: number, h: number | null, alpha = 1): ColorValue {
  const result = createColorValue({ space: "oklch", channels: [l, c, h], alpha });
  if (!result.ok) throw new Error("Invalid test color");
  return result.value;
}

export function planeValue(modelValue: ColorValue, view: PickerPlaneId = "oklch") {
  const revision = resolveAcceptedRevision(modelValue, {
    selection: { representationId: view, editorId: view === "oklch" ? "oklch-lc" : "oklab-ab" },
    checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
    referenceGamutId: null,
    visibleGuides: ["display-p3-boundary", "srgb-boundary"],
  });
  const visual = generalizedEditableDetail(
    modelValue,
    revision.observation,
    revision.editor,
    revision.field,
  );
  if (visual.kind !== "available") throw new Error("Missing editable test fixture");
  return {
    modelValue,
    field: visual.field,
    guides: generalizedGuideDisplay(revision.guides),
    markerCss: visual.detail.markerCss,
  };
}

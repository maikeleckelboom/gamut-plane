import { createColorValue, type ColorValue, type PickerPlaneId } from "@gamut-plane/core";
import {
  currentField,
  currentOklchObservation,
  currentEditableDetail,
  currentGuideDisplay,
} from "@gamut-plane/render/internal/current";
import { legacyViewState, resolveAcceptedRevision } from "../src/model/acceptedResolution.js";

export function color(l: number, c: number, h: number | null, alpha = 1): ColorValue {
  const result = createColorValue({ space: "oklch", channels: [l, c, h], alpha });
  if (!result.ok) throw new Error("Invalid test color");
  return result.value;
}

export function planeValue(modelValue: ColorValue, view: PickerPlaneId = "oklch") {
  const revision = resolveAcceptedRevision(modelValue, legacyViewState(view, true, true));
  const field = currentField(view, revision.editor, revision.field);
  const detail = currentEditableDetail(
    field,
    currentOklchObservation(modelValue, revision.observation),
  );
  return {
    modelValue,
    field,
    guides: currentGuideDisplay(revision.guides),
    markerCss: detail.markerCss,
  };
}

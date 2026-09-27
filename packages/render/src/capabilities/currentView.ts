import type { DisplayGamut, PickerPlaneId } from "@gamut-plane/core";
import { editorDefinitions, type EditorDefinition } from "@gamut-plane/core/internal/capabilities";
import type { GuideId } from "./guideSupport.js";

/** Migration bridge for the existing two-view API, not generalized product selection. */
export const currentEditorByView = Object.freeze({
  oklch: editorDefinitions["oklch-lc"].id,
  oklab: editorDefinitions["oklab-ab"].id,
} satisfies {
  readonly [P in PickerPlaneId]: Extract<EditorDefinition, { representationId: P }>["id"];
});

/** Old visibility/target references resolve visual identity only, never exact analysis. */
export const currentGuideByGamut = Object.freeze({
  srgb: "srgb-boundary",
  "display-p3": "display-p3-boundary",
} satisfies Readonly<Record<DisplayGamut, GuideId>>);

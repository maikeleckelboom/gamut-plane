import { describe, expect, it } from "vitest";
import { editorDefinitions } from "@gamut-plane/core/internal/capabilities";
import {
  currentPrimaryEditors,
  currentEditorByView,
  selectionFromCurrentView,
  legacyCheckedGamuts,
  validateInstrumentViewState,
} from "@gamut-plane/ui";
import { currentGuideByGamut } from "../../render/src/capabilities/currentView.js";
import { guideDefinitions } from "../../render/src/capabilities/guideSupport.js";

describe("current UI / core / render contract", () => {
  it("admits only compatible primary editors without a duplicate render bridge", () => {
    for (const editor of currentPrimaryEditors) {
      expect(editorDefinitions[editor.id].representationId).toBe(editor.representationId);
      expect(currentEditorByView[editor.representationId]).toBe(editor.id);
    }
  });

  it("maps current view, exact checks and every guide-boolean combination to independent requests", () => {
    const guideIds = Object.keys(guideDefinitions) as (keyof typeof guideDefinitions)[];
    for (const view of ["oklch", "oklab"] as const) {
      expect(selectionFromCurrentView(view).editorId).toBe(currentEditorByView[view]);
      for (const showSrgbBoundary of [false, true]) {
        for (const showDisplayP3Boundary of [false, true]) {
          const requested = [
            ...(showSrgbBoundary ? [currentGuideByGamut.srgb] : []),
            ...(showDisplayP3Boundary ? [currentGuideByGamut["display-p3"]] : []),
          ];
          const result = validateInstrumentViewState(
            {
              selection: selectionFromCurrentView(view),
              checkedGamuts: legacyCheckedGamuts,
              visibleGuides: requested,
            },
            guideIds,
          );
          expect(result).toMatchObject({
            ok: true,
            value: {
              selection: { representationId: view, editorId: currentEditorByView[view] },
              checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
              visibleGuides: requested.toSorted(),
            },
          });
        }
      }
    }
  });
});

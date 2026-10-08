import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";
import * as internal from "../src/capabilities/index.js";
import * as current from "../src/current/index.js";
import * as viewport from "../src/viewport/index.js";

describe("unsupported sibling capability entry", () => {
  it("exposes exactly the adapter resolution surface and keeps root exports unchanged", () => {
    expect(Object.keys(internal).sort()).toEqual([
      "guideDefinitions",
      "referenceGuidePolicy",
      "resolveEditorVisualSupport",
      "resolveField",
      "resolveRequestedGuides",
    ]);
    for (const key of Object.keys(internal)) expect(root).not.toHaveProperty(key);
  });
});

describe("current render entry after legacy retirement", () => {
  it("exposes only justified current helpers and excludes retired factories from root", () => {
    expect(Object.keys(current).sort()).toEqual([
      "currentEditableDetail",
      "currentField",
      "currentOklchObservation",
      "generalizedEditableDetail",
      "generalizedGuideDisplay",
      "planeWarningOffset",
      "rangeWarningStyle",
      "referenceDisplay",
    ]);
    for (const key of Object.keys(current)) expect(root).not.toHaveProperty(key);
    for (const key of ["createPickerPresentation", "getBoundaryPresentation", "displayGamutLabel"])
      expect(root).not.toHaveProperty(key);
  });
});

describe("internal viewport entry", () => {
  it("exposes the camera to sibling adapters only, never the root", () => {
    expect(Object.keys(viewport).sort()).toEqual([
      "FIT_SAMPLE_WINDOW",
      "FIT_VIEWPORT",
      "MAX_VIEWPORT_ZOOM",
      "MIN_VIEWPORT_ZOOM",
      "assertViewport",
      "constrainViewport",
      "createViewportCamera",
      "fieldToViewport",
      "isFitViewport",
      "panViewport",
      "sampleWindow",
      "viewportDomainStyle",
      "viewportPointStyle",
      "viewportSvgViewBox",
      "viewportToField",
      "viewportsEqual",
      "zoomViewportAt",
    ]);
    for (const key of Object.keys(viewport)) expect(root).not.toHaveProperty(key);
  });
});

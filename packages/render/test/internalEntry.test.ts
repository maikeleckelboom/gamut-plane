import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";
import * as internal from "../src/capabilities/index.js";
import * as current from "../src/current/index.js";

describe("unsupported sibling capability entry", () => {
  it("exposes exactly the adapter resolution surface and keeps root exports unchanged", () => {
    expect(Object.keys(internal).sort()).toEqual([
      "guideDefinitions",
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
    ]);
    for (const key of Object.keys(current)) expect(root).not.toHaveProperty(key);
    for (const key of ["createPickerPresentation", "getBoundaryPresentation", "displayGamutLabel"])
      expect(root).not.toHaveProperty(key);
  });
});

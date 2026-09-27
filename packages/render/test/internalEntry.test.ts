import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";
import * as internal from "../src/capabilities/index.js";

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

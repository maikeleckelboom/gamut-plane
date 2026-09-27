import { describe, expect, it } from "vitest";
import { editorDefinitions } from "@gamut-plane/core/internal/capabilities";
import { currentPrimaryEditors, currentEditorByView } from "@gamut-plane/ui";
import { currentEditorByView as renderBridge } from "../../render/src/capabilities/currentView.js";

describe("current UI / core / render contract", () => {
  it("admits only compatible primary editors and agrees with the temporary render bridge", () => {
    expect(currentEditorByView).toEqual(renderBridge);
    for (const editor of currentPrimaryEditors) {
      expect(editorDefinitions[editor.id].representationId).toBe(editor.representationId);
      expect(currentEditorByView[editor.representationId]).toBe(editor.id);
    }
  });
});

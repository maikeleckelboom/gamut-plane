import type { PickerPlaneId } from "@gamut-plane/core";
import type { EditorVisualSupport, FieldResolution } from "../capabilities/editorResolution.js";

/** Current-product admission is adapter-owned; this bridge requires its real field support. */
export function currentField(
  view: PickerPlaneId,
  editor: EditorVisualSupport,
  field: FieldResolution,
) {
  if (editor.kind !== "editor" || editor.field === null || editor.geometry.planeId !== view) {
    throw new Error("Current editable context requires matching field support");
  }
  switch (field.kind) {
    case "no-field-requested":
      throw new Error("Current editable context requires a requested field");
    case "field-unsupported":
      throw new Error("Current editable context requires a supported field");
    case "value-unavailable":
      if (field.reason === "projection-failed") {
        throw new RangeError("Selected color cannot be projected into the instrument");
      }
      // Keep successful extended-L projection facts. Current target sampling still rejects L
      // outside 0..1 before mounting; generalized unavailability does not invent partial UI.
      return {
        editorId: editor.editor.id,
        plane: editor.field.plane,
        projection: field.projection,
        samplingFixed: field.fixedCoordinate.value ?? 0,
        markerInDomain: field.markerInDomain,
      };
    case "available":
      return {
        editorId: editor.editor.id,
        plane: editor.field.plane,
        projection: field.projection,
        samplingFixed: field.samplingFixed,
        markerInDomain: field.markerInDomain,
      };
  }
}

export type CurrentField = ReturnType<typeof currentField>;

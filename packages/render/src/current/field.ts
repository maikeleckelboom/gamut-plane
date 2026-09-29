import type { EditorVisualSupport, FieldResolution } from "../capabilities/editorResolution.js";

/** Available built-in field composition, keyed by selected geometry rather than view. */
export function currentField(editor: EditorVisualSupport, field: FieldResolution) {
  if (
    editor.kind !== "editor" ||
    editor.field === null ||
    ("projection" in field && editor.geometry.id !== field.projection.geometryId)
  ) {
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
      // Retain successful projection facts for scoped unavailability; the generalized
      // composition decides whether an editor field can be mounted.
      return {
        editorId: editor.editor.id,
        geometry: editor.geometry,
        plane: editor.field.plane,
        projection: field.projection,
        samplingFixed: field.fixedCoordinate.value ?? 0,
        markerInDomain: field.markerInDomain,
      };
    case "available":
      return {
        editorId: editor.editor.id,
        geometry: editor.geometry,
        plane: editor.field.plane,
        projection: field.projection,
        samplingFixed: field.samplingFixed,
        markerInDomain: field.markerInDomain,
      };
  }
}

export type CurrentField = ReturnType<typeof currentField>;

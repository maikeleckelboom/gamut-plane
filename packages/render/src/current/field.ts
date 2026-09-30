import type {
  EditorVisualSupport,
  FieldResolution,
  ProductionProjection,
} from "../capabilities/editorResolution.js";
import { fieldSupport, type FieldSupport } from "../capabilities/fieldSupport.js";

/** The current renderer can compose only the geometries for which it actually has a field. */
export type CurrentField = {
  [F in FieldSupport as F["editorId"]]: F &
    Readonly<{
      projection: Extract<ProductionProjection, { geometryId: F["geometry"]["id"] }>;
      samplingFixed: number;
      markerInDomain: boolean;
    }>;
}[FieldSupport["editorId"]];

/** Available built-in field composition, keyed by selected geometry rather than view. */
export function currentField(editor: EditorVisualSupport, field: FieldResolution): CurrentField {
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
      break;
    case "available":
      break;
  }
  const facts = {
    samplingFixed:
      field.kind === "available" ? field.samplingFixed : (field.fixedCoordinate.value ?? 0),
    markerInDomain: field.markerInDomain,
  };
  const projection = field.projection;
  // Retain the literal geometry/projection pairing across the sibling-adapter boundary.
  switch (projection.geometryId) {
    case "oklch-lc-rectangle":
      return { ...fieldSupport["oklch-lc"], ...facts, projection };
    case "oklab-ab-disc":
      return { ...fieldSupport["oklab-ab"], ...facts, projection };
    case "srgb-rg-rectangle":
      return { ...fieldSupport["srgb-rg"], ...facts, projection };
    case "srgb-rb-rectangle":
      return { ...fieldSupport["srgb-rb"], ...facts, projection };
    case "srgb-gb-rectangle":
      return { ...fieldSupport["srgb-gb"], ...facts, projection };
    case "display-p3-rg-rectangle":
      return { ...fieldSupport["display-p3-rg"], ...facts, projection };
    case "display-p3-rb-rectangle":
      return { ...fieldSupport["display-p3-rb"], ...facts, projection };
    case "display-p3-gb-rectangle":
      return { ...fieldSupport["display-p3-gb"], ...facts, projection };
  }
}

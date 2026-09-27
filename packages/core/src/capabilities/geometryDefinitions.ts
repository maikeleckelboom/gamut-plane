import { projectColorToPlane } from "../picker/edit.js";
import {
  clampPlanePointToInstrumentBounds,
  constrainOklabPlanePoint,
  isPointInOklabInstrumentDomain,
  isPointInRectangularInstrument,
  oklabCoordinatesFromPlanePoint,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesFromPlanePoint,
  oklchCoordinatesToPlanePoint,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_PICKER_MAX_CHROMA,
} from "../picker/geometry.js";
import { keyboardPlanePoint } from "../picker/keyboard.js";
import type { GeometryDefinitions } from "./types/editingDefinitions.js";

export type { GeometryDefinition, GeometryId } from "./types/editingDefinitions.js";

/** References the same mathematical authorities as the existing picker planes. */
export const geometryDefinitions: GeometryDefinitions = Object.freeze({
  "oklch-lc-rectangle": Object.freeze({
    id: "oklch-lc-rectangle",
    representationId: "oklch",
    planeId: "oklch",
    x: "oklch.c",
    y: "oklch.l",
    fixed: "oklch.h",
    xDirection: "increasing",
    yDirection: "decreasing",
    domain: Object.freeze({
      kind: "rectangle",
      lightness: Object.freeze([0, 1] as const),
      maximumChroma: OKLCH_PICKER_MAX_CHROMA,
    }),
    toPoint: oklchCoordinatesToPlanePoint,
    fromPoint: oklchCoordinatesFromPlanePoint,
    project: projectColorToPlane,
    keyboard: keyboardPlanePoint,
    constrain: clampPlanePointToInstrumentBounds,
    contains: isPointInRectangularInstrument,
  }),
  "oklab-ab-disc": Object.freeze({
    id: "oklab-ab-disc",
    representationId: "oklab",
    planeId: "oklab",
    x: "oklab.a",
    y: "oklab.b",
    fixed: "oklab.l",
    xDirection: "increasing",
    yDirection: "decreasing",
    domain: Object.freeze({ kind: "disc", radius: OKLAB_PICKER_AXIS_LIMIT }),
    toPoint: oklabCoordinatesToPlanePoint,
    fromPoint: oklabCoordinatesFromPlanePoint,
    project: projectColorToPlane,
    keyboard: keyboardPlanePoint,
    constrain: constrainOklabPlanePoint,
    contains: isPointInOklabInstrumentDomain,
  }),
});

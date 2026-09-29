import { projectColorToPlane, type ColorPlaneProjection } from "../picker/edit.js";
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
import type { ColorValue } from "../color/value.js";
import type { PickerPlaneKeyboardAction } from "../picker/keyboard.js";
import type { PlanePoint } from "../picker/geometry.js";
import type { GeometryProjection } from "./types/editingDefinitions.js";
import type { GeometryDefinitions } from "./types/editingDefinitions.js";

export type {
  GeometryContract,
  GeometryDefinition,
  GeometryId,
  GeometryProjection,
} from "./types/editingDefinitions.js";

function projectOklch(value: ColorValue) {
  const result = projectColorToPlane(value, "oklch");
  if (!result.ok) return result;
  const representation = result.value.representation;
  return {
    ok: true,
    value: {
      representationId: "oklch",
      geometryId: "oklch-lc-rectangle",
      representation,
      point: result.value.point,
      coordinates: {
        x: representation.channels[1],
        y: representation.channels[0],
        fixed: representation.channels[2],
      },
      channels: { x: "oklch.c", y: "oklch.l", fixed: "oklch.h" },
    },
  } as const;
}

function projectOklab(value: ColorValue) {
  const result = projectColorToPlane(value, "oklab");
  if (!result.ok) return result;
  const representation = result.value.representation;
  return {
    ok: true,
    value: {
      representationId: "oklab",
      geometryId: "oklab-ab-disc",
      representation,
      point: result.value.point,
      coordinates: {
        x: representation.channels[1],
        y: representation.channels[2],
        fixed: representation.channels[0],
      },
      channels: { x: "oklab.a", y: "oklab.b", fixed: "oklab.l" },
    },
  } as const;
}

function pickerProjection<R extends "oklch" | "oklab">(
  projection: GeometryProjection<R>,
  plane: R,
): ColorPlaneProjection<R> {
  return { plane, representation: projection.representation, point: projection.point };
}

/** References the same mathematical authorities as the existing picker planes. */
export const geometryDefinitions: GeometryDefinitions = Object.freeze({
  "oklch-lc-rectangle": Object.freeze({
    id: "oklch-lc-rectangle",
    representationId: "oklch",
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
    project: projectOklch,
    keyboard: (
      projection: GeometryProjection<"oklch", "oklch-lc-rectangle">,
      action: PickerPlaneKeyboardAction,
      coarse: boolean,
    ): PlanePoint => keyboardPlanePoint(pickerProjection(projection, "oklch"), action, coarse),
    constrain: clampPlanePointToInstrumentBounds,
    contains: isPointInRectangularInstrument,
    samplingFixed: (fixed: number | null) => fixed ?? 0,
  }),
  "oklab-ab-disc": Object.freeze({
    id: "oklab-ab-disc",
    representationId: "oklab",
    x: "oklab.a",
    y: "oklab.b",
    fixed: "oklab.l",
    xDirection: "increasing",
    yDirection: "decreasing",
    domain: Object.freeze({ kind: "disc", radius: OKLAB_PICKER_AXIS_LIMIT }),
    toPoint: oklabCoordinatesToPlanePoint,
    fromPoint: oklabCoordinatesFromPlanePoint,
    project: projectOklab,
    keyboard: (
      projection: GeometryProjection<"oklab", "oklab-ab-disc">,
      action: PickerPlaneKeyboardAction,
      coarse: boolean,
    ): PlanePoint => keyboardPlanePoint(pickerProjection(projection, "oklab"), action, coarse),
    constrain: constrainOklabPlanePoint,
    contains: isPointInOklabInstrumentDomain,
    samplingFixed: (fixed: number | null) =>
      fixed !== null && fixed >= 0 && fixed <= 1 ? fixed : null,
  }),
});

/** Built-in keyboard binding follows geometry identity, not a representation-named plane. */
export function keyboardGeometryPoint(
  projection:
    | GeometryProjection<"oklch", "oklch-lc-rectangle", "oklch.c", "oklch.l", "oklch.h">
    | GeometryProjection<"oklab", "oklab-ab-disc", "oklab.a", "oklab.b", "oklab.l">,
  action: PickerPlaneKeyboardAction,
  coarse: boolean,
): PlanePoint {
  if (projection.geometryId === "oklch-lc-rectangle")
    return geometryDefinitions[projection.geometryId].keyboard(projection, action, coarse);
  return geometryDefinitions[projection.geometryId].keyboard(projection, action, coarse);
}

import { normalizeHue } from "../color/types.js";
import { resolveOklabDirectRange, authorOklabDirectCoordinate } from "./directCoordinate.js";
import { authorPlaneEdit } from "../picker/edit.js";
import { oklabCoordinatePlanePoint } from "../picker/keyboard.js";
import type { PlaneEditReference } from "../picker/edit.js";
import type { PlanePoint } from "../picker/geometry.js";
import type { ColorValue } from "../color/value.js";
import type { EditOperationDefinitions, EditorDefinition } from "./types/editingDefinitions.js";
import { geometryDefinitions } from "./geometryDefinitions.js";
import { createRgbChannelPatch, createRgbPointOperation } from "./rgbEditing.js";

export type { EditOperationDefinition, EditOperationId } from "./types/editingDefinitions.js";

const lchChannels = Object.freeze({ plane: "oklch", kind: "channels" } as const);
const labChannels = Object.freeze({ plane: "oklab", kind: "channels" } as const);
const lchPoint = Object.freeze({ plane: "oklch", kind: "point" } as const);
const labPoint = Object.freeze({ plane: "oklab", kind: "point" } as const);

/** Technical authorship only. Existing adapters keep their current bindings and references. */
export const editOperationDefinitions: EditOperationDefinitions = Object.freeze({
  "oklch-channel-patch": Object.freeze({
    id: "oklch-channel-patch",
    representationId: "oklch",
    kind: "channel-patch",
    geometryId: null,
    request: lchChannels,
    author: authorPlaneEdit,
  }),
  "oklch-hue-edit": Object.freeze({
    id: "oklch-hue-edit",
    representationId: "oklch",
    kind: "normalized-hue",
    geometryId: null,
    channelId: "oklch.h",
    patchOperationId: "oklch-channel-patch",
    request: lchChannels,
    normalize: normalizeHue,
    author: authorPlaneEdit,
  }),
  "oklch-lc-point": Object.freeze({
    id: "oklch-lc-point",
    representationId: "oklch",
    kind: "point",
    geometryId: "oklch-lc-rectangle",
    request: lchPoint,
    author: authorPlaneEdit,
  }),
  "oklab-channel-patch": Object.freeze({
    id: "oklab-channel-patch",
    representationId: "oklab",
    kind: "channel-patch",
    geometryId: null,
    request: labChannels,
    author: authorPlaneEdit,
  }),
  "oklab-ab-point": Object.freeze({
    id: "oklab-ab-point",
    representationId: "oklab",
    kind: "point",
    geometryId: "oklab-ab-disc",
    request: labPoint,
    author: authorPlaneEdit,
  }),
  "oklab-disc-coordinate": Object.freeze({
    id: "oklab-disc-coordinate",
    representationId: "oklab",
    kind: "disc-coordinate",
    geometryId: "oklab-ab-disc",
    bindings: Object.freeze({ "oklab.a": "a", "oklab.b": "b" }),
    pointOperationId: "oklab-ab-point",
    request: labPoint,
    toPoint: oklabCoordinatePlanePoint,
    directRange: resolveOklabDirectRange,
    authorCoordinate: authorOklabDirectCoordinate,
    author: authorPlaneEdit,
  }),
  "srgb-channel-patch": createRgbChannelPatch("srgb"),
  "display-p3-channel-patch": createRgbChannelPatch("display-p3"),
  "srgb-rg-point": createRgbPointOperation(
    "srgb-rg-point",
    geometryDefinitions["srgb-rg-rectangle"],
  ),
  "srgb-rb-point": createRgbPointOperation(
    "srgb-rb-point",
    geometryDefinitions["srgb-rb-rectangle"],
  ),
  "srgb-gb-point": createRgbPointOperation(
    "srgb-gb-point",
    geometryDefinitions["srgb-gb-rectangle"],
  ),
  "display-p3-rg-point": createRgbPointOperation(
    "display-p3-rg-point",
    geometryDefinitions["display-p3-rg-rectangle"],
  ),
  "display-p3-rb-point": createRgbPointOperation(
    "display-p3-rb-point",
    geometryDefinitions["display-p3-rb-rectangle"],
  ),
  "display-p3-gb-point": createRgbPointOperation(
    "display-p3-gb-point",
    geometryDefinitions["display-p3-gb-rectangle"],
  ),
});

/** The selected editor binds point authorship; adapters never infer it from a representation. */
export function authorEditorPoint(
  value: ColorValue,
  editor: EditorDefinition,
  point: PlanePoint,
  reference?: PlaneEditReference,
) {
  const operation = editOperationDefinitions[editor.pointOperationId];
  switch (operation.id) {
    case "oklch-lc-point":
      return operation.author(value, {
        ...operation.request,
        point,
        ...(reference ? { reference } : {}),
      });
    case "oklab-ab-point":
      return operation.author(value, { ...operation.request, point });
    case "srgb-rg-point":
      return operation.author(value, { ...operation.request, point });
    case "srgb-rb-point":
      return operation.author(value, { ...operation.request, point });
    case "srgb-gb-point":
      return operation.author(value, { ...operation.request, point });
    case "display-p3-rg-point":
      return operation.author(value, { ...operation.request, point });
    case "display-p3-rb-point":
      return operation.author(value, { ...operation.request, point });
    case "display-p3-gb-point":
      return operation.author(value, { ...operation.request, point });
  }
}

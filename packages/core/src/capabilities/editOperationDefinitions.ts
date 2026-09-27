import { normalizeHue } from "../color/types.js";
import { authorPlaneEdit } from "../picker/edit.js";
import { oklabCoordinatePlanePoint } from "../picker/keyboard.js";
import type { EditOperationDefinitions } from "./types/editingDefinitions.js";

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
    author: authorPlaneEdit,
  }),
});

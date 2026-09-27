import type { EditorDefinitions, EditorsByRepresentation } from "./types/editingDefinitions.js";

export type {
  EditorDefinition,
  EditorId,
  EditorsByRepresentation,
} from "./types/editingDefinitions.js";

export const editorDefinitions: EditorDefinitions = Object.freeze({
  "oklch-lc": Object.freeze({
    id: "oklch-lc",
    representationId: "oklch",
    geometryId: "oklch-lc-rectangle",
    pointOperationId: "oklch-lc-point",
  }),
  "oklab-ab": Object.freeze({
    id: "oklab-ab",
    representationId: "oklab",
    geometryId: "oklab-ab-disc",
    pointOperationId: "oklab-ab-point",
  }),
});

/** Static relation, independent of preferred editors, companions or selector exposure. */
export const editorsByRepresentation: EditorsByRepresentation = Object.freeze({
  oklch: Object.freeze([editorDefinitions["oklch-lc"].id]),
  oklab: Object.freeze([editorDefinitions["oklab-ab"].id]),
  srgb: Object.freeze([]),
  "display-p3": Object.freeze([]),
});

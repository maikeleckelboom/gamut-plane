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
  "srgb-rg": Object.freeze({
    id: "srgb-rg",
    representationId: "srgb",
    geometryId: "srgb-rg-rectangle",
    pointOperationId: "srgb-rg-point",
  }),
  "srgb-rb": Object.freeze({
    id: "srgb-rb",
    representationId: "srgb",
    geometryId: "srgb-rb-rectangle",
    pointOperationId: "srgb-rb-point",
  }),
  "srgb-gb": Object.freeze({
    id: "srgb-gb",
    representationId: "srgb",
    geometryId: "srgb-gb-rectangle",
    pointOperationId: "srgb-gb-point",
  }),
  "display-p3-rg": Object.freeze({
    id: "display-p3-rg",
    representationId: "display-p3",
    geometryId: "display-p3-rg-rectangle",
    pointOperationId: "display-p3-rg-point",
  }),
  "display-p3-rb": Object.freeze({
    id: "display-p3-rb",
    representationId: "display-p3",
    geometryId: "display-p3-rb-rectangle",
    pointOperationId: "display-p3-rb-point",
  }),
  "display-p3-gb": Object.freeze({
    id: "display-p3-gb",
    representationId: "display-p3",
    geometryId: "display-p3-gb-rectangle",
    pointOperationId: "display-p3-gb-point",
  }),
});

/** Static relation, independent of preferred editors, companions or selector exposure. */
export const editorsByRepresentation: EditorsByRepresentation = Object.freeze({
  oklch: Object.freeze([editorDefinitions["oklch-lc"].id]),
  oklab: Object.freeze([editorDefinitions["oklab-ab"].id]),
  srgb: Object.freeze(["srgb-rg", "srgb-rb", "srgb-gb"] as const),
  "display-p3": Object.freeze(["display-p3-rg", "display-p3-rb", "display-p3-gb"] as const),
});

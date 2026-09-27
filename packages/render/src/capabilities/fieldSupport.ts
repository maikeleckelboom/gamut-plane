import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
} from "@gamut-plane/core";
import {
  editorDefinitions,
  geometryDefinitions,
  type EditorDefinition,
  type GeometryDefinition,
} from "@gamut-plane/core/internal/capabilities";

/** Correlated technical geometry, with the existing combined sampler/plane for v0.3 callers. */
export type FieldSupport = {
  [E in EditorDefinition as E["id"]]: Readonly<{
    editorId: E["id"];
    geometry: GeometryDefinition<E["representationId"]>;
    // The legacy plane type has a broad id; identity/geometry compatibility is proved in tests.
    plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
  }>;
}[EditorDefinition["id"]];

const lch = editorDefinitions["oklch-lc"];
const lab = editorDefinitions["oklab-ab"];

/** Resolve once at presentation composition, never inside a field sample. */
export const fieldSupport: { readonly [F in FieldSupport as F["editorId"]]: F } = Object.freeze({
  "oklch-lc": Object.freeze({
    editorId: lch.id,
    geometry: geometryDefinitions[lch.geometryId],
    plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
  }),
  "oklab-ab": Object.freeze({
    editorId: lab.id,
    geometry: geometryDefinitions[lab.geometryId],
    plane: OKLAB_AB_PLANE,
  }),
});

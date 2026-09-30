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
import { createRgbFieldSampler, type NativeRgbFieldSampler } from "../rgbField.js";

/** Explicit renderer support is narrower than the technical editor inventory. */
type FieldEditor = Extract<
  EditorDefinition,
  {
    id:
      | "oklch-lc"
      | "oklab-ab"
      | "srgb-rg"
      | "srgb-rb"
      | "srgb-gb"
      | "display-p3-rg"
      | "display-p3-rb"
      | "display-p3-gb";
  }
>;

/** Correlates supported editor geometries with their existing field samplers. */
export type FieldSupport = {
  [E in FieldEditor as E["id"]]: Readonly<{
    editorId: E["id"];
    geometry: Extract<GeometryDefinition, { id: E["geometryId"] }>;
    // The low-level plane type has a broad id; identity/geometry compatibility is proved in tests.
    plane: E["representationId"] extends "srgb" | "display-p3"
      ? NativeRgbFieldSampler<
          Extract<
            GeometryDefinition,
            { id: E["geometryId"]; representationId: "srgb" | "display-p3" }
          >
        >
      : PickerPlaneGeometry & PickerPlaneFieldSampler;
  }>;
}[FieldEditor["id"]];

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
  "srgb-rg": Object.freeze({
    editorId: "srgb-rg",
    geometry: geometryDefinitions["srgb-rg-rectangle"],
    plane: createRgbFieldSampler(geometryDefinitions["srgb-rg-rectangle"]),
  }),
  "srgb-rb": Object.freeze({
    editorId: "srgb-rb",
    geometry: geometryDefinitions["srgb-rb-rectangle"],
    plane: createRgbFieldSampler(geometryDefinitions["srgb-rb-rectangle"]),
  }),
  "srgb-gb": Object.freeze({
    editorId: "srgb-gb",
    geometry: geometryDefinitions["srgb-gb-rectangle"],
    plane: createRgbFieldSampler(geometryDefinitions["srgb-gb-rectangle"]),
  }),
  "display-p3-rg": Object.freeze({
    editorId: "display-p3-rg",
    geometry: geometryDefinitions["display-p3-rg-rectangle"],
    plane: createRgbFieldSampler(geometryDefinitions["display-p3-rg-rectangle"]),
  }),
  "display-p3-rb": Object.freeze({
    editorId: "display-p3-rb",
    geometry: geometryDefinitions["display-p3-rb-rectangle"],
    plane: createRgbFieldSampler(geometryDefinitions["display-p3-rb-rectangle"]),
  }),
  "display-p3-gb": Object.freeze({
    editorId: "display-p3-gb",
    geometry: geometryDefinitions["display-p3-gb-rectangle"],
    plane: createRgbFieldSampler(geometryDefinitions["display-p3-gb-rectangle"]),
  }),
});

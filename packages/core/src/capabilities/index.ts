/** Unsupported internal sibling-package contract. Not a consumer capability API. */
export { representationDefinitions } from "./representationDefinitions.js";
export { spatialColorDefinition } from "./spatialColor.js";
export { editorDefinitions } from "./editorDefinitions.js";
export { geometryDefinitions, keyboardGeometryPoint } from "./geometryDefinitions.js";
export { authorEditorPoint, editOperationDefinitions } from "./editOperationDefinitions.js";
export { analyzeRequestedGamuts } from "./requestedGamuts.js";
export {
  convertLinearRgb,
  decodeRgbCoordinate,
  encodeRgbCoordinate,
  convertRgbReference,
  linearRgbToOklabBatch,
  RGB_NUMERIC_REVISION,
  MAX_RGB_BATCH_POINTS,
} from "./rgbConversion.js";
export type { RgbBatchError } from "./rgbConversion.js";
export type { RgbRepresentationId } from "./types/rgbEditing.js";
export { gamutRayCrossings, gamutRayIntervals } from "../gamut/boundaryTrace.js";
export type { GamutRayCrossing } from "../gamut/boundaryTrace.js";
export { assertOklchSample } from "../color/types.js";
export type { GamutCheckResult } from "./requestedGamuts.js";
export type {
  EditorDefinition,
  EditorId,
  GeometryDefinition,
  GeometryContract,
  GeometryId,
  GeometryProjection,
  BuiltinGeometryProjection,
  EditorContract,
  EditOperationDefinition,
  EditOperationId,
} from "./types/editingDefinitions.js";
export type {
  ChannelDefinition,
  ChannelId,
  RepresentationDefinition,
} from "./types/representationDefinitions.js";

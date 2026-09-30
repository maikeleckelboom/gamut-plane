/** Unsupported internal sibling-package contract. Not a consumer capability API. */
export { representationDefinitions } from "./representationDefinitions.js";
export { editorDefinitions } from "./editorDefinitions.js";
export { geometryDefinitions, keyboardGeometryPoint } from "./geometryDefinitions.js";
export { authorEditorPoint, editOperationDefinitions } from "./editOperationDefinitions.js";
export { analyzeRequestedGamuts } from "./requestedGamuts.js";
export {
  convertLinearRgb,
  decodeRgbCoordinate,
  encodeRgbCoordinate,
  convertRgbReference,
} from "./rgbConversion.js";
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

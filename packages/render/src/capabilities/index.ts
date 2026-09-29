/** Unsupported sibling-adapter contract. Not a public consumer capability API. */
export { resolveEditorVisualSupport, resolveField } from "./editorResolution.js";
export type {
  EditorVisualSupport,
  FieldResolution,
  ProductionProjection,
} from "./editorResolution.js";
export { resolveRequestedGuides } from "./guideResolution.js";
export type { GuideResolution } from "./guideResolution.js";
export { guideDefinitions, referenceGuidePolicy } from "./guideSupport.js";
export type { GuideId } from "./guideSupport.js";

export {
  assertOklabColor,
  assertOklchColor,
  copyColor,
  normalizeHue,
  type DisplayGamut,
  type OklabColor,
  type OklchColor,
} from "./color/types.js";
export {
  colorFromVector,
  colorToVector,
  convertFromOklch,
  convertOklabToOklch,
  convertOklchToOklab,
  isColorInGamut,
  toOklabColor,
  toOklchColor,
} from "./color/convert.js";
export {
  formatOklch,
  OKLCH_FORMAT_ALPHA_DECIMALS,
  OKLCH_FORMAT_CHROMA_DECIMALS,
  OKLCH_FORMAT_HUE_DECIMALS,
  OKLCH_FORMAT_LIGHTNESS_DECIMALS,
} from "./color/format.js";
export { serializeColor, serializeHexColor, type SerializationSpace } from "./color/serialize.js";
export { parseCssColor, UnsupportedColorInputError } from "./input/parseCssColor.js";
export {
  clearGamutBoundaryTableCache,
  findMaximumChroma,
  generateGamutBoundaryTable,
  getCachedGamutBoundaryTable,
  getGamutOutline,
  getMaximumChromaFromTable,
} from "./gamut/boundary.js";
export {
  GAMUT_EPSILON,
  type GamutBoundaryOptions,
  type GamutBoundaryTable,
} from "./gamut/types.js";
export {
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getPickerBoundaryAnalysis,
  getPickerGamutStatus,
  type BoundaryGuidePoint,
  type HueGamutInterval,
  type LightnessGamutInterval,
  type PickerBoundaryAnalysis,
  type PickerGamutBoundaryTables,
  type PickerGamutStatus,
  type PickerGamutStatusEntry,
  type TargetBoundaryAnalysis,
} from "./picker/analysis.js";
export {
  buildLightnessChromaBoundaryPath,
  buildOklabGamutContour,
  clampPlanePointToInstrumentBounds,
  constrainOklabPlanePoint,
  isPointInOklabInstrumentDomain,
  OKLAB_AB_PLANE,
  OKLAB_FIELD_COLUMN_SAMPLES,
  OKLAB_FIELD_ROW_COUNT,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  type PickerPlaneAxis,
  type PickerPlaneFieldSampling,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
  type PickerPlaneId,
  type PickerPlaneSampleScratch,
  type PlanePoint,
} from "./picker/plane.js";
export {
  authorPlaneEdit,
  projectColorToPlane,
  type ColorPlaneEdit,
  type ColorPlaneProjection,
  type PlaneEditError,
  type PlaneEditReference,
} from "./picker/edit.js";
export {
  keyboardPlanePoint,
  oklabCoordinatePlanePoint,
  type PickerPlaneKeyboardAction,
} from "./picker/keyboard.js";

export type { ColorResult } from "./result.js";
export type {
  ChannelsBySpace,
  ColorRepresentation,
  ColorSpaceId,
  GamutId,
} from "./color/representation.js";
export {
  createColorValue,
  definitionOf,
  definingEquals,
  isColorValue,
  type ColorValue,
  type DefinitionError,
} from "./color/value.js";
export { represent, type ConversionError } from "./color/represent.js";
export {
  restoreColor,
  snapshotColor,
  type ColorSnapshotV1,
  type SnapshotError,
  type SnapshotNumberV1,
} from "./color/snapshot.js";
export {
  analyzeGamut,
  type GamutAnalysis,
  type GamutAnalysisError,
  type GamutStatus,
} from "./gamut/analyze.js";
export {
  mapToGamut,
  type GamutMappingError,
  type GamutMappingMethod,
  type GamutMappingResult,
} from "./gamut/map.js";
export {
  parseCssValue,
  type CssColorSource,
  type CssInputError,
  type ParsedCssColor,
} from "./input/parseCssValue.js";
export {
  serializeCss,
  type CssOutput,
  type CssOutputError,
  type CssOutputPolicy,
} from "./output/css.js";
export { serializeHex, type HexOutput, type HexOutputError } from "./output/hex.js";

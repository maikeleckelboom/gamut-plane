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
export {
  OKLAB_AB_PLANE,
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
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
  type HueGuideInterval,
  type LightnessGuideInterval,
  type PickerGuide,
} from "./picker/analysis.js";
export { findMaximumChroma, generateGamutBoundaryTable } from "./gamut/boundary.js";
export type { GamutBoundaryOptions, GamutBoundaryTable } from "./gamut/types.js";

export { normalizeHue, type DisplayGamut, type OklchSample } from "./color/types.js";
export { convertOklabToOklch, convertOklchToOklab } from "./color/convert.js";
export { serializeOklchSample } from "./color/sampleCss.js";

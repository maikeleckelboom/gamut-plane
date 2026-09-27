export {
  gpPart,
  gpAttribute,
  gpMarker,
  gpAxis,
  gpChannel,
  gpGamut,
  gpView,
  gpStatus,
  type GpPart,
} from "./parts.js";
export { gamutWarningGlyph } from "./glyphs.js";
export {
  representationUi,
  editorUi,
  currentPrimaryEditors,
  currentViewOptions,
  currentEditorByView,
} from "./instrumentMetadata.js";
export {
  currentSelectionFacts,
  legacyCheckedGamuts,
  validateSelection,
  defaultSelection,
  selectionFromCurrentView,
  canonicalCheckedGamuts,
  canonicalVisibleGuides,
  validateInstrumentViewState,
  selectionsEqual,
  instrumentViewStatesEqual,
  type RepresentationId,
  type InstrumentSelection,
  type InstrumentViewState,
  type SelectionFacts,
  type StateResult,
  type StateIssue,
} from "./instrumentState.js";
export { mountRange, type RangeInput } from "./interaction/rangeInteraction.js";
export { mountNumericInput, type NumericInputState } from "./interaction/numericInteraction.js";
export {
  mountPlaneGesture,
  type PlaneGestureInput,
  type PlaneGestureBinding,
} from "./interaction/planeGesture.js";

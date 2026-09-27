import type { GamutId } from "@gamut-plane/core";
import type { EditorId, RepresentationDefinition } from "@gamut-plane/core/internal/capabilities";
import type { InstrumentSelection, InstrumentViewState } from "../src/instrumentState.js";

declare const selection: InstrumentSelection;
selection.representationId satisfies RepresentationDefinition["id"];
if (selection.editorId !== null) selection.editorId satisfies EditorId;
declare const state: InstrumentViewState<"srgb-boundary" | "display-p3-boundary">;
state.checkedGamuts[0] satisfies GamutId | undefined;
state.visibleGuides[0] satisfies "srgb-boundary" | "display-p3-boundary" | undefined;

const observationOnly: InstrumentSelection = { representationId: "oklch", editorId: null };
const rgbObservation: InstrumentSelection = { representationId: "srgb", editorId: null };
// @ts-expect-error representation identities are core-defined
const inventedRepresentation: InstrumentSelection = { representationId: "hsl", editorId: null };
// @ts-expect-error known editor belongs to OKLab, not OKLCH
const mismatched: InstrumentSelection = { representationId: "oklch", editorId: "oklab-ab" };
const inventedEditor: InstrumentSelection = {
  representationId: "oklch",
  // @ts-expect-error semantic edit operations are not editor identities
  editorId: "oklch-hue-edit",
};
// @ts-expect-error an RGB representation has no admitted current editor
const rgbEditor: InstrumentSelection = { representationId: "srgb", editorId: "oklch-lc" };
// @ts-expect-error arrays in accepted state are readonly
state.checkedGamuts.push("srgb-gamut");
// @ts-expect-error authored color is outside view state
void state.color;
// @ts-expect-error destination is outside ordinary view state
void state.mappingTarget;
// @ts-expect-error exact results are derived, not view state
void state.exactAnalysis;
void [
  observationOnly,
  rgbObservation,
  inventedRepresentation,
  mismatched,
  inventedEditor,
  rgbEditor,
];

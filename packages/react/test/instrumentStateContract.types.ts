import type { GamutId } from "@gamut-plane/core";
import type { EditorId, RepresentationDefinition } from "@gamut-plane/core/internal/capabilities";
import type { InstrumentSelection, InstrumentViewState } from "@gamut-plane/ui";
import type { GuideId } from "../../render/src/capabilities/guideSupport.js";

declare const state: InstrumentViewState<GuideId>;
state.selection.representationId satisfies RepresentationDefinition["id"];
if (state.selection.editorId !== null) state.selection.editorId satisfies EditorId;
state.checkedGamuts[0] satisfies GamutId | undefined;
state.visibleGuides[0] satisfies GuideId | undefined;

// @ts-expect-error current technical editor and representation must agree
const mismatched: InstrumentSelection = { representationId: "oklch", editorId: "oklab-ab" };
// @ts-expect-error render owns the exact guide ID union
const inventedGuide: GuideId = "rec2020-boundary";
// @ts-expect-error accepted arrays are readonly
state.visibleGuides.push("srgb-boundary");
// @ts-expect-error authored color is not product view state
void state.color;
// @ts-expect-error directional destination is not ordinary view state
void state.boundaryTarget;
void [mismatched, inventedGuide];

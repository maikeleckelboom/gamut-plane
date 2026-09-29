import type { GamutId } from "@gamut-plane/core";
import type { GuideId } from "@gamut-plane/render";
import type { InstrumentSelection, InstrumentViewState } from "@gamut-plane/ui";

export type GamutPlaneSelection = InstrumentSelection;
export type GamutPlaneGamutId = GamutId;
export type GamutPlaneGuideId = GuideId;
export type GamutPlaneState = InstrumentViewState<GamutPlaneGuideId>;

import type { GamutId } from "@gamut-plane/core";
import type { InstrumentViewState } from "@gamut-plane/ui";

/** Packed, skipLibCheck:false proof that UI's state declarations resolve without render types. */
declare const state: InstrumentViewState<"srgb-boundary" | "display-p3-boundary">;
state.checkedGamuts[0] satisfies GamutId | undefined;
state.visibleGuides[0] satisfies "srgb-boundary" | "display-p3-boundary" | undefined;

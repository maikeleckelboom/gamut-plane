import type {
  GamutPlaneGamutId,
  GamutPlaneGuideId,
  GamutPlaneSelection,
  GamutPlaneState,
} from "../src/index.js";

declare const state: GamutPlaneState;
state.checkedGamuts[0] satisfies GamutPlaneGamutId | undefined;
state.visibleGuides[0] satisfies GamutPlaneGuideId | undefined;
const admitted: GamutPlaneSelection = { representationId: "oklch", editorId: "oklch-lc" };
const inspection: GamutPlaneSelection = { representationId: "oklch", editorId: null };
// @ts-expect-error editor and representation are one correlated selection
const mismatched: GamutPlaneSelection = { representationId: "srgb", editorId: "oklch-lc" };
const technicalOnly: GamutPlaneSelection = {
  representationId: "oklch",
  // @ts-expect-error technical editor is not product admitted
  editorId: "test-oklch-hc",
};
// @ts-expect-error requested guides cannot be mutated
state.visibleGuides.push("srgb-boundary");
// @ts-expect-error mapping destination is not ordinary instrument state
void state.destination;
void [admitted, inspection, mismatched, technicalOnly];

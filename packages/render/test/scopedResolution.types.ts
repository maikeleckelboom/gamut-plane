import type { ColorValue, ConversionError, GamutAnalysisError } from "@gamut-plane/core";
import type { EditorId, GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import type { GuideId } from "../src/capabilities/guideSupport.js";

declare const value: ColorValue;
declare const editorId: EditorId | null;
declare const guides: readonly GuideId[];
declare const checks: readonly GamutCheckResult[];
const context = resolveEditorVisualSupport(editorId);
const field = resolveField(value, context);
if (field.kind === "value-unavailable" && field.reason === "projection-failed")
  field.error satisfies ConversionError;
const rows = resolveRequestedGuides(value, context, guides, checks);
for (const row of rows) {
  row.guideId satisfies GuideId;
  if (row.kind === "resolved" && row.forms.targetMarker.kind === "exact-unavailable")
    row.forms.targetMarker.error satisfies GamutAnalysisError;
}
// @ts-expect-error field resolution only admits core EditorId, not a representation
resolveEditorVisualSupport("srgb");
// @ts-expect-error hypothetical editors cannot masquerade as existing visual support
resolveEditorVisualSupport("oklch-hl");
// @ts-expect-error product metadata or view state is not the render input boundary
resolveEditorVisualSupport({ representationId: "oklch", editorId: "oklch-lc" });
// @ts-expect-error render GuideId is independent of core GamutId
resolveRequestedGuides(value, context, ["srgb-gamut"], checks);
// @ts-expect-error new resolution does not expand the public render entry
export type RootResolver = typeof import("../src/index.js").resolveField;

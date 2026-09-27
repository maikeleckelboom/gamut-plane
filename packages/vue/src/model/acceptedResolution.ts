import { represent, type ColorValue, type PickerPlaneId } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import {
  guideDefinitions,
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
  type GuideId,
} from "@gamut-plane/render/internal/capabilities";
import {
  legacyCheckedGamuts,
  selectionFromCurrentView,
  type InstrumentViewState,
} from "@gamut-plane/ui";

/** Only accepted legacy state enters this bridge. Target and Canvas readiness are separate. */
export function legacyViewState(
  view: PickerPlaneId,
  showSrgbBoundary: boolean,
  showDisplayP3Boundary: boolean,
): InstrumentViewState<GuideId> {
  return Object.freeze({
    selection: selectionFromCurrentView(view),
    checkedGamuts: legacyCheckedGamuts,
    visibleGuides: Object.freeze([
      ...(showDisplayP3Boundary ? [guideDefinitions["display-p3-boundary"].id] : []),
      ...(showSrgbBoundary ? [guideDefinitions["srgb-boundary"].id] : []),
    ]),
  });
}

/** Values alone cannot identify an editor, including two editors of the same representation. */
export function semanticContextKey(
  selection: Readonly<{
    representationId: string;
    editorId: string | null;
  }>,
): string {
  return `${selection.representationId}:${selection.editorId ?? "none"}`;
}

/** Synchronous provenance boundary: callers cannot supply independently retained exact rows. */
export function resolveAcceptedRevision(source: ColorValue, state: InstrumentViewState<GuideId>) {
  const observation = represent(source, state.selection.representationId);
  const checks = analyzeRequestedGamuts(source, state.checkedGamuts);
  const editor = resolveEditorVisualSupport(state.selection.editorId);
  const field = resolveField(source, editor);
  const guides = resolveRequestedGuides(source, editor, state.visibleGuides, checks);
  return Object.freeze({
    source,
    state,
    contextKey: semanticContextKey(state.selection),
    observation,
    checks,
    editor,
    field,
    guides,
  });
}

import { represent, type ColorValue } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
  type GuideId,
} from "@gamut-plane/render/internal/capabilities";
import { semanticContextKey, type InstrumentViewState } from "@gamut-plane/ui";

/** Synchronous provenance boundary: callers cannot supply independently retained exact rows. */
export function resolveAcceptedRevision(source: ColorValue, state: InstrumentViewState<GuideId>) {
  const observation = represent(source, state.selection.representationId);
  const checks = analyzeRequestedGamuts(source, state.checkedGamuts);
  const editor = resolveEditorVisualSupport(state.selection.editorId);
  const field = resolveField(source, editor);
  const guides = resolveRequestedGuides(source, editor, state.visibleGuides);
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

import { definitionOf, type ColorSpaceId } from "@gamut-plane/core";
import type { resolveAcceptedRevision } from "./acceptedResolution.js";

type AcceptedResolutionRevision = ReturnType<typeof resolveAcceptedRevision>;

export type AcceptedPresentationView = Readonly<{
  authored: Readonly<{ representationId: ColorSpaceId; alpha: number }>;
  selection: AcceptedResolutionRevision["state"]["selection"];
  observation: AcceptedResolutionRevision["observation"];
  exactChecks: AcceptedResolutionRevision["checks"];
  editor: AcceptedResolutionRevision["editor"];
  field: AcceptedResolutionRevision["field"];
  guides: AcceptedResolutionRevision["guides"];
}>;

/** Borrow the accepted facts without resolving or serializing them again. */
export function presentAcceptedRevision(
  revision: AcceptedResolutionRevision,
): AcceptedPresentationView {
  const definition = definitionOf(revision.source);
  return Object.freeze({
    authored: Object.freeze({ representationId: definition.space, alpha: definition.alpha }),
    selection: revision.state.selection,
    observation: revision.observation,
    exactChecks: revision.checks,
    editor: revision.editor,
    field: revision.field,
    guides: revision.guides,
  });
}

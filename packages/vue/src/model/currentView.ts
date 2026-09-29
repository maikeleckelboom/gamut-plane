import type { PickerPlaneId } from "@gamut-plane/core";
import type { AcceptedPresentationView } from "./acceptedPresentation.js";

/** The public instrument admits exactly these two accepted primary selections. */
export function currentView(selection: AcceptedPresentationView["selection"]): PickerPlaneId {
  if (selection.representationId === "oklch" && selection.editorId === "oklch-lc") return "oklch";
  if (selection.representationId === "oklab" && selection.editorId === "oklab-ab") return "oklab";
  throw new Error("Accepted selection is not a current editable instrument context");
}

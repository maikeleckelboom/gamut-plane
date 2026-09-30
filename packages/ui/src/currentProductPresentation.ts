import type { PlanePoint } from "@gamut-plane/core";
import type { EditorId, GeometryDefinition } from "@gamut-plane/core/internal/capabilities";

export const currentEditorCopy = Object.freeze({
  hueMissing: "Hue is unset. Edit Hue to choose a direction.",
  chromaMissingHue: "Set Hue before increasing chroma.",
  chromaOverflow:
    "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value.",
  discOverflow:
    "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved.",
  rgbOverflow:
    "Selected RGB coordinates are outside the area. The marker may be clipped; use the numeric fields to edit the full values.",
});

/** Authored presentation is separate from constrained pointer/keyboard interaction. */
export function authoredMarkerPoint(
  geometry: Pick<GeometryDefinition, "representationId" | "constrain">,
  point: PlanePoint,
): PlanePoint {
  return geometry.representationId === "srgb" || geometry.representationId === "display-p3"
    ? point
    : geometry.constrain(point);
}

/** Current editor copy and interpretation, independent of render's visual facts. */
export function currentEditorHelp(
  editorId: EditorId,
  domainKind: "rectangle" | "disc",
  hueMissing: boolean,
  markerInDomain: boolean,
) {
  return {
    hueHelp: editorId === "oklch-lc" && hueMissing ? currentEditorCopy.hueMissing : undefined,
    chromaHelp:
      editorId !== "oklch-lc"
        ? undefined
        : hueMissing
          ? currentEditorCopy.chromaMissingHue
          : !markerInDomain
            ? currentEditorCopy.chromaOverflow
            : undefined,
    domainHelp: !markerInDomain
      ? domainKind === "disc"
        ? currentEditorCopy.discOverflow
        : editorId !== "oklch-lc" && editorId !== "oklab-ab"
          ? currentEditorCopy.rgbOverflow
          : undefined
      : undefined,
  };
}

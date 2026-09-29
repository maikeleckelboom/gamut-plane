import type { EditorId } from "@gamut-plane/core/internal/capabilities";

export const currentEditorCopy = Object.freeze({
  hueMissing: "Hue is unset. Edit Hue to choose a direction.",
  chromaMissingHue: "Set Hue before increasing chroma.",
  chromaOverflow:
    "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value.",
  discOverflow:
    "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved.",
});

/** Current two-editor copy and interpretation, independent of render's visual facts. */
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
    domainHelp:
      domainKind === "disc" && !markerInDomain ? currentEditorCopy.discOverflow : undefined,
  };
}

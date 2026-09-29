import type { DisplayGamut, GamutStatus, PickerPlaneId } from "@gamut-plane/core";
import { targetGamutUi } from "./instrumentMetadata.js";

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
  view: PickerPlaneId,
  hueMissing: boolean,
  markerInDomain: boolean,
) {
  return {
    hueHelp: view === "oklch" && hueMissing ? currentEditorCopy.hueMissing : undefined,
    chromaHelp:
      view !== "oklch"
        ? undefined
        : hueMissing
          ? currentEditorCopy.chromaMissingHue
          : !markerInDomain
            ? currentEditorCopy.chromaOverflow
            : undefined,
    domainHelp: view === "oklab" && !markerInDomain ? currentEditorCopy.discOverflow : undefined,
  };
}

/** The current two-label warning/target UI presents the tolerance fringe as inside. */
export function currentWarningVisible(displayP3Status: GamutStatus): boolean {
  return displayP3Status === "outside";
}

export const currentTargetCopy = Object.freeze({
  heading: "Target",
  guideChroma: "Guide C",
  guideDelta: "ΔC",
  inside: "Inside",
  outside: "Outside",
  warning: "Outside Display P3",
});

interface TargetVisualFacts {
  readonly maximumChroma: number;
  readonly deltaC: number;
  readonly swatchCss: string;
  readonly targetGuideCss: string;
  readonly marker: Readonly<{ chroma: number; position: number }> | null;
}

/** Product labels, accessible copy and decimal policy over primitive render facts. */
export function currentTargetPresentation(
  target: DisplayGamut,
  status: GamutStatus,
  visual: TargetVisualFacts,
) {
  const targetLabel = targetGamutUi[target].label;
  const markers = visual.marker
    ? [
        {
          id: `${target}-target-guide`,
          label: `${targetLabel} sampled target guide C ${visual.marker.chroma.toFixed(4)}`,
          position: visual.marker.position,
          tone: "guide" as const,
          lane: target,
          cssColor: visual.targetGuideCss,
        },
      ]
    : [];
  return {
    targetGuideLabel: `${targetLabel} sampled target guide`,
    markers,
    accessibleLabel: `${targetLabel} target boundary result`,
    swatchLabel: `${targetLabel} sampled boundary-guide color ${visual.swatchCss}`,
    displayStatus: status === "outside" ? currentTargetCopy.outside : currentTargetCopy.inside,
    displayTone: status === "outside" ? ("outside" as const) : ("inside" as const),
    targetResult: {
      target,
      targetLabel,
      status,
      guideChroma: visual.maximumChroma.toFixed(4),
      guideDelta: visual.deltaC.toFixed(4),
      showGuideDelta: visual.deltaC > 0,
      swatchCss: visual.swatchCss,
    },
  };
}

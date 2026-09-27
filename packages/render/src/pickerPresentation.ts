import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  normalizeHue,
  projectColorToPlane,
  serializeColor,
  type ColorValue,
  type DisplayGamut,
  type OklchColor,
  type PickerPlaneId,
} from "@gamut-plane/core";
import {
  displayGamutLabel,
  getBoundaryPresentation,
  type BoundaryGuideVisibility,
} from "./boundaryPresentation.js";
import { colorGradient } from "./presentation.js";

export const hueGradient = colorGradient(72, (position) => ({
  l: 0.8,
  c: OKLCH_PICKER_MAX_CHROMA,
  h: position * 360,
  alpha: 1,
}));

/** Pure visual facts for either adapter. The input ColorValue remains the only authored color. */
export function createPickerPresentation(
  value: ColorValue,
  view: PickerPlaneId,
  boundaryTarget: DisplayGamut,
  visibility: BoundaryGuideVisibility,
) {
  const oklch = projectColorToPlane(value, "oklch");
  const oklab = projectColorToPlane(value, "oklab");
  if (!oklch.ok || !oklab.ok) {
    throw new RangeError("Selected color cannot be projected into the instrument");
  }
  const plane = view === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE;
  const active = view === "oklab" ? oklab.value : oklch.value;
  const [l, c, observedHue] = oklch.value.representation.channels;
  // A hue-less observation stays hue-less. Only visual sampling needs a numeric slice.
  const fieldHue = observedHue ?? 0;
  const sample: OklchColor = { l, c, h: fieldHue, alpha: oklch.value.representation.alpha };
  const boundary = getBoundaryPresentation(sample, view, boundaryTarget, visibility);
  const { status, target } = boundary.analysis;
  const targetLabel = displayGamutLabel(target.target);
  const projection =
    view === "oklch"
      ? { point: active.point, x: c, y: l, fixed: fieldHue }
      : {
          point: active.point,
          x: oklab.value.representation.channels[1],
          y: oklab.value.representation.channels[2],
          fixed: oklab.value.representation.channels[0],
        };
  const activeCss = serializeColor(sample);

  return {
    plane,
    projection,
    oklch: oklch.value.representation,
    oklab: oklab.value,
    fieldHue,
    activeCss,
    markerCss: serializeColor({ ...sample, alpha: 1 }),
    projectionPoint: boundary.projectionPoint,
    projectionCss: boundary.projectionCss,
    projectionLabel: `${targetLabel} target boundary projection`,
    markers: boundary.markers,
    hueIntervals: boundary.hueIntervals,
    lightnessIntervals: boundary.lightnessIntervals,
    chromaIntervals: boundary.chromaIntervals,
    targetResult: {
      target: target.target,
      targetLabel,
      inGamut: target.inGamut,
      guideChroma: target.boundaryGuide.chroma.toFixed(4),
      guideDelta: target.guideDeltaC.toFixed(4),
      showGuideDelta: target.guideDeltaC > 0,
      swatchCss: serializeColor(target.boundaryGuide.color),
    },
    warningVisible: !status.displayP3.inGamut,
    huePosition: normalizeHue(fieldHue) / 360,
    chromaPosition: Math.min(1, Math.max(0, c / OKLCH_PICKER_MAX_CHROMA)),
    lightnessGradient: colorGradient(12, (position) => ({ ...sample, l: position, alpha: 1 })),
    chromaGradient: colorGradient(12, (position) => ({
      ...sample,
      c: position * OKLCH_PICKER_MAX_CHROMA,
      alpha: 1,
    })),
    fixedLightnessGradient: colorGradient(12, (position) => ({ ...sample, l: position })),
    hueHelp: observedHue === null ? "Hue is unset. Edit Hue to choose a direction." : undefined,
    chromaHelp:
      observedHue === null
        ? "Set Hue before increasing chroma."
        : !OKLCH_LIGHTNESS_CHROMA_PLANE.isPointInInstrumentDomain(oklch.value.point)
          ? "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value."
          : undefined,
    domainHelp: !OKLAB_AB_PLANE.isPointInInstrumentDomain(oklab.value.point)
      ? "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved."
      : undefined,
  };
}

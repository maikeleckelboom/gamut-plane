import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  analyzeGamut,
  convertOklabToOklch,
  normalizeHue,
  projectColorToPlane,
  serializeOklchSample,
  type ColorValue,
  type DisplayGamut,
  type GamutStatus,
  type OklchSample,
  type PickerPlaneId,
} from "@gamut-plane/core";
import {
  displayGamutLabel,
  getBoundaryPresentation,
  type BoundaryGuideVisibility,
} from "./boundaryPresentation.js";
import { colorGradient } from "./presentation.js";

// CSS-only gradient precision keeps converted C/H stable across SSR and hydration.
const GRADIENT_SIGNIFICANT_DIGITS = 12;

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
  const [, observedA, observedB] = oklab.value.representation.channels;
  // A hue-less observation stays hue-less. Only visual sampling needs a numeric slice.
  const fieldHue = observedHue ?? 0;
  const sample: OklchSample = { l, c, h: fieldHue, alpha: oklch.value.representation.alpha };
  const srgbAnalysis = analyzeGamut(value, "srgb-gamut");
  const displayP3Analysis = analyzeGamut(value, "display-p3-gamut");
  if (!srgbAnalysis.ok || !displayP3Analysis.ok) {
    throw new RangeError("Selected color cannot be analyzed for picker gamut status");
  }
  const gamutStatus = {
    srgb: srgbAnalysis.value.status,
    displayP3: displayP3Analysis.value.status,
  };
  const boundary = getBoundaryPresentation(sample, view, boundaryTarget, visibility, gamutStatus);
  const targetGuide = boundary.targetGuide;
  const targetStatus: GamutStatus =
    boundaryTarget === "srgb" ? gamutStatus.srgb : gamutStatus.displayP3;
  const targetLabel = displayGamutLabel(boundaryTarget);
  const projection =
    view === "oklch"
      ? { point: active.point, x: c, y: l, fixed: fieldHue }
      : {
          point: active.point,
          x: oklab.value.representation.channels[1],
          y: oklab.value.representation.channels[2],
          fixed: oklab.value.representation.channels[0],
        };
  const activeCss = serializeOklchSample(sample);

  return {
    plane,
    projection,
    oklch: oklch.value.representation,
    oklab: oklab.value,
    gamutStatus,
    fieldHue,
    activeCss,
    markerCss: serializeOklchSample({ ...sample, alpha: 1 }),
    targetGuidePoint: boundary.targetGuidePoint,
    targetGuideCss: boundary.targetGuideCss,
    targetGuideLabel: `${targetLabel} sampled target guide`,
    markers: boundary.markers,
    hueIntervals: boundary.hueIntervals,
    lightnessIntervals: boundary.lightnessIntervals,
    chromaIntervals: boundary.chromaIntervals,
    // The two-label picker UI treats inside and within-tolerance as visually contained.
    targetResult: {
      target: boundaryTarget,
      targetLabel,
      status: targetStatus,
      guideChroma: targetGuide.maximumChroma.toFixed(4),
      guideDelta: targetGuide.deltaC.toFixed(4),
      showGuideDelta: targetGuide.deltaC > 0,
      swatchCss: serializeOklchSample(targetGuide.color),
    },
    // Tolerance fringe is visually contained, matching the former epsilon-based warning policy.
    warningVisible: gamutStatus.displayP3 === "outside",
    huePosition: normalizeHue(fieldHue) / 360,
    chromaPosition: Math.min(1, Math.max(0, c / OKLCH_PICKER_MAX_CHROMA)),
    hueGradient: colorGradient(72, (position) => ({ ...sample, h: position * 360, alpha: 1 })),
    lightnessGradient: colorGradient(12, (position) => ({ ...sample, l: position, alpha: 1 })),
    chromaGradient: colorGradient(12, (position) => ({
      ...sample,
      c: position * OKLCH_PICKER_MAX_CHROMA,
      alpha: 1,
    })),
    fixedLightnessGradient: colorGradient(12, (position) => {
      const [stopL, stopC, stopH] = convertOklabToOklch([position, observedA, observedB]);
      return {
        l: stopL!,
        c: Number(stopC!.toPrecision(GRADIENT_SIGNIFICANT_DIGITS)),
        h: Number(stopH!.toPrecision(GRADIENT_SIGNIFICANT_DIGITS)),
        alpha: oklab.value.representation.alpha,
      };
    }),
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

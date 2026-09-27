import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  normalizeHue,
  projectColorToPlane,
  serializeColor,
  type ColorValue,
  type DisplayGamut,
} from "@gamut-plane/core";
import {
  colorGradient,
  displayGamutLabel,
  getBoundaryPresentation,
  observePickerPresentationColor,
  type BoundaryGuideVisibility,
} from "@gamut-plane/render";
import type { GamutPlaneView } from "../GamutPlane.js";

export function instrumentModel(
  value: ColorValue,
  view: GamutPlaneView,
  boundaryTarget: DisplayGamut,
  visibility: BoundaryGuideVisibility,
) {
  const plane = view === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE;
  const presentationColor = observePickerPresentationColor(value);
  const active = projectColorToPlane(value, view);
  const oklchProjection = projectColorToPlane(value, "oklch");
  const oklabProjection = projectColorToPlane(value, "oklab");
  if (!active.ok || !oklchProjection.ok || !oklabProjection.ok) {
    throw new RangeError("Selected color cannot be projected into the instrument");
  }
  const projection =
    view === "oklch"
      ? {
          point: active.value.point,
          x: oklchProjection.value.representation.channels[1],
          y: oklchProjection.value.representation.channels[0],
          fixed: presentationColor.h,
        }
      : {
          point: active.value.point,
          x: oklabProjection.value.representation.channels[1],
          y: oklabProjection.value.representation.channels[2],
          fixed: oklabProjection.value.representation.channels[0],
        };
  const isOutsideOklchInstrumentDomain = !OKLCH_LIGHTNESS_CHROMA_PLANE.isPointInInstrumentDomain(
    oklchProjection.value.point,
  );
  const isOutsideOklabInstrumentDomain = !OKLAB_AB_PLANE.isPointInInstrumentDomain(
    oklabProjection.value.point,
  );
  const boundary = getBoundaryPresentation(presentationColor, view, boundaryTarget, visibility);
  const { status, target } = boundary.analysis;
  const targetLabel = displayGamutLabel(target.target);
  return {
    plane,
    projection,
    presentationColor,
    oklch: oklchProjection.value.representation,
    oklab: oklabProjection.value,
    projectionColor: boundary.projectionColor,
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
    huePosition: normalizeHue(presentationColor.h) / 360,
    chromaPosition: Math.min(1, Math.max(0, presentationColor.c / OKLCH_PICKER_MAX_CHROMA)),
    style: {
      "--picker-active": serializeColor(presentationColor),
    },
    lightnessGradient: colorGradient(12, (position) => ({
      ...presentationColor,
      l: position,
      alpha: 1,
    })),
    chromaGradient: colorGradient(12, (position) => ({
      ...presentationColor,
      c: position * OKLCH_PICKER_MAX_CHROMA,
      alpha: 1,
    })),
    fixedLightnessGradient: colorGradient(12, (position) =>
      OKLAB_AB_PLANE.editFixedAxis(presentationColor, position),
    ),
    chromaHelp: isOutsideOklchInstrumentDomain
      ? "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value."
      : undefined,
    domainHelp: isOutsideOklabInstrumentDomain
      ? "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved."
      : undefined,
  };
}
export const hueGradient = colorGradient(72, (position) => ({
  l: 0.8,
  c: OKLCH_PICKER_MAX_CHROMA,
  h: position * 360,
  alpha: 1,
}));

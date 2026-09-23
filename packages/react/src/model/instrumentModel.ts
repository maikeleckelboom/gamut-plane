import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  normalizeHue,
  serializeColor,
  type DisplayGamut,
  type OklchColor,
} from "@gamut-plane/core";
import {
  colorGradient,
  displayGamutLabel,
  getBoundaryPresentation,
  type BoundaryGuideVisibility,
} from "@gamut-plane/render";
import type { GamutPlaneView } from "../GamutPlane.js";

export function instrumentModel(
  value: OklchColor,
  view: GamutPlaneView,
  boundaryTarget: DisplayGamut,
  visibility: BoundaryGuideVisibility,
) {
  const plane = view === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE;
  const projection = plane.project(value);
  const oklchProjection = OKLCH_LIGHTNESS_CHROMA_PLANE.project(value);
  const oklabProjection = OKLAB_AB_PLANE.project(value);
  const isOutsideOklchInstrumentDomain = !OKLCH_LIGHTNESS_CHROMA_PLANE.isPointInInstrumentDomain(
    oklchProjection.point,
  );
  const isOutsideOklabInstrumentDomain = !OKLAB_AB_PLANE.isPointInInstrumentDomain(
    oklabProjection.point,
  );
  const boundary = getBoundaryPresentation(value, view, boundaryTarget, visibility);
  const { status, target } = boundary.analysis;
  const targetLabel = displayGamutLabel(target.target);
  return {
    plane,
    projection,
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
    huePosition: normalizeHue(value.h) / 360,
    chromaPosition: Math.min(1, Math.max(0, value.c / OKLCH_PICKER_MAX_CHROMA)),
    style: {
      "--picker-active": serializeColor(value),
    },
    lightnessGradient: colorGradient(12, (position) => ({ ...value, l: position, alpha: 1 })),
    chromaGradient: colorGradient(12, (position) => ({
      ...value,
      c: position * OKLCH_PICKER_MAX_CHROMA,
      alpha: 1,
    })),
    fixedLightnessGradient: colorGradient(12, (position) =>
      OKLAB_AB_PLANE.editFixedAxis(value, position),
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

export function editChannel(value: OklchColor, channel: "l" | "c" | "h", next: number): OklchColor {
  return { ...value, [channel]: channel === "h" ? normalizeHue(next) : next };
}
export function editCoordinate(value: OklchColor, coordinate: "a" | "b", next: number): OklchColor {
  const plane = OKLAB_AB_PLANE;
  const projection = plane.project(value);
  const a = Math.min(
    plane.xAxis.max,
    Math.max(plane.xAxis.min, coordinate === "a" ? next : projection.x),
  );
  const b = Math.min(
    plane.yAxis.max,
    Math.max(plane.yAxis.min, coordinate === "b" ? next : projection.y),
  );
  return plane.unproject(
    {
      x: (a - plane.xAxis.min) / (plane.xAxis.max - plane.xAxis.min),
      y: 1 - (b - plane.yAxis.min) / (plane.yAxis.max - plane.yAxis.min),
    },
    projection.fixed,
    value,
  );
}

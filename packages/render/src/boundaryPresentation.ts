import {
  OKLCH_PICKER_MAX_CHROMA,
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  convertOklchToOklab,
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getPickerBoundaryAnalysis,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  serializeColor,
  type DisplayGamut,
  type OklchColor,
  type PickerPlaneId,
  type PlanePoint,
} from "@gamut-plane/core";
import type { LinearControlInterval, LinearControlMarker } from "./channelGeometry.js";
import { PICKER_GAMUT_TABLES } from "./generated/gamutTables.js";

export interface BoundaryGuideVisibility {
  srgb: boolean;
  displayP3: boolean;
}

export interface BoundaryPresentation {
  analysis: ReturnType<typeof getPickerBoundaryAnalysis>;
  projectionPoint: PlanePoint | null;
  projectionCss: string;
  markers: LinearControlMarker[];
  hueIntervals: LinearControlInterval[];
  lightnessIntervals: LinearControlInterval[];
  chromaIntervals: LinearControlInterval[];
}

function visibleGamuts(visibility: BoundaryGuideVisibility): DisplayGamut[] {
  return (["display-p3", "srgb"] as const).filter((gamut) =>
    gamut === "srgb" ? visibility.srgb : visibility.displayP3,
  );
}

function tableFor(gamut: DisplayGamut) {
  return gamut === "srgb" ? PICKER_GAMUT_TABLES.srgb : PICKER_GAMUT_TABLES.displayP3;
}

function statusFor(analysis: BoundaryPresentation["analysis"], gamut: DisplayGamut) {
  return gamut === "srgb" ? analysis.status.srgb : analysis.status.displayP3;
}

function gamutLabel(gamut: DisplayGamut): string {
  return gamut === "srgb" ? "sRGB" : "Display P3";
}

function positionProjection(color: OklchColor, view: PickerPlaneId): PlanePoint {
  if (view === "oklch") {
    return OKLCH_LIGHTNESS_CHROMA_PLANE.constrainPoint(
      oklchCoordinatesToPlanePoint(color.l, color.c),
    );
  }
  const coordinates = convertOklchToOklab(color);
  return OKLAB_AB_PLANE.constrainPoint(
    oklabCoordinatesToPlanePoint(coordinates[1]!, coordinates[2]!),
  );
}

/** Shared target and visible-guide presentation for the Vue and React adapters. */
export function getBoundaryPresentation(
  color: OklchColor,
  view: PickerPlaneId,
  target: DisplayGamut,
  visibility: BoundaryGuideVisibility,
): BoundaryPresentation {
  const analysis = getPickerBoundaryAnalysis(color, target, PICKER_GAMUT_TABLES);
  const gamuts = visibleGamuts(visibility);
  const targetVisible = target === "srgb" ? visibility.srgb : visibility.displayP3;
  const projectionColor = targetVisible ? (analysis.target.projection?.color ?? null) : null;
  const projectionCss = projectionColor ? serializeColor({ ...projectionColor, alpha: 1 }) : "";
  const projectionPoint = projectionColor ? positionProjection(projectionColor, view) : null;
  const markers: LinearControlMarker[] = [];
  if (analysis.target.projection && targetVisible) {
    markers.push({
      id: `${target}-boundary-projection`,
      label: `${gamutLabel(target)} target boundary projection C ${analysis.target.projection.chroma.toFixed(4)}`,
      position: analysis.target.projection.position,
      tone: "projection",
      lane: target,
      cssColor: projectionCss,
    });
  }

  function intervals(
    get: typeof getHueGamutIntervals | typeof getLightnessGamutIntervals,
  ): LinearControlInterval[] {
    return gamuts.flatMap((gamut) =>
      get(tableFor(gamut), color).map((interval) => ({ ...interval, tone: gamut })),
    );
  }

  return {
    analysis,
    projectionPoint,
    projectionCss,
    markers,
    hueIntervals: view === "oklch" ? intervals(getHueGamutIntervals) : [],
    lightnessIntervals: intervals(getLightnessGamutIntervals),
    chromaIntervals: gamuts.map((gamut) => ({
      start: 0,
      end: Math.min(
        1,
        Math.max(0, statusFor(analysis, gamut).interpolatedMaximumChroma / OKLCH_PICKER_MAX_CHROMA),
      ),
      tone: gamut,
    })),
  };
}

export function displayGamutLabel(gamut: DisplayGamut): string {
  return gamutLabel(gamut);
}

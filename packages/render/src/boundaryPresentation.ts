import {
  OKLCH_PICKER_MAX_CHROMA,
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  convertOklchToOklab,
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getPickerGuide,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  serializeColor,
  type DisplayGamut,
  type GamutStatus,
  type OklchColor,
  type PickerGuide,
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
  guides: Readonly<{ srgb: PickerGuide; displayP3: PickerGuide }>;
  targetGuide: PickerGuide;
  targetGuidePoint: PlanePoint | null;
  targetGuideCss: string;
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

function guideFor(guides: BoundaryPresentation["guides"], gamut: DisplayGamut): PickerGuide {
  return gamut === "srgb" ? guides.srgb : guides.displayP3;
}

function gamutLabel(gamut: DisplayGamut): string {
  return gamut === "srgb" ? "sRGB" : "Display P3";
}

function positionGuide(color: OklchColor, view: PickerPlaneId): PlanePoint {
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
  exactStatus: Readonly<{ srgb: GamutStatus; displayP3: GamutStatus }>,
): BoundaryPresentation {
  const guides = {
    srgb: getPickerGuide(color, PICKER_GAMUT_TABLES.srgb),
    displayP3: getPickerGuide(color, PICKER_GAMUT_TABLES.displayP3),
  };
  const targetGuide = guideFor(guides, target);
  const gamuts = visibleGamuts(visibility);
  const targetVisible = target === "srgb" ? visibility.srgb : visibility.displayP3;
  // Only exact outside status creates a marker. The table supplies its visual coordinate.
  const showTargetGuide =
    targetVisible && exactStatus[target === "srgb" ? "srgb" : "displayP3"] === "outside";
  const markerColor = showTargetGuide
    ? { ...color, c: Math.min(color.c, targetGuide.maximumChroma) }
    : null;
  const targetGuideCss = markerColor ? serializeColor({ ...markerColor, alpha: 1 }) : "";
  const targetGuidePoint = markerColor ? positionGuide(markerColor, view) : null;
  const markers: LinearControlMarker[] = [];
  if (markerColor) {
    markers.push({
      id: `${target}-target-guide`,
      label: `${gamutLabel(target)} sampled target guide C ${markerColor.c.toFixed(4)}`,
      position: Math.min(1, Math.max(0, markerColor.c / OKLCH_PICKER_MAX_CHROMA)),
      tone: "guide",
      lane: target,
      cssColor: targetGuideCss,
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
    guides,
    targetGuide,
    targetGuidePoint,
    targetGuideCss,
    markers,
    hueIntervals: view === "oklch" ? intervals(getHueGamutIntervals) : [],
    lightnessIntervals: intervals(getLightnessGamutIntervals),
    chromaIntervals: gamuts.map((gamut) => ({
      start: 0,
      end: Math.min(
        1,
        Math.max(0, guideFor(guides, gamut).maximumChroma / OKLCH_PICKER_MAX_CHROMA),
      ),
      tone: gamut,
    })),
  };
}

export function displayGamutLabel(gamut: DisplayGamut): string {
  return gamutLabel(gamut);
}

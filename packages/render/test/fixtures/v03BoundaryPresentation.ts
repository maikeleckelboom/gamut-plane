// Frozen v0.3 composition from 0b82cef9e5a111a98d98e6a9ae0ab9d666b5cf2b.
// Test oracle: only import paths differ; do not migrate this alongside production.
import {
  OKLCH_PICKER_MAX_CHROMA,
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  convertOklchToOklab,
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  serializeOklchSample,
  type DisplayGamut,
  type GamutStatus,
  type OklchSample,
  type PickerGuide,
  type PickerPlaneId,
  type PlanePoint,
} from "@gamut-plane/core";
import type { LinearControlInterval, LinearControlMarker } from "../../src/channelGeometry.js";
import { PICKER_GAMUT_TABLES } from "../../src/generated/gamutTables.js";

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

function positionGuide(color: OklchSample, view: PickerPlaneId): PlanePoint {
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
  color: OklchSample,
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
  const markerColor = showTargetGuide ? targetGuide.color : null;
  const targetGuideCss = markerColor ? serializeOklchSample({ ...markerColor, alpha: 1 }) : "";
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
    get: typeof getHueGuideIntervals | typeof getLightnessGuideIntervals,
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
    hueIntervals: view === "oklch" ? intervals(getHueGuideIntervals) : [],
    lightnessIntervals: intervals(getLightnessGuideIntervals),
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

import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  getChromaSliderMarkers,
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getPickerGamutStatus,
  normalizeHue,
  serializeColor,
  type OklchColor,
} from "@gamut-plane/core";
import {
  PICKER_GAMUT_TABLES,
  colorGradient,
  type LinearControlInterval,
  type LinearControlMarker,
} from "@gamut-plane/render";
import type { GamutPlaneView } from "../GamutPlane.js";

export function instrumentModel(value: OklchColor, view: GamutPlaneView) {
  const plane = view === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE;
  const projection = plane.project(value);
  const status = getPickerGamutStatus(value, PICKER_GAMUT_TABLES);
  const chroma = getChromaSliderMarkers(value, PICKER_GAMUT_TABLES, status);
  const projectionColor = status.srgb.inGamut
    ? null
    : { ...value, c: Math.min(value.c, status.srgb.interpolatedMaximumChroma) };
  const projectionCss = projectionColor ? serializeColor(projectionColor) : "";
  const markers: LinearControlMarker[] = [
    {
      id: "display-p3-boundary-guide",
      label: `Display P3 table boundary guide C ${chroma.displayP3BoundaryGuide.chroma.toFixed(4)}`,
      position: chroma.displayP3BoundaryGuide.position,
      tone: "display-p3",
    },
    {
      id: "srgb-boundary-guide",
      label: `sRGB table boundary guide C ${chroma.srgbBoundaryGuide.chroma.toFixed(4)}`,
      position: chroma.srgbBoundaryGuide.position,
      tone: "srgb",
    },
  ];
  if (chroma.srgbBoundaryProjection)
    markers.push({
      id: "srgb-boundary-projection",
      label: `sRGB boundary projection C ${chroma.srgbBoundaryProjection.chroma.toFixed(4)}`,
      position: chroma.srgbBoundaryProjection.position,
      tone: "projection",
      cssColor: projectionCss,
    });
  function intervals(
    get: (
      table: typeof PICKER_GAMUT_TABLES.srgb,
      color: OklchColor,
    ) => { start: number; end: number }[],
  ): LinearControlInterval[] {
    return [
      ...get(PICKER_GAMUT_TABLES.displayP3, value).map((interval) => ({
        ...interval,
        tone: "display-p3" as const,
      })),
      ...get(PICKER_GAMUT_TABLES.srgb, value).map((interval) => ({
        ...interval,
        tone: "srgb" as const,
      })),
    ];
  }
  const hueIntervals = view === "oklch" ? intervals(getHueGamutIntervals) : [];
  const lightnessIntervals = intervals(getLightnessGamutIntervals);
  const chromaIntervals: LinearControlInterval[] = [
    { start: 0, end: chroma.displayP3BoundaryGuide.position, tone: "display-p3" },
    { start: 0, end: chroma.srgbBoundaryGuide.position, tone: "srgb" },
  ];
  const boundaryProjectionChroma = chroma.srgbBoundaryProjection?.chroma ?? null;
  const details = {
    view,
    p3: status.displayP3.interpolatedMaximumChroma.toFixed(4),
    srgb: status.srgb.interpolatedMaximumChroma.toFixed(4),
    selected:
      view === "oklab"
        ? `OKLCH C ${value.c.toFixed(4)} · H ${value.h.toFixed(2)}°`
        : `C ${value.c.toFixed(4)}`,
    projection:
      boundaryProjectionChroma === null
        ? "not required"
        : status.srgb.interpolatedDeltaC > 0
          ? `table C ${boundaryProjectionChroma.toFixed(4)} · ΔC guide −${status.srgb.interpolatedDeltaC.toFixed(4)}`
          : "exact outside · boundary projection overlaps active",
  };
  return {
    plane,
    projection,
    projectionColor,
    markers,
    hueIntervals,
    lightnessIntervals,
    chromaIntervals,
    details,
    warningVisible: !status.displayP3.inGamut,
    huePosition: normalizeHue(value.h) / 360,
    chromaPosition: chroma.active.position,
    style: { "--picker-active": serializeColor(value), "--picker-projection": projectionCss },
    lightnessGradient: colorGradient(12, (position) => ({ ...value, l: position, alpha: 1 })),
    chromaGradient: colorGradient(12, (position) => ({
      ...value,
      c: position * OKLCH_PICKER_MAX_CHROMA,
      alpha: 1,
    })),
    fixedLightnessGradient: colorGradient(12, (position) =>
      OKLAB_AB_PLANE.editFixedAxis(value, position),
    ),
    chromaHelp:
      value.c > OKLCH_PICKER_MAX_CHROMA
        ? `Chroma ${value.c.toFixed(4)} exceeds the 0.4000 view. Use the numeric field to edit beyond the slider.`
        : undefined,
    domainHelp:
      value.c > OKLCH_PICKER_MAX_CHROMA
        ? `Chroma ${value.c.toFixed(4)} exceeds the 0.4000 a/b view. The marker sits at the edge; your color is unchanged.`
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

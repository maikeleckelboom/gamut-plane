import { getSliderWarningPosition } from "./pickerWarningPlacement.js";
import * as geometry from "./planeInstrumentStyle.js";

export interface LinearControlInterval {
  start: number;
  end: number;
  tone: "srgb" | "display-p3";
}
export interface LinearControlMarker {
  id: string;
  label: string;
  position: number;
  tone: "projection";
  lane: LinearControlInterval["tone"];
  cssColor?: string;
}
export interface GamutThreshold {
  position: number;
  tone: LinearControlInterval["tone"];
  insideSide: "left" | "right";
  label: string;
}
const tones = ["display-p3", "srgb"] as const;

/** Merge sampled visual intervals, retaining the exact-membership boundary in core. */
export function channelSections(
  intervals: readonly LinearControlInterval[],
): LinearControlInterval[] {
  return tones.flatMap((tone) => {
    const sections: LinearControlInterval[] = [];
    const sorted = intervals
      .filter((interval) => interval.tone === tone)
      .map((interval) => {
        const start = Math.min(1, Math.max(0, interval.start));
        return { tone, start, end: Math.min(1, Math.max(start, interval.end)) };
      })
      .filter((interval) => interval.end - interval.start > Number.EPSILON * 16)
      .sort((a, b) => a.start - b.start);
    for (const interval of sorted) {
      const previous = sections.at(-1);
      if (previous && interval.start <= previous.end + Number.EPSILON * 16)
        previous.end = Math.max(previous.end, interval.end);
      else sections.push(interval);
    }
    return sections;
  });
}
export function channelThresholds(sections: readonly LinearControlInterval[]): GamutThreshold[] {
  return tones.flatMap((tone) => {
    const intervals = sections.filter((section) => section.tone === tone);
    return [...new Set(intervals.flatMap(({ start, end }) => [start, end]))]
      .filter((position) => position > 0 && position < 1)
      .map((position) => {
        const inside = intervals.some(
          (interval) => Math.abs(interval.start - position) <= Number.EPSILON * 16,
        );
        const name = tone === "display-p3" ? "Display P3" : "sRGB";
        return {
          position,
          tone,
          insideSide: inside ? "right" : "left",
          label: inside ? `Inside ${name} gamut →` : `← Inside ${name} gamut`,
        };
      });
  });
}
export function nearestThreshold(
  thresholds: readonly GamutThreshold[],
  position: number,
): GamutThreshold | null {
  return thresholds.reduce<GamutThreshold | null>(
    (nearest, threshold) =>
      !nearest || Math.abs(threshold.position - position) < Math.abs(nearest.position - position)
        ? threshold
        : nearest,
    null,
  );
}
export function channelWarning(
  position: number,
  width: number,
  markers: readonly LinearControlMarker[],
  thresholds: readonly GamutThreshold[],
) {
  const normalized = Number.isFinite(position) ? position : 0;
  const nearest = nearestThreshold(
    thresholds.filter((threshold) => threshold.tone === "display-p3"),
    normalized,
  );
  const obstacles = [
    ...markers.map((marker) => ({
      center: Math.min(1, Math.max(0, marker.position)) * width,
      width: geometry.PICKER_SLIDER_PROJECTION_COLLISION_WIDTH,
    })),
    ...thresholds.map((threshold) => ({
      center:
        geometry.PICKER_SLIDER_FIELD_INSET +
        threshold.position * Math.max(0, width - geometry.PICKER_SLIDER_FIELD_INSET * 2),
      width: geometry.PICKER_SLIDER_TICK_COLLISION_WIDTH,
    })),
  ];
  return {
    obstacles,
    placement: getSliderWarningPosition({
      position: normalized,
      trackWidth: width,
      thumbWidth: geometry.PICKER_SLIDER_THUMB_WIDTH,
      warningWidth: geometry.PICKER_WARNING_GLYPH_SIZE,
      edgeClearance: geometry.PICKER_SLIDER_EDGE_CLEARANCE,
      markerGap: geometry.PICKER_SLIDER_WARNING_SIDE_GAP,
      obstacleClearance: geometry.PICKER_SLIDER_ANNOTATION_CLEARANCE,
      obstacles,
      preferredSide: nearest?.insideSide === "right" ? "left" : "right",
    }),
  };
}

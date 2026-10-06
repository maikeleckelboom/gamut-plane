import { OKLAB_AB_PLANE } from "@gamut-plane/core";
import type { LinearControlInterval } from "../channelGeometry.js";
import type { GuideResolution } from "../capabilities/guideResolution.js";

type Range = Readonly<{ min: number; max: number }>;
type Coordinate = "a" | "b";

/**
 * Where a coordinate runs while the other one stays fixed: the chords of the sampled gamut
 * contour at the current lightness, which is the same line the plane draws. Sampled visual
 * guidance only; exact gamut status is analyzed from the ColorValue elsewhere.
 */
function contourChords(
  points: Float32Array,
  along: Coordinate,
  fixedValue: number,
): readonly (readonly [number, number])[] {
  const limit = OKLAB_AB_PLANE.xAxis.max;
  // Plane coordinates: x grows with a, y shrinks with b.
  const read = (index: number) => {
    const x = points[index * 2]!;
    const y = points[index * 2 + 1]!;
    const a = (x * 2 - 1) * limit;
    const b = (1 - y * 2) * limit;
    return along === "a" ? { along: a, across: b } : { along: b, across: a };
  };
  const crossings: number[] = [];
  const count = points.length / 2;
  for (let index = 0; index < count - 1; index += 1) {
    const from = read(index);
    const to = read(index + 1);
    // Half-open crossing, so a vertex exactly on the line is counted once.
    if (from.across <= fixedValue === to.across <= fixedValue) continue;
    const t = (fixedValue - from.across) / (to.across - from.across);
    crossings.push(from.along + t * (to.along - from.along));
  }
  crossings.sort((x, y) => x - y);
  const chords: [number, number][] = [];
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    chords.push([crossings[index]!, crossings[index + 1]!]);
  }
  return chords;
}

/**
 * Gamut intervals for the OKLab a and b sliders, as fractions of each slider's own direct range.
 * Absent guides, an out-of-range lightness or a fixed coordinate outside the gamut yield nothing.
 */
export function oklabCoordinateIntervals(
  guides: readonly GuideResolution[],
  /** The OKLab observation's [L, a, b]. */
  channels: readonly (number | null)[],
  coordinates: Readonly<Record<Coordinate, Readonly<{ range: Range | null }>>>,
): Readonly<Record<Coordinate, readonly LinearControlInterval[]>> {
  const result: Record<Coordinate, LinearControlInterval[]> = { a: [], b: [] };
  const selected = { a: channels[1], b: channels[2] };
  const ranges = { a: coordinates.a.range, b: coordinates.b.range };
  if (selected.a == null || selected.b == null) return result;
  for (const [id, tone] of [
    ["display-p3-boundary", "display-p3"],
    ["srgb-boundary", "srgb"],
  ] as const) {
    const row = guides.find((candidate) => candidate.guideId === id);
    if (!row || row.kind !== "resolved" || row.forms.kind !== "perceptual") continue;
    const { contour } = row.forms;
    if (contour.kind !== "available" || !contour.value.closed) continue;
    for (const [coordinate, other] of [
      ["a", "b"],
      ["b", "a"],
    ] as const) {
      const range = ranges[coordinate];
      if (!range || !(range.max > range.min)) continue;
      const extent = range.max - range.min;
      for (const [low, high] of contourChords(contour.value.points, coordinate, selected[other]!)) {
        const start = Math.min(1, Math.max(0, (low - range.min) / extent));
        const end = Math.min(1, Math.max(0, (high - range.min) / extent));
        if (end > start) result[coordinate].push({ start, end, tone });
      }
    }
  }
  return result;
}

// Experiment-only helpers that validate constant-lightness section contours against independent
// authorities: core's ray solver (gamutRayCrossings) and core's gamut analysis. Not shipped, not exported.
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { gamutRayCrossings } from "@gamut-plane/core/internal/capabilities";
import type { LightnessSection } from "../../src/spatial/lightnessSection.ts";
import { SegmentIndex, type Segment2 } from "./silhouette.ts";

/** Every boundary segment of the section in the (a, b) plane. */
export function loopSegments(section: LightnessSection): Segment2[] {
  const segments: Segment2[] = [];
  for (const loop of section.loops) {
    const n = loop.edges.length;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      segments.push([
        loop.positions[3 * k]!,
        loop.positions[3 * k + 2]!,
        loop.positions[3 * j]!,
        loop.positions[3 * j + 2]!,
      ]);
    }
  }
  return segments;
}

/** Chromas at which the ray from the neutral point at `hue` (degrees) meets the boundary. */
export function rayHits(segments: readonly Segment2[], hue: number): number[] {
  const radians = (hue * Math.PI) / 180;
  const dx = Math.cos(radians),
    dz = Math.sin(radians);
  const found: number[] = [];
  for (const [ax, az, bx, bz] of segments) {
    const ex = bx - ax,
      ez = bz - az;
    const denominator = dx * ez - dz * ex;
    if (denominator === 0) continue;
    // s (dx, dz) = a + u e with u in [0, 1): a shared vertex counts once.
    const s = (ax * ez - az * ex) / denominator;
    const u = (ax * dz - az * dx) / denominator;
    if (s > 0 && u >= 0 && u < 1) found.push(s);
  }
  return found.sort((p, q) => p - q);
}

/** Even-odd point membership over all loops. */
export function insideLoops(segments: readonly Segment2[], a: number, b: number): boolean {
  let inside = false;
  for (const [ax, ay, bx, by] of segments)
    if (ay > b !== by > b && a < ax + ((b - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  return inside;
}

/** The section of a triangle mesh with the plane y = level, as segments in (a, b). */
export function meshPlaneSegments(
  positions: Float64Array,
  triangles: Uint32Array,
  level: number,
): Segment2[] {
  const out: Segment2[] = [];
  for (let t = 0; t < triangles.length / 3; t++) {
    const points: [number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const a = triangles[3 * t + k]!,
        b = triangles[3 * t + ((k + 1) % 3)]!;
      const la = positions[3 * a + 1]! - level,
        lb = positions[3 * b + 1]! - level;
      if (la > 0 === lb > 0) continue;
      const w = la / (la - lb);
      points.push([
        positions[3 * a]! + w * (positions[3 * b]! - positions[3 * a]!),
        positions[3 * a + 2]! + w * (positions[3 * b + 2]! - positions[3 * a + 2]!),
      ]);
    }
    if (points.length === 2) out.push([points[0]![0], points[0]![1], points[1]![0], points[1]![1]]);
  }
  return out;
}

export interface CoreCorrespondence {
  rays: number;
  /** Rays on which the polyline and core disagree about the number of boundary crossings. */
  countMismatches: number;
  /** Rays that were skipped because core reports crossings closer than `separation` (grazing). */
  ambiguousRays: number;
  /** Distance, in the section plane, from each core crossing point to the nearest polyline point. */
  planeDistance: number[];
  /** |polyline chroma - core chroma| over rays with equal counts; amplified where the plane grazes. */
  chromaError: number[];
}

/**
 * Compare a section with core's ray solver on a hue sweep. Core's crossings are the authority; the
 * comparison is in-plane distance (the meaningful unit) and, separately, chroma along the ray.
 * Rays whose exact crossings lie within `separation` of one another are near a tangency, where a
 * polyline legitimately differs in count; they are reported, not hidden.
 */
export function compareWithCore(
  section: LightnessSection,
  hues: readonly number[],
  separation = 5e-5,
): CoreCorrespondence {
  const segments = loopSegments(section);
  const index = new SegmentIndex(segments, 0.02);
  const report: CoreCorrespondence = {
    rays: 0,
    countMismatches: 0,
    ambiguousRays: 0,
    planeDistance: [],
    chromaError: [],
  };
  for (const hue of hues) {
    report.rays++;
    const exact = gamutRayCrossings(section.lightness, hue, section.space).map((c) => c.chroma);
    const approximate = rayHits(segments, hue);
    const radians = (hue * Math.PI) / 180;
    for (const chroma of exact)
      report.planeDistance.push(
        index.nearest(chroma * Math.cos(radians), chroma * Math.sin(radians)),
      );
    if (exact.length !== approximate.length) {
      const gaps = exact.slice(1).map((c, i) => c - exact[i]!);
      if (gaps.some((gap) => gap < separation)) report.ambiguousRays++;
      else report.countMismatches++;
      continue;
    }
    exact.forEach((chroma, i) => report.chromaError.push(Math.abs(approximate[i]! - chroma)));
  }
  return report;
}

/** Core analysis of the OKLab color (L, a, b): the independent membership authority. */
export function coreStatus(section: LightnessSection, a: number, b: number) {
  const color = createColorValue({
    space: "oklab",
    channels: [section.lightness, a, b],
    alpha: 1,
  });
  if (!color.ok) throw new Error(color.error.code);
  const analysis = analyzeGamut(color.value, section.gamut);
  if (!analysis.ok) throw new Error(analysis.error.code);
  return analysis.value.status;
}

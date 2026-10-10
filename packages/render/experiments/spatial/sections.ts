// Experiment-only section correspondence. The authority for where a constant-lightness ray crosses
// the exact gamut is core's solver (gamutRayCrossings); each candidate mesh is intersected with the
// same planes and compared. Finite fixtures, not an arbitrary-section guarantee.
import { gamutRayCrossings } from "@gamut-plane/core/internal/capabilities";
import type { CandidateMesh } from "./candidates.ts";
import { SegmentIndex, type Segment2 } from "./silhouette.ts";
import { statsOf, type Stats } from "./distance.ts";

export const SECTION_LIGHTNESS = [
  0.002, 0.006, 0.02, 0.05, 0.1, 0.2, 0.35, 0.44, 0.5, 0.6, 0.75, 0.9, 0.99,
];

function planeSegments(mesh: CandidateMesh, level: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const points: [number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const a = mesh.triangles[3 * t + k]!,
        b = mesh.triangles[3 * t + ((k + 1) % 3)]!;
      const la = mesh.positions[3 * a + 1]! - level,
        lb = mesh.positions[3 * b + 1]! - level;
      if (la > 0 === lb > 0) continue;
      const w = la / (la - lb);
      points.push([
        mesh.positions[3 * a]! + w * (mesh.positions[3 * b]! - mesh.positions[3 * a]!),
        mesh.positions[3 * a + 2]! + w * (mesh.positions[3 * b + 2]! - mesh.positions[3 * a + 2]!),
      ]);
    }
    if (points.length === 2) out.push([points[0]![0], points[0]![1], points[1]![0], points[1]![1]]);
  }
  return out;
}

/** Chroma of every ray crossing of a polyline set, hue in degrees, from the neutral axis outward. */
function rayCrossings(segments: [number, number, number, number][], hue: number): number[] {
  const radians = (hue * Math.PI) / 180;
  const dx = Math.cos(radians),
    dz = Math.sin(radians);
  const found: number[] = [];
  for (const [ax, az, bx, bz] of segments) {
    const ex = bx - ax,
      ez = bz - az;
    const denominator = dx * ez - dz * ex;
    if (denominator === 0) continue;
    // ray: s * (dx, dz) = a + u * e, with u in [0, 1) so a shared vertex is counted once
    const s = (ax * ez - az * ex) / denominator;
    const u = (ax * dz - az * dx) / denominator;
    if (s > 0 && u >= 0 && u < 1) found.push(s);
  }
  return found.sort((p, q) => p - q);
}

export interface ConstantLightnessReport {
  rays: number;
  countMismatches: number;
  /** |mesh chroma - exact chroma| over rays with the same crossing count. Sensitive where the plane grazes the surface. */
  chromaError: Stats;
  nearBlack: Stats;
  elsewhere: Stats;
  /** Distance from each exact crossing point to the mesh's section polyline in the plane itself. */
  planeDistance: Stats;
  planeDistanceNearBlack: Stats;
  /** Largest ratio of chroma error to plane distance over crossings: the grazing amplification. */
  maxGrazingAmplification: number;
  perLightness: {
    lightness: number;
    maxChroma: number;
    maxPlane: number;
    countMismatches: number;
  }[];
}
export function constantLightnessSections(
  mesh: CandidateMesh,
  levels: readonly number[] = SECTION_LIGHTNESS,
): ConstantLightnessReport {
  const all: number[] = [],
    near: number[] = [],
    far: number[] = [];
  const plane: number[] = [],
    planeNear: number[] = [];
  const perLightness: ConstantLightnessReport["perLightness"] = [];
  let mismatches = 0,
    rays = 0,
    amplification = 0;
  for (const level of levels) {
    const segments = planeSegments(mesh, level);
    const index = new SegmentIndex(segments, 0.02);
    let max = 0,
      maxPlane = 0,
      bad = 0;
    for (let hue = 0; hue < 360; hue++) {
      rays++;
      const exact = gamutRayCrossings(level, hue, mesh.space).map((c) => c.chroma);
      const approx = rayCrossings(segments, hue);
      if (exact.length !== approx.length) {
        mismatches++;
        bad++;
        continue;
      }
      const radians = (hue * Math.PI) / 180;
      exact.forEach((chroma, i) => {
        const error = Math.abs(approx[i]! - chroma);
        all.push(error);
        (level < 0.05 ? near : far).push(error);
        max = Math.max(max, error);
        const distance = index.nearest(chroma * Math.cos(radians), chroma * Math.sin(radians));
        plane.push(distance);
        if (level < 0.05) planeNear.push(distance);
        maxPlane = Math.max(maxPlane, distance);
        if (distance > 1e-9) amplification = Math.max(amplification, error / distance);
      });
    }
    perLightness.push({ lightness: level, maxChroma: max, maxPlane, countMismatches: bad });
  }
  return {
    rays,
    countMismatches: mismatches,
    chromaError: statsOf(all),
    nearBlack: statsOf(near),
    elsewhere: statsOf(far),
    planeDistance: statsOf(plane),
    planeDistanceNearBlack: statsOf(planeNear),
    maxGrazingAmplification: amplification,
    perLightness,
  };
}

export interface ConstantHueReport {
  hues: number;
  /** Distance from exact boundary points to the mesh section polyline, in the (chroma, L) plane. */
  boundaryDistance: Stats;
  lowerBoundary: Stats;
  upperBoundary: Stats;
}
export function constantHueSections(
  mesh: CandidateMesh,
  hues: readonly number[] = Array.from({ length: 24 }, (_, k) => k * 15),
  step = 0.002,
): ConstantHueReport {
  const all: number[] = [],
    lower: number[] = [],
    upper: number[] = [];
  for (const hue of hues) {
    const radians = (hue * Math.PI) / 180;
    const c = Math.cos(radians),
      s = Math.sin(radians);
    const segments: Segment2[] = [];
    for (let t = 0; t < mesh.triangles.length / 3; t++) {
      const pts: [number, number][] = [];
      for (let k = 0; k < 3; k++) {
        const a = mesh.triangles[3 * t + k]!,
          b = mesh.triangles[3 * t + ((k + 1) % 3)]!;
        const da = -s * mesh.positions[3 * a]! + c * mesh.positions[3 * a + 2]!;
        const db = -s * mesh.positions[3 * b]! + c * mesh.positions[3 * b + 2]!;
        if (da > 0 === db > 0) continue;
        const w = da / (da - db);
        const x = mesh.positions[3 * a]! + w * (mesh.positions[3 * b]! - mesh.positions[3 * a]!);
        const z =
          mesh.positions[3 * a + 2]! +
          w * (mesh.positions[3 * b + 2]! - mesh.positions[3 * a + 2]!);
        const l =
          mesh.positions[3 * a + 1]! +
          w * (mesh.positions[3 * b + 1]! - mesh.positions[3 * a + 1]!);
        pts.push([x * c + z * s, l]);
      }
      if (pts.length === 2 && pts[0]![0] >= -1e-12 && pts[1]![0] >= -1e-12)
        segments.push([pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]]);
    }
    const index = new SegmentIndex(segments, 0.02);
    for (let l = step; l < 1; l += step)
      for (const crossing of gamutRayCrossings(l, hue, mesh.space)) {
        const d = index.nearest(crossing.chroma, l);
        all.push(d);
        (l < 0.05 ? lower : upper).push(d);
      }
  }
  return {
    hues: hues.length,
    boundaryDistance: statsOf(all),
    lowerBoundary: statsOf(lower),
    upperBoundary: statsOf(upper),
  };
}

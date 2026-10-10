// Experiment-only silhouette fidelity: the outline a candidate mesh would draw versus the TRUE
// silhouette of the exact surface, in screen pixels for a declared orthographic camera. This is a
// sampled diagnostic (marching squares on a fixed parameter grid plus crease edges), not a
// continuous Hausdorff bound. Mesh chord edges and true silhouette curves are compared in 2D.
import {
  cross,
  dot,
  faceSurface,
  faceRgb,
  FACE_FREE_AXES,
  scene,
  sceneWithJacobian,
  unit,
  type Space,
  type Vec3,
} from "./oracle.ts";
import type { CandidateMesh } from "./candidates.ts";
import { statsOf, type Stats } from "./distance.ts";

export interface View {
  name: string;
  /** Direction from the scene toward the camera (need not be unit). */
  toViewer: Vec3;
}
/** Declared envelope: Phase 3B stage 900 CSS px tall, 1.42 scene units tall at zoom 1. */
export const PIXELS_PER_UNIT_AT_ZOOM_1 = 900 / 1.42;

function basis(toViewer: Vec3) {
  const e = unit(toViewer);
  const right = unit(cross([0, 1, 0], e));
  const up = cross(e, right);
  return { e, right, up };
}
export type Segment2 = readonly [number, number, number, number];

function pointSegment(px: number, py: number, s: Segment2): number {
  const [ax, ay, bx, by] = s;
  const dx = bx - ax,
    dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Nearest segment distance with a coarse bucket grid so large silhouette sets stay tractable. */
export class SegmentIndex {
  private readonly buckets = new Map<number, number[]>();
  private readonly cell: number;
  private readonly segments: Segment2[];
  constructor(segments: Segment2[], cell = 0.03) {
    this.segments = segments;
    this.cell = cell;
    segments.forEach((s, i) => {
      const x0 = Math.floor(Math.min(s[0], s[2]) / cell),
        x1 = Math.floor(Math.max(s[0], s[2]) / cell);
      const y0 = Math.floor(Math.min(s[1], s[3]) / cell),
        y1 = Math.floor(Math.max(s[1], s[3]) / cell);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const key = x * 100003 + y;
          const list = this.buckets.get(key);
          if (list) list.push(i);
          else this.buckets.set(key, [i]);
        }
    });
  }
  nearest(px: number, py: number): number {
    if (!this.segments.length) return Infinity;
    const cx = Math.floor(px / this.cell),
      cy = Math.floor(py / this.cell);
    let best = Infinity;
    for (let r = 0; r < 200; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          for (const i of this.buckets.get(x * 100003 + y) ?? [])
            best = Math.min(best, pointSegment(px, py, this.segments[i]!));
        }
      if (best <= r * this.cell) break;
    }
    return best;
  }
}

/** Outline edges of a closed mesh for a view: edges whose two chord normals disagree in facing. */
export function meshSilhouette(mesh: CandidateMesh, view: View): Segment2[] {
  const { e, right, up } = basis(view.toViewer);
  const V = mesh.positions.length / 3;
  const facing: boolean[] = [];
  const edges = new Map<number, number>();
  const out: Segment2[] = [];
  const project = (v: number): [number, number] => {
    const p: Vec3 = [
      mesh.positions[3 * v]!,
      mesh.positions[3 * v + 1]!,
      mesh.positions[3 * v + 2]!,
    ];
    return [dot(p, right), dot(p, up)];
  };
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
    const [a, b, c] = ids.map(
      (v) =>
        [mesh.positions[3 * v]!, mesh.positions[3 * v + 1]!, mesh.positions[3 * v + 2]!] as Vec3,
    ) as [Vec3, Vec3, Vec3];
    const n = cross(
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    );
    facing.push(dot(n, e) > 0);
    for (let k = 0; k < 3; k++) {
      const u = ids[k]!,
        w = ids[(k + 1) % 3]!;
      const key = Math.min(u, w) * V + Math.max(u, w);
      const other = edges.get(key);
      if (other === undefined) edges.set(key, t);
      else {
        if (facing[other] !== facing[t]) {
          const p = project(u),
            q = project(w);
          out.push([p[0], p[1], q[0], q[1]]);
        }
        edges.delete(key);
      }
    }
  }
  return out;
}

/**
 * True silhouette of the exact boundary for a view: the zero level set of N . e on each cube face
 * (marching squares on a cubic-spaced parameter grid refined by exact evaluation), plus cube-edge
 * creases where the two adjacent faces face opposite ways.
 */
export function trueSilhouette(space: Space, view: View, resolution = 384): Segment2[] {
  const { e, right, up } = basis(view.toViewer);
  const out: Segment2[] = [];
  const to2 = (p: Vec3): [number, number] => [dot(p, right), dot(p, up)];
  // Outward sign of du x dv per face, fixed once at the face center by the displacement test.
  const sign = [0, 1, 2, 3, 4, 5].map((face) => {
    const { point, du, dv } = faceSurface(face, 0.5, 0.5, space);
    const q = faceRgb(face, 0.5, 0.5);
    q[face >> 1]! += (face & 1 ? -1 : 1) * 1e-4;
    const inward: Vec3 = [
      scene(q, space)[0] - point[0],
      scene(q, space)[1] - point[1],
      scene(q, space)[2] - point[2],
    ];
    return dot(cross(du, dv), inward) > 0 ? -1 : 1;
  });
  const g = (face: number, u: number, v: number) => {
    const { du, dv } = faceSurface(face, u, v, space);
    return sign[face]! * dot(cross(du, dv), e);
  };
  const warp = (t: number) => Math.min(1 - 1e-12, Math.max(1e-12, t ** 3));
  for (let face = 0; face < 6; face++) {
    const n = resolution;
    const values = new Float64Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) values[j * (n + 1) + i] = g(face, warp(i / n), warp(j / n));
    const crossing = (i0: number, j0: number, i1: number, j1: number): [number, number] | null => {
      const g0 = values[j0 * (n + 1) + i0]!,
        g1 = values[j1 * (n + 1) + i1]!;
      if (g0 > 0 === g1 > 0) return null;
      // Bisection on the exact function along the cell edge, in parameter t.
      let a = 0,
        b = 1,
        ga = g0;
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2;
        const gm = g(face, warp((i0 + (i1 - i0) * m) / n), warp((j0 + (j1 - j0) * m) / n));
        if (gm > 0 === ga > 0) {
          a = m;
          ga = gm;
        } else b = m;
      }
      const m = (a + b) / 2;
      const point = faceSurface(
        face,
        warp((i0 + (i1 - i0) * m) / n),
        warp((j0 + (j1 - j0) * m) / n),
        space,
      ).point;
      return to2(point);
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const hits = [
          crossing(i, j, i + 1, j),
          crossing(i + 1, j, i + 1, j + 1),
          crossing(i, j + 1, i + 1, j + 1),
          crossing(i, j, i, j + 1),
        ].filter((p): p is [number, number] => p !== null);
        if (hits.length === 2) out.push([hits[0]![0], hits[0]![1], hits[1]![0], hits[1]![1]]);
        else if (hits.length === 4) {
          out.push([hits[0]![0], hits[0]![1], hits[1]![0], hits[1]![1]]);
          out.push([hits[2]![0], hits[2]![1], hits[3]![0], hits[3]![1]]);
        }
      }
  }
  // Creases: the twelve cube edges, where the two adjacent faces disagree in facing.
  const samples = 4096;
  const edgeSpecs: { axis: number; others: [number, number] }[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const [b, c] = [0, 1, 2].filter((k) => k !== axis) as [number, number];
    for (const vb of [0, 1])
      for (const vc of [0, 1]) edgeSpecs.push({ axis, others: [2 * b + vb, 2 * c + vc] });
  }
  for (const { axis, others } of edgeSpecs) {
    const [faceB, faceC] = others;
    const b = faceB >> 1,
      c = faceC >> 1;
    let previous: { p: [number, number]; differs: boolean } | null = null;
    for (let i = 0; i <= samples; i++) {
      const t = Math.min(1 - 1e-12, Math.max(1e-12, (i / samples) ** 3));
      const q: Vec3 = [0, 0, 0];
      q[axis] = t;
      q[b] = faceB & 1;
      q[c] = faceC & 1;
      const normalFor = (face: number) => {
        const free = FACE_FREE_AXES[face >> 1]!;
        const { du, dv } = faceSurface(face, q[free[0]]!, q[free[1]]!, space);
        return sign[face]! * dot(cross(du, dv), e);
      };
      const nb = normalFor(faceB),
        nc = normalFor(faceC);
      const point = to2(sceneWithJacobian(q, space).point);
      const differs = Number.isFinite(nb) && Number.isFinite(nc) && nb > 0 !== nc > 0;
      if (previous && previous.differs && differs)
        out.push([previous.p[0], previous.p[1], point[0], point[1]]);
      previous = { p: point, differs };
    }
  }
  return out;
}

export interface SilhouetteReport {
  view: string;
  meshEdges: number;
  trueSegments: number;
  /** Pixel errors at the declared camera, zoom 1 (multiply by zoom for other magnifications). */
  trueToMesh: Stats;
  meshToTrue: Stats;
}
/** Compare a candidate's mesh outline with the true outline for one view. */
export function silhouetteError(
  mesh: CandidateMesh,
  trueSegments: Segment2[],
  view: View,
): SilhouetteReport {
  const meshSegments = meshSilhouette(mesh, view);
  const scale = PIXELS_PER_UNIT_AT_ZOOM_1;
  const meshIndex = new SegmentIndex(meshSegments);
  const trueIndex = new SegmentIndex(trueSegments);
  const toMesh: number[] = [],
    toTrue: number[] = [];
  for (const [ax, ay, bx, by] of trueSegments)
    for (const w of [0, 0.5, 1])
      toMesh.push(meshIndex.nearest(ax + (bx - ax) * w, ay + (by - ay) * w) * scale);
  for (const [ax, ay, bx, by] of meshSegments)
    for (const w of [0, 0.5, 1])
      toTrue.push(trueIndex.nearest(ax + (bx - ax) * w, ay + (by - ay) * w) * scale);
  return {
    view: view.name,
    meshEdges: meshSegments.length,
    trueSegments: trueSegments.length,
    trueToMesh: statsOf(toMesh),
    meshToTrue: statsOf(toTrue),
  };
}

// Experiment-only boundary tessellations for qualification. Not shipped, not exported.
// The production generator (src/spatial/boundaryMesh.ts) is untouched and is one candidate here.
import { performance } from "node:perf_hooks";
import { linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import { generateBoundaryMesh } from "../../dist/spatial/boundaryMesh.js";
import { decodeEncoded, scene, type Space, type Vec3 } from "./oracle.ts";

export type CandidateFamily = "cubic-grid" | "adaptive-bounded" | "radial-hybrid";
/** Renderer-independent triangle mesh with per-triangle source face provenance. */
export interface CandidateMesh {
  readonly id: string;
  readonly family: CandidateFamily;
  readonly space: Space;
  /** Scientific [a, L, b], Float64. */
  readonly positions: Float64Array;
  readonly linearRgb: Float64Array;
  readonly triangles: Uint32Array;
  /** Per triangle: 2 * fixed RGB channel + fixed value. */
  readonly faces: Uint8Array;
  readonly parameters: Readonly<Record<string, number | string>>;
  readonly generationMs: number;
  readonly notes?: Readonly<Record<string, unknown>>;
}

/** Scientific typed-array bytes using the production accounting: 48 B per vertex + 13 B per triangle. */
export const meshBytes = (mesh: CandidateMesh) =>
  mesh.positions.byteLength +
  mesh.linearRgb.byteLength +
  mesh.triangles.byteLength +
  mesh.faces.byteLength;

function convertToScene(rgb: Float64Array, space: Space): Float64Array {
  const converted = linearRgbToOklabBatch(rgb, space);
  if (!converted.ok) throw new Error(`conversion failed: ${converted.error.code}`);
  const positions = converted.value;
  // Production conversion returns [L, a, b]; the scene is [a, L, b], with no scaling.
  for (let i = 0; i < positions.length; i += 3) {
    const l = positions[i]!;
    positions[i] = positions[i + 1]!;
    positions[i + 1] = l;
  }
  return positions;
}

/** The shipped fixed-grid generator, as a candidate. */
export function cubicGrid(
  space: Space,
  subdivisions: number,
  distribution: "linear" | "encoded" | "cubic" = "cubic",
): CandidateMesh {
  const start = performance.now();
  const generated = generateBoundaryMesh({ space, subdivisions, distribution });
  if (!generated.ok) throw new Error(generated.error);
  const mesh = generated.value;
  return {
    id: `grid-${distribution}-n${subdivisions}`,
    family: "cubic-grid",
    space,
    positions: mesh.positions,
    linearRgb: mesh.linearRgb,
    triangles: mesh.triangles,
    faces: mesh.faces,
    parameters: { subdivisions, distribution },
    generationMs: performance.now() - start,
  };
}

export type HybridKnots = "linear" | "encoded" | "cubic";
const knotVector = (n: number, policy: HybridKnots) =>
  Float64Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    if (i === 0 || i === n) return t;
    return policy === "encoded" ? decodeEncoded(t) : policy === "cubic" ? t ** 3 : t;
  });

/**
 * Radial/conical hybrid. The three faces away from black (R=1, G=1, B=1) are tessellated grids;
 * the three faces through black (R=0, G=0, B=0) are triangle fans from black to their outer rim.
 *
 * Premise, verified separately: F(tq) = t^(1/3) F(q), so every ray from RGB black is an exact
 * straight ray from OKLab black and each lower face is a cone over its rim curve. A fan triangle
 * (black, p_i, p_i+1) therefore errs only by the lateral sag of the rim chord, and that error
 * vanishes linearly toward the apex instead of exploding with the cube-root singularity.
 *
 * Rim vertices are the grid boundary vertices, so seams are shared exactly; no vertex is welded
 * and no triangle is removed.
 */
export function radialHybrid(
  space: Space,
  n: number,
  policy: HybridKnots = "linear",
): CandidateMesh {
  const start = performance.now();
  const knots = knotVector(n, policy);
  const faceR = (n + 1) * (n + 1);
  const faceG = n * (n + 1);
  const upper = faceR + faceG + n * n; // 3n^2 + 3n + 1 vertices with at least one coordinate at n
  const apex = upper;
  const id = (x: number, y: number, z: number) =>
    x === n ? y * (n + 1) + z : y === n ? faceR + x * (n + 1) + z : faceR + faceG + x * n + y;
  const rgb = new Float64Array((upper + 1) * 3);
  const put = (x: number, y: number, z: number) => {
    const o = 3 * id(x, y, z);
    rgb[o] = knots[x]!;
    rgb[o + 1] = knots[y]!;
    rgb[o + 2] = knots[z]!;
  };
  for (let y = 0; y <= n; y++) for (let z = 0; z <= n; z++) put(n, y, z);
  for (let x = 0; x < n; x++) for (let z = 0; z <= n; z++) put(x, n, z);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) put(x, y, n);
  const positions = convertToScene(rgb, space);

  const triangles: number[] = [];
  const faces: number[] = [];
  const lattice = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    lattice[axis] = n;
    const at = (i: number, j: number) => {
      lattice[u] = i;
      lattice[v] = j;
      return id(lattice[0]!, lattice[1]!, lattice[2]!);
    };
    // Same orientation rule as the production generator for side 1 (RGB-lattice triangles are
    // emitted inward; the [L,a,b] -> [a,L,b] permutation reverses orientation).
    const flip = axis !== 1;
    const emit = (a: number, b: number, c: number) => {
      triangles.push(a, flip ? c : b, flip ? b : c);
      faces.push(2 * axis + 1);
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = at(i, j),
          b = at(i + 1, j),
          c = at(i + 1, j + 1),
          d = at(i, j + 1);
        emit(a, b, c);
        emit(a, c, d);
      }
  }
  // Rim paths of the three lower faces, as lattice points with max coordinate n.
  const rims: (readonly [number, number, number][])[] = [
    [
      ...Array.from({ length: n + 1 }, (_, z) => [0, n, z] as [number, number, number]),
      ...Array.from({ length: n }, (_, k) => [0, n - 1 - k, n] as [number, number, number]),
    ],
    [
      ...Array.from({ length: n + 1 }, (_, z) => [n, 0, z] as [number, number, number]),
      ...Array.from({ length: n }, (_, k) => [n - 1 - k, 0, n] as [number, number, number]),
    ],
    [
      ...Array.from({ length: n + 1 }, (_, y) => [n, y, 0] as [number, number, number]),
      ...Array.from({ length: n }, (_, k) => [n - 1 - k, n, 0] as [number, number, number]),
    ],
  ];
  rims.forEach((rim, axis) => {
    for (let k = 0; k + 1 < rim.length; k++) {
      const p = rim[k]!,
        q = rim[k + 1]!;
      // Black is the origin: the lattice normal (p x q) lies on the fixed axis. Inward for side 0.
      const normal = [
        p[1] * q[2] - p[2] * q[1],
        p[2] * q[0] - p[0] * q[2],
        p[0] * q[1] - p[1] * q[0],
      ][axis]!;
      const a = id(...p),
        b = id(...q);
      triangles.push(apex, normal > 0 ? a : b, normal > 0 ? b : a);
      faces.push(2 * axis);
    }
  });
  return {
    id: `hybrid-${policy}-m${n}`,
    family: "radial-hybrid",
    space,
    positions,
    linearRgb: rgb,
    triangles: Uint32Array.from(triangles),
    faces: Uint8Array.from(faces),
    parameters: { subdivisions: n, upperKnots: policy },
    generationMs: performance.now() - start,
  };
}

export interface AdaptiveOptions {
  baseSubdivisions: number;
  maxTriangles: number;
  maxRounds: number;
  /** Training threshold, in CSS pixels at the declared stage. */
  thresholdPixels: number;
  stageHeight: number;
  homeHeight: number;
  zoom: number;
}
export const ADAPTIVE_PHASE_3B: AdaptiveOptions = {
  baseSubdivisions: 32,
  maxTriangles: 150_000,
  maxRounds: 10,
  thresholdPixels: 0.35,
  stageHeight: 1080,
  homeHeight: 1.42,
  zoom: 12,
};
const TRAINING: Vec3[] = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
];

/**
 * Port of the Phase 3B bounded conforming refinement (apps/web/scripts/measureSpatialAdaptive.ts):
 * mark failing triangles by four training probes, split every edge of a marked triangle at a
 * globally shared RGB midpoint, and fan each touched triangle around its RGB centroid. Truth for
 * the marking decision comes from the independent XYZ oracle. Ported so its construction can be
 * reproduced and then judged on the same held-out set as every other candidate.
 */
export function adaptiveBounded(
  space: Space,
  options: AdaptiveOptions = ADAPTIVE_PHASE_3B,
): CandidateMesh {
  const start = performance.now();
  const base = cubicGrid(space, options.baseSubdivisions);
  const points: Vec3[] = [];
  const source: Vec3[] = [];
  for (let i = 0; i < base.positions.length; i += 3) {
    points.push([base.positions[i]!, base.positions[i + 1]!, base.positions[i + 2]!]);
    source.push([base.linearRgb[i]!, base.linearRgb[i + 1]!, base.linearRgb[i + 2]!]);
  }
  let tris: { ids: Vec3; face: number }[] = Array.from(base.faces, (face, t) => ({
    face,
    ids: [base.triangles[3 * t]!, base.triangles[3 * t + 1]!, base.triangles[3 * t + 2]!],
  }));
  const pixelScale = (options.stageHeight / options.homeHeight) * options.zoom;
  const triangleError = (ids: Vec3, weights: Vec3) => {
    const q = [0, 1, 2].map((axis) =>
      ids.reduce((sum, vertex, i) => sum + source[vertex]![axis]! * weights[i]!, 0),
    ) as Vec3;
    const target = scene(q, space);
    const [a, b, c] = ids.map((vertex) => points[vertex]!.map(Math.fround) as Vec3) as [
      Vec3,
      Vec3,
      Vec3,
    ];
    return distanceToTriangle(target, a, b, c);
  };
  const add = (rgb: Vec3) => {
    const converted = convertToScene(Float64Array.from(rgb), space);
    source.push(rgb);
    points.push([converted[0]!, converted[1]!, converted[2]!]);
    return points.length - 1;
  };
  const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const rounds: { round: number; triangles: number; marked: number; maxPixels: number }[] = [];
  let status = "round-budget";
  for (let round = 0; round < options.maxRounds; round++) {
    const marked = new Set<string>();
    let maxPixels = 0;
    for (const triangle of tris) {
      const error = Math.max(...TRAINING.map((w) => triangleError(triangle.ids, w))) * pixelScale;
      maxPixels = Math.max(maxPixels, error);
      if (error > options.thresholdPixels) {
        const [a, b, c] = triangle.ids;
        marked.add(key(a, b));
        marked.add(key(b, c));
        marked.add(key(c, a));
      }
    }
    rounds.push({ round, triangles: tris.length, marked: marked.size, maxPixels });
    if (!marked.size) {
      status = "training-target-reached";
      break;
    }
    let predicted = 0;
    for (const {
      ids: [a, b, c],
    } of tris) {
      const count = [key(a, b), key(b, c), key(c, a)].filter((edge) => marked.has(edge)).length;
      predicted += count ? 3 + count : 1;
    }
    if (predicted > options.maxTriangles) {
      status = "triangle-budget";
      break;
    }
    const midpoints = new Map<string, number>();
    const next: typeof tris = [];
    for (const triangle of tris) {
      const polygon: number[] = [];
      triangle.ids.forEach((a, i) => {
        const b = triangle.ids[(i + 1) % 3]!,
          edge = key(a, b);
        polygon.push(a);
        if (marked.has(edge)) {
          let mid = midpoints.get(edge);
          if (mid === undefined) {
            mid = add(source[a]!.map((v, axis) => (v + source[b]![axis]!) / 2) as Vec3);
            midpoints.set(edge, mid);
          }
          polygon.push(mid);
        }
      });
      if (polygon.length === 3) {
        next.push(triangle);
        continue;
      }
      const center = add(
        [0, 1, 2].map((axis) =>
          triangle.ids.reduce((sum, vertex) => sum + source[vertex]![axis]! / 3, 0),
        ) as Vec3,
      );
      polygon.forEach((a, i) =>
        next.push({ ids: [a, polygon[(i + 1) % polygon.length]!, center], face: triangle.face }),
      );
    }
    tris = next;
  }
  const positions = new Float64Array(points.length * 3);
  const linearRgb = new Float64Array(points.length * 3);
  points.forEach((p, i) => positions.set(p, 3 * i));
  source.forEach((p, i) => linearRgb.set(p, 3 * i));
  return {
    id: `adaptive-bounded-n${options.baseSubdivisions}`,
    family: "adaptive-bounded",
    space,
    positions,
    linearRgb,
    triangles: Uint32Array.from(tris.flatMap((t) => t.ids)),
    faces: Uint8Array.from(tris.map((t) => t.face)),
    parameters: { ...options },
    generationMs: performance.now() - start,
    notes: { status, rounds },
  };
}

/** Euclidean distance from a point to a closed triangle. */
export function distanceToTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d = (x: Vec3, y: Vec3) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const normal: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const norm2 = d(normal, normal);
  const ab2 = d(ab, ab),
    ac2 = d(ac, ac),
    abac = d(ab, ac);
  if (norm2 > 0) {
    const u = (ac2 * d(ap, ab) - abac * d(ap, ac)) / norm2;
    const v = (ab2 * d(ap, ac) - abac * d(ap, ab)) / norm2;
    if (u >= 0 && v >= 0 && u + v <= 1) return Math.abs(d(ap, normal)) / Math.sqrt(norm2);
  }
  const segment = (s: Vec3, e: Vec3) => {
    const edge: Vec3 = [e[0] - s[0], e[1] - s[1], e[2] - s[2]];
    const delta: Vec3 = [p[0] - s[0], p[1] - s[1], p[2] - s[2]];
    const length2 = d(edge, edge);
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, d(delta, edge) / length2));
    return Math.hypot(delta[0] - t * edge[0], delta[1] - t * edge[1], delta[2] - t * edge[2]);
  };
  return Math.min(segment(a, b), segment(b, c), segment(c, a));
}

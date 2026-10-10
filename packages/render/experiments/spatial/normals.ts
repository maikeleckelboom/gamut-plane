// Experiment-only normal-field evaluation: what a renderer would interpolate versus the true
// surface normal. Reported separately from positional error.
import {
  cross,
  dot,
  faceOutwardNormal,
  FACE_FREE_AXES,
  norm,
  unit,
  sub,
  type Space,
  type Vec3,
} from "./oracle.ts";
import { ConeFace, projectToFace } from "./distance.ts";
import type { CandidateMesh } from "./candidates.ts";

export type NormalPolicy = "area-weighted" | "apex-split" | "analytic";

const read = (buffer: ArrayLike<number>, i: number): Vec3 => [
  buffer[3 * i]!,
  buffer[3 * i + 1]!,
  buffer[3 * i + 2]!,
];
const isApex = (mesh: CandidateMesh, vertex: number) =>
  mesh.linearRgb[3 * vertex] === 0 &&
  mesh.linearRgb[3 * vertex + 1] === 0 &&
  mesh.linearRgb[3 * vertex + 2] === 0;

/**
 * Per-(source face, vertex) normals, as the renderer upload builds them: vertices are split by
 * source face so cube creases are never smoothed. `area-weighted` accumulates incident chord
 * normals (unnormalized cross products), exactly what BufferGeometry.computeVertexNormals does.
 * `apex-split` additionally gives every triangle that touches black its own apex normal, the mean of
 * its two other vertices' normals, because a cone's normal is constant along a ray and a single
 * shared apex normal is a face-wide average. `analytic` replaces every non-apex vertex normal with
 * the true outward normal of its own face at the vertex's source coordinates.
 */
export function vertexNormals(mesh: CandidateMesh, space: Space, policy: NormalPolicy) {
  const key = (face: number, vertex: number) => face * (mesh.positions.length / 3) + vertex;
  const accumulated = new Map<number, Vec3>();
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
    const [a, b, c] = ids.map((v) => read(mesh.positions, v)) as [Vec3, Vec3, Vec3];
    const n = cross(sub(b, a), sub(c, a));
    for (const v of ids) {
      const k = key(mesh.faces[t]!, v);
      const sum = accumulated.get(k) ?? [0, 0, 0];
      accumulated.set(k, [sum[0] + n[0], sum[1] + n[1], sum[2] + n[2]]);
    }
  }
  const result = new Map<number, Vec3>();
  for (const [k, n] of accumulated) result.set(k, norm(n) > 0 ? unit(n) : [0, 0, 0]);
  if (policy === "analytic") {
    for (const k of accumulated.keys()) {
      const vertex = k % (mesh.positions.length / 3);
      if (isApex(mesh, vertex)) continue;
      const face = (k - vertex) / (mesh.positions.length / 3);
      const free = FACE_FREE_AXES[face >> 1]!;
      const clamp = (x: number) => Math.min(1 - 1e-9, Math.max(1e-9, x));
      const outward = faceOutwardNormal(
        face,
        clamp(mesh.linearRgb[3 * vertex + free[0]]!),
        clamp(mesh.linearRgb[3 * vertex + free[1]]!),
        space,
      );
      if (outward) result.set(k, outward);
    }
  }
  return {
    normalAt(face: number, vertex: number): Vec3 {
      return result.get(key(face, vertex)) ?? [0, 0, 0];
    },
    policy,
    /** Normal for corner `corner` of triangle `t`, honoring the apex rule. */
    cornerNormal(t: number, corner: number): Vec3 {
      const face = mesh.faces[t]!;
      const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
      const v = ids[corner]!;
      if (policy !== "area-weighted" && isApex(mesh, v) && !(face & 1)) {
        const others = ids
          .filter((_, i) => i !== corner)
          .map((o) => result.get(key(face, o)) ?? [0, 0, 0]) as Vec3[];
        const mean: Vec3 = [
          others[0]![0] + others[1]![0],
          others[0]![1] + others[1]![1],
          others[0]![2] + others[1]![2],
        ];
        return norm(mean) > 0 ? unit(mean) : [0, 0, 0];
      }
      return result.get(key(face, v)) ?? [0, 0, 0];
    },
  };
}

export interface NormalReport {
  policy: NormalPolicy;
  samples: number;
  /** Degrees between the interpolated unit normal and the true surface normal line. */
  maxDegrees: number;
  /** Area-weighted percentiles; area is the sample's triangle area over its four samples. */
  areaWeighted: { p50: number; p95: number; p99: number; p999: number; rms: number };
  /** Fraction of surface area whose interpolated normal is more than N degrees off. */
  areaFractionAbove: { oneDegree: number; twoDegrees: number; fiveDegrees: number };
  /** Same statistics restricted to the cone (lower) faces and to the upper faces. */
  maxDegreesLower: number;
  maxDegreesUpper: number;
}

/**
 * Interpolated-vertex-normal error at four samples per triangle (centroid and edge midpoints).
 * The true normal at a sample is that of its own true face at the projected nearest point (upper
 * faces) or of the cone generator nearest the sample (lower faces). Orientation is checked
 * separately, so the angle here is between lines.
 */
export function normalErrors(
  mesh: CandidateMesh,
  space: Space,
  policy: NormalPolicy,
): NormalReport {
  const normals = vertexNormals(mesh, space, policy);
  const cones = [0, 1, 2].map((axis) => new ConeFace(axis, space, 2048));
  const weights: Vec3[] = [
    [1 / 3, 1 / 3, 1 / 3],
    [0.5, 0.5, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
  ];
  const entries: { degrees: number; area: number }[] = [];
  let max = 0,
    maxLower = 0,
    maxUpper = 0,
    totalArea = 0;
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
    const [a, b, c] = ids.map((v) => read(mesh.positions, v)) as [Vec3, Vec3, Vec3];
    const area = norm(cross(sub(b, a), sub(c, a))) / 2;
    const face = mesh.faces[t]!;
    const axis = face >> 1;
    const free = FACE_FREE_AXES[axis]!;
    const corner = [0, 1, 2].map((k) => normals.cornerNormal(t, k)) as Vec3[];
    for (const w of weights) {
      const x: Vec3 = [0, 1, 2].map((k) =>
        ids.reduce((s, id, i) => s + mesh.positions[3 * id + k]! * w[i]!, 0),
      ) as Vec3;
      const interpolated: Vec3 = [0, 1, 2].map((k) =>
        corner.reduce((s, n, i) => s + n[k]! * w[i]!, 0),
      ) as Vec3;
      if (!(norm(interpolated) > 0)) continue;
      let truth: Vec3 | null;
      if (face & 1) {
        const guess = [free[0], free[1]].map((k) =>
          ids.reduce((s, id, i) => s + mesh.linearRgb[3 * id + k]! * w[i]!, 0),
        ) as [number, number];
        const projected = projectToFace(x, face, guess, space);
        const clamp = (v: number) => Math.min(1 - 1e-9, Math.max(1e-9, v));
        truth = faceOutwardNormal(face, clamp(projected.u), clamp(projected.v), space);
      } else truth = cones[axis]!.normalAt(x);
      if (!truth) continue;
      const degrees =
        (Math.acos(Math.min(1, Math.abs(dot(unit(interpolated), truth)))) * 180) / Math.PI;
      entries.push({ degrees, area: area / weights.length });
      totalArea += area / weights.length;
      max = Math.max(max, degrees);
      if (face & 1) maxUpper = Math.max(maxUpper, degrees);
      else maxLower = Math.max(maxLower, degrees);
    }
  }
  entries.sort((p, q) => p.degrees - q.degrees);
  const quantile = (q: number) => {
    let acc = 0;
    for (const e of entries) {
      acc += e.area;
      if (acc >= q * totalArea) return e.degrees;
    }
    return entries.at(-1)?.degrees ?? 0;
  };
  const above = (limit: number) =>
    entries.reduce((s, e) => s + (e.degrees > limit ? e.area : 0), 0) / totalArea;
  const rms = Math.sqrt(
    entries.reduce((s, e) => s + e.degrees * e.degrees * e.area, 0) / totalArea,
  );
  return {
    policy,
    samples: entries.length,
    maxDegrees: max,
    areaWeighted: {
      p50: quantile(0.5),
      p95: quantile(0.95),
      p99: quantile(0.99),
      p999: quantile(0.999),
      rms,
    },
    areaFractionAbove: { oneDegree: above(1), twoDegrees: above(2), fiveDegrees: above(5) },
    maxDegreesLower: maxLower,
    maxDegreesUpper: maxUpper,
  };
}

/**
 * Renderer upload arrays for a candidate under a normal policy: vertices are split by source face
 * (creases are never smoothed), and apex corners of lower faces are split per triangle when the
 * policy asks for it. Float32, three floats per vertex, with a Uint32 index per corner.
 */
export function buildUpload(mesh: CandidateMesh, space: Space, policy: NormalPolicy) {
  const normals = vertexNormals(mesh, space, policy);
  const V = mesh.positions.length / 3;
  const lookup = new Map<number, number>();
  const positions: number[] = [];
  const outNormals: number[] = [];
  const indices = new Uint32Array(mesh.triangles.length);
  for (let t = 0; t < mesh.faces.length; t++)
    for (let k = 0; k < 3; k++) {
      const vertex = mesh.triangles[3 * t + k]!;
      const face = mesh.faces[t]!;
      const split = policy !== "area-weighted" && isApex(mesh, vertex) && !(face & 1);
      // Per-triangle apex vertices are never shared; every other vertex is shared per (face, vertex).
      const key = split ? -1 - (3 * t + k) : face * V + vertex;
      let index = lookup.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        lookup.set(key, index);
        positions.push(
          mesh.positions[3 * vertex]!,
          mesh.positions[3 * vertex + 1]!,
          mesh.positions[3 * vertex + 2]!,
        );
        outNormals.push(...normals.cornerNormal(t, k));
      }
      indices[3 * t + k] = index;
    }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(outNormals),
    indices,
    vertexCount: positions.length / 3,
  };
}

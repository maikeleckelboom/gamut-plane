import { linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import type { BoundaryMesh } from "./boundaryMesh.js";

type Point = readonly [number, number, number];
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a: Point, b: Point, c: Point, w: Point): Point => [
  a[0] * w[0] + b[0] * w[1] + c[0] * w[2],
  a[1] * w[0] + b[1] * w[1] + c[1] * w[2],
  a[2] * w[0] + b[2] * w[1] + c[2] * w[2],
];
export const readPoint = (buffer: ArrayLike<number>, index: number): Point => [
  buffer[3 * index]!,
  buffer[3 * index + 1]!,
  buffer[3 * index + 2]!,
];

/** Euclidean point-to-closed-triangle distance, including degenerate edge/point cases. */
export function distanceToTriangle(p: Point, a: Point, b: Point, c: Point): number {
  const ab = subtract(b, a),
    ac = subtract(c, a),
    ap = subtract(p, a);
  const normal: Point = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const norm2 = dot(normal, normal);
  const ab2 = dot(ab, ab),
    ac2 = dot(ac, ac),
    abac = dot(ab, ac);
  if (norm2 > 0) {
    const u = (ac2 * dot(ap, ab) - abac * dot(ap, ac)) / norm2;
    const v = (ab2 * dot(ap, ac) - abac * dot(ap, ab)) / norm2;
    if (u >= 0 && v >= 0 && u + v <= 1) return Math.abs(dot(ap, normal)) / Math.sqrt(norm2);
  }
  const segmentDistance = (start: Point, end: Point) => {
    const edge = subtract(end, start),
      delta = subtract(p, start);
    const length2 = dot(edge, edge);
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, dot(delta, edge) / length2));
    return Math.hypot(delta[0] - t * edge[0], delta[1] - t * edge[1], delta[2] - t * edge[2]);
  };
  return Math.min(segmentDistance(a, b), segmentDistance(b, c), segmentDistance(c, a));
}

// Four interior samples and three samples on each edge, in the LINEAR source triangle.
// Independent of generator decisions; these are never used to choose knots or diagonals.
export const TRIANGLE_PROBES: readonly Point[] = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.6, 0.3, 0.1],
  [0.1, 0.6, 0.3],
  [0.3, 0.1, 0.6],
  [0.25, 0.75, 0],
  [0.5, 0.5, 0],
  [0.75, 0.25, 0],
  [0, 0.25, 0.75],
  [0, 0.5, 0.5],
  [0, 0.75, 0.25],
  [0.75, 0, 0.25],
  [0.5, 0, 0.5],
  [0.25, 0, 0.75],
];
// Identical held-out source positions for every distribution and resolution.
const FACE_PROBES = [0, 1e-12, 1e-9, 1e-6, 1e-4, 0.001, 0.01, 0.1, 0.25, 0.5, 0.9, 1];
export const MAX_QUALITY_SAMPLES = 2_600_000;

interface Metric {
  readonly max: number;
  readonly rms: number;
  readonly samples: number;
}
export interface BoundaryQuality {
  readonly metricRevision: "linear-barycentric-13-face-144-v1";
  readonly surfaceToTriangle: Metric;
  /** Chord point -> known exact point on its source face, NOT nearest distance. */
  readonly pairedCorrespondence: Metric;
  readonly commonFaceProbes: Metric;
  readonly faceMaxima: readonly number[];
  readonly worst: Readonly<{ triangle: number; face: number; weights: Point; linearRgb: Point }>;
  readonly conversions: number;
  readonly maxConversionBatchPoints: number;
}

/** Offline evidence calculation. Bounded work; no quality claim is attached to a generated mesh. */
export function measureBoundaryQuality(
  mesh: BoundaryMesh,
  maxSamples = MAX_QUALITY_SAMPLES,
):
  | Readonly<{ ok: true; value: BoundaryQuality }>
  | Readonly<{ ok: false; error: "resource-budget" | "numerical-failure" }> {
  const count = mesh.triangles.length / 3;
  const samples = count * TRIANGLE_PROBES.length;
  const commonCount = 6 * FACE_PROBES.length ** 2;
  if (
    !Number.isSafeInteger(maxSamples) ||
    maxSamples < 0 ||
    samples + commonCount > Math.min(maxSamples, MAX_QUALITY_SAMPLES)
  )
    return { ok: false, error: "resource-budget" };
  let max = 0,
    sum = 0,
    pairedMax = 0,
    pairedSum = 0;
  const faceMaxima = [0, 0, 0, 0, 0, 0];
  let worst: BoundaryQuality["worst"] = {
    triangle: 0,
    face: 0,
    weights: TRIANGLE_PROBES[0]!,
    linearRgb: [0, 0, 0],
  };
  // Bound temporary numeric buffers independently of mesh resolution.
  const batchTriangles = 256;
  for (let start = 0; start < count; start += batchTriangles) {
    const end = Math.min(count, start + batchTriangles);
    const source = new Float64Array((end - start) * TRIANGLE_PROBES.length * 3);
    for (let triangle = start; triangle < end; triangle++) {
      const indices = readPoint(mesh.triangles, triangle);
      const rgb = indices.map((index) => readPoint(mesh.linearRgb, index));
      TRIANGLE_PROBES.forEach((weights, probe) =>
        source.set(
          mix(rgb[0]!, rgb[1]!, rgb[2]!, weights),
          ((triangle - start) * TRIANGLE_PROBES.length + probe) * 3,
        ),
      );
    }
    const converted = linearRgbToOklabBatch(source, mesh.space);
    if (!converted.ok) return { ok: false, error: "numerical-failure" };
    for (let triangle = start; triangle < end; triangle++) {
      const indices = readPoint(mesh.triangles, triangle);
      const [a, b, c] = indices.map((index) => readPoint(mesh.positions, index)) as [
        Point,
        Point,
        Point,
      ];
      for (let probe = 0; probe < TRIANGLE_PROBES.length; probe++) {
        const sample = (triangle - start) * TRIANGLE_PROBES.length + probe;
        const [l, x, z] = readPoint(converted.value, sample);
        const surface: Point = [x, l, z];
        const weights = TRIANGLE_PROBES[probe]!;
        const distance = distanceToTriangle(surface, a, b, c);
        const chord = mix(a, b, c, weights);
        const paired = Math.hypot(...subtract(surface, chord));
        if (!Number.isFinite(distance) || !Number.isFinite(paired))
          return { ok: false, error: "numerical-failure" };
        if (distance > max) {
          max = distance;
          worst = {
            triangle,
            face: mesh.faces[triangle]!,
            weights,
            linearRgb: readPoint(source, sample),
          };
        }
        sum += distance ** 2;
        pairedMax = Math.max(pairedMax, paired);
        pairedSum += paired ** 2;
        const face = mesh.faces[triangle]!;
        faceMaxima[face] = Math.max(faceMaxima[face]!, distance);
      }
    }
  }
  const source = new Float64Array(commonCount * 3);
  let sample = 0;
  for (let face = 0; face < 6; face++) {
    const axis = Math.floor(face / 2),
      u = axis === 0 ? 1 : 0,
      v = axis === 2 ? 1 : 2;
    for (const x of FACE_PROBES)
      for (const y of FACE_PROBES) {
        source[3 * sample + axis] = face % 2;
        source[3 * sample + u] = x;
        source[3 * sample + v] = y;
        sample++;
      }
  }
  const converted = linearRgbToOklabBatch(source, mesh.space);
  if (!converted.ok) return { ok: false, error: "numerical-failure" };
  const cell = (value: number) => {
    let i = 0;
    while (i < mesh.subdivisions - 1 && mesh.knots[i + 1]! < value) i++;
    return i;
  };
  let commonMax = 0,
    commonSum = 0;
  sample = 0;
  for (let face = 0; face < 6; face++)
    for (const x of FACE_PROBES)
      for (const y of FACE_PROBES) {
        const first =
          face * 2 * mesh.subdivisions ** 2 + 2 * (cell(y) * mesh.subdivisions + cell(x));
        const [l, a, b] = readPoint(converted.value, sample++);
        const distance = Math.min(
          ...[first, first + 1].map((triangle) => {
            const [p, q, r] = readPoint(mesh.triangles, triangle).map((index) =>
              readPoint(mesh.positions, index),
            ) as [Point, Point, Point];
            return distanceToTriangle([a, l, b], p, q, r);
          }),
        );
        if (!Number.isFinite(distance)) return { ok: false, error: "numerical-failure" };
        commonMax = Math.max(commonMax, distance);
        commonSum += distance ** 2;
      }
  return {
    ok: true,
    value: {
      metricRevision: "linear-barycentric-13-face-144-v1",
      surfaceToTriangle: { max, rms: Math.sqrt(sum / samples), samples },
      pairedCorrespondence: { max: pairedMax, rms: Math.sqrt(pairedSum / samples), samples },
      commonFaceProbes: {
        max: commonMax,
        rms: Math.sqrt(commonSum / commonCount),
        samples: commonCount,
      },
      faceMaxima,
      worst,
      conversions: samples + commonCount,
      maxConversionBatchPoints: Math.max(
        Math.min(batchTriangles, count) * TRIANGLE_PROBES.length,
        commonCount,
      ),
    },
  };
}

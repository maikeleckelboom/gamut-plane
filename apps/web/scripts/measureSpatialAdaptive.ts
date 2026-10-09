import { performance } from "node:perf_hooks";
import { convert, OKLab, sRGBLinear, DisplayP3Linear } from "@texel/color";
import { Triangle, Vector3 } from "three";
import { generateBoundaryMesh } from "@gamut-plane/render/internal/spatial";
import { referenceLab, type Triple } from "../test/spatialReference.ts";

// Bounded, offline conforming experiment, deliberately excluded from runtime and package APIs.
// Mark all edges of failing triangles. Share every marked edge midpoint globally; fan every
// touched triangle around its independently converted RGB centroid. Neighbors use the SAME split.
const MAX_TRIANGLES = 150_000,
  MAX_ROUNDS = 10;
const pixelScale = (1080 / 1.42) * 12;
const training: Triple[] = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
];
const heldOut: Triple[] = [
  [0.17, 0.29, 0.54],
  [0.54, 0.17, 0.29],
  [0.29, 0.54, 0.17],
  [0.07, 0.81, 0.12],
  [0.81, 0.12, 0.07],
  [0.12, 0.07, 0.81],
  [0.125, 0.875, 0],
  [0.875, 0.125, 0],
  [0, 0.125, 0.875],
  [0, 0.875, 0.125],
  [0.875, 0, 0.125],
  [0.125, 0, 0.875],
];
const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
const rows = [];
for (const space of ["srgb", "display-p3"] as const) {
  const start = performance.now();
  const generated = generateBoundaryMesh({ space, subdivisions: 32, distribution: "cubic" });
  if (!generated.ok) throw new Error(generated.error);
  const base = generated.value;
  const points: Triple[] = [],
    source: Triple[] = [];
  for (let i = 0; i < base.positions.length; i += 3) {
    points.push([base.positions[i]!, base.positions[i + 1]!, base.positions[i + 2]!]);
    source.push([base.linearRgb[i]!, base.linearRgb[i + 1]!, base.linearRgb[i + 2]!]);
  }
  let triangles: { ids: Triple; face: number }[] = Array.from(base.faces, (face, t) => ({
    face,
    ids: [base.triangles[3 * t]!, base.triangles[3 * t + 1]!, base.triangles[3 * t + 2]!],
  }));
  const distance = (ids: Triple, weights: Triple) => {
    const rgb = [0, 1, 2].map((axis) =>
      ids.reduce((sum, id, i) => sum + source[id]![axis]! * weights[i]!, 0),
    ) as Triple;
    const [l, a, b] = referenceLab(rgb, space);
    const p = new Vector3(a, l, b),
      nearest = new Vector3();
    const [v0, v1, v2] = ids.map((id) => new Vector3(...(points[id]!.map(Math.fround) as Triple)));
    new Triangle(v0, v1, v2).closestPointToPoint(p, nearest);
    return { error: p.distanceTo(nearest), l };
  };
  const add = (rgb: Triple) => {
    const [l, a, b] = convert([...rgb], space === "srgb" ? sRGBLinear : DisplayP3Linear, OKLab);
    source.push(rgb);
    points.push([a!, l!, b!]);
    return points.length - 1;
  };
  const rounds = [];
  let status = "round-budget";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const marked = new Set<string>();
    let max = 0;
    for (const triangle of triangles) {
      const error = Math.max(...training.map((w) => distance(triangle.ids, w).error)) * pixelScale;
      max = Math.max(max, error);
      if (error > 0.35) {
        const [a, b, c] = triangle.ids;
        marked.add(key(a, b));
        marked.add(key(b, c));
        marked.add(key(c, a));
      }
    }
    rounds.push({
      round,
      vertices: points.length,
      triangles: triangles.length,
      trainingSpatialResidualInCssPixels: max,
      markedEdges: marked.size,
    });
    if (!marked.size) {
      status = "training-target-reached";
      break;
    }
    let predicted = 0;
    for (const {
      ids: [a, b, c],
    } of triangles) {
      const count = [key(a, b), key(b, c), key(c, a)].filter((edge) => marked.has(edge)).length;
      predicted += count ? 3 + count : 1;
    }
    if (predicted > MAX_TRIANGLES) {
      status = "triangle-budget";
      break;
    }
    const midpoints = new Map<string, number>();
    const next: typeof triangles = [];
    for (const triangle of triangles) {
      const polygon: number[] = [];
      triangle.ids.forEach((a, i) => {
        const b = triangle.ids[(i + 1) % 3]!,
          edge = key(a, b);
        polygon.push(a);
        if (marked.has(edge)) {
          let mid = midpoints.get(edge);
          if (mid === undefined) {
            mid = add(source[a]!.map((v, axis) => (v + source[b]![axis]!) / 2) as Triple);
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
          triangle.ids.reduce((sum, id) => sum + source[id]![axis]! / 3, 0),
        ) as Triple,
      );
      polygon.forEach((a, i) =>
        next.push({ ids: [a, polygon[(i + 1) % polygon.length]!, center], face: triangle.face }),
      );
    }
    triangles = next;
  }
  let max = 0,
    blackMax = 0,
    sum = 0,
    count = 0,
    minimumArea2 = Infinity;
  const edges = new Map<string, { incidence: number; orientation: number }>();
  for (const { ids, face } of triangles) {
    for (const weights of heldOut) {
      const result = distance(ids, weights);
      max = Math.max(max, result.error);
      sum += result.error ** 2;
      count++;
      if (result.l < 0.05) blackMax = Math.max(blackMax, result.error);
    }
    ids.forEach((a, i) => {
      const b = ids[(i + 1) % 3]!,
        edge = key(a, b),
        entry = edges.get(edge) ?? { incidence: 0, orientation: 0 };
      entry.incidence++;
      entry.orientation += a < b ? 1 : -1;
      edges.set(edge, entry);
      if (Math.abs(source[a]![Math.floor(face / 2)]! - (face % 2)) > 1e-14)
        throw new Error("Lost face provenance");
    });
    const [a, b, c] = ids.map((id) => new Vector3(...points[id]!));
    minimumArea2 = Math.min(
      minimumArea2,
      new Vector3().crossVectors(b!.sub(a!), c!.sub(a!)).length(),
    );
  }
  const closed = [...edges.values()].every(
    (edge) => edge.incidence === 2 && edge.orientation === 0,
  );
  const euler = points.length - edges.size + triangles.length;
  if (!closed || euler !== 2 || minimumArea2 <= 0)
    throw new Error("Conforming topology check failed");
  rows.push({
    space,
    status,
    rounds,
    final: {
      vertices: points.length,
      triangles: triangles.length,
      edges: edges.size,
      euler,
      oppositePairedEdgeIncidence: closed,
      minimumArea2,
      scientificNumericBytesEstimate: points.length * 48 + triangles.length * 13,
    },
    heldOut: {
      probesPerTriangle: heldOut.length,
      samples: count,
      oklabMax: max,
      oklabRms: Math.sqrt(sum / count),
      nearBlackOklabMax: blackMax,
      projectedUpperEstimateCssPixels: max * pixelScale,
      nearBlackProjectedUpperEstimateCssPixels: blackMax * pixelScale,
    },
    elapsedMs: performance.now() - start,
  });
}
console.log(
  JSON.stringify(
    {
      schema: 1,
      status: "offline-experiment-only",
      method: "global-shared-edge-midpoints-with-scientific-centroid-fans-v1",
      budget: { maxTriangles: MAX_TRIANGLES, maxRounds: MAX_ROUNDS },
      conditions: {
        stageHeight: 1080,
        homeHeight: 1.42,
        zoom: 12,
        targetCssPixels: 0.5,
        trainingThresholdCssPixels: 0.35,
      },
      metric:
        "Independent held-out 3D distance times orthographic CSS scale: conservative projection estimate at samples, not a continuous bound or actual silhouette metric",
      rows,
    },
    null,
    2,
  ),
);

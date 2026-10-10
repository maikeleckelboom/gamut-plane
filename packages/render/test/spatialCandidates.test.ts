import { describe, expect, it } from "vitest";
import { cubicGrid, radialHybrid, type HybridKnots } from "../experiments/spatial/candidates.ts";
import {
  ConeFace,
  distanceToTriangleScalarForTest,
  heldOutProbes,
  meshToTrue,
  projectToFace,
  TriangleGrid,
} from "../experiments/spatial/distance.ts";
import { faceOutwardNormal, faceRgb, scene, type Vec3 } from "../experiments/spatial/oracle.ts";
import {
  analyzeOrientation,
  analyzeStarShape,
  analyzeTopology,
  pairwiseIntersections,
} from "../experiments/spatial/topology.ts";

const spaces = ["srgb", "display-p3"] as const;
const policies: HybridKnots[] = ["linear", "encoded", "cubic"];

describe.each(spaces)("radial hybrid candidate: %s", (space) => {
  it.each([1, 2, 7, 16])("is a closed oriented sphere with the predicted counts, m=%i", (m) => {
    const mesh = radialHybrid(space, m, "linear");
    const topology = analyzeTopology(mesh);
    expect(topology.vertices).toBe(3 * m * m + 3 * m + 2);
    expect(topology.triangles).toBe(6 * m * m + 6 * m);
    expect(topology.edges).toBe(9 * m * m + 9 * m);
    expect(topology.euler).toBe(2);
    expect(topology.closedOrientedManifold).toBe(true);
    expect(topology.connectedComponents).toBe(1);
    expect(topology.unreferencedVertices).toBe(0);
    expect(topology.zeroAreaTriangles).toBe(0);
    expect(topology.faceProvenanceViolations).toBe(0);
    // Upper faces carry 2 m^2 triangles each, lower cone faces 2 m each.
    expect(topology.facePopulation).toEqual([2 * m, 2 * m * m, 2 * m, 2 * m * m, 2 * m, 2 * m * m]);
  });

  it.each(policies)("faces outward by the true surface normal for %s upper knots", (policy) => {
    const mesh = radialHybrid(space, 12, policy);
    const orientation = analyzeOrientation(mesh, space);
    expect(orientation.checked).toBeGreaterThan(300);
    expect(orientation.inwardTriangles).toBe(0);
  });

  it("is star-shaped about black: upper triangles outward, cone triangles exactly radial", () => {
    const mesh = radialHybrid(space, 16, "linear");
    const report = analyzeStarShape(mesh);
    expect(report.inwardFromBlack).toBe(0);
    // Exactly the 6m fan triangles contain black.
    expect(report.radial).toBe(6 * 16);
    expect(report.outwardFromBlack).toBe(6 * 16 * 16);
  });

  it("has no nonincident triangle intersections at small m", () => {
    for (const m of [4, 8]) {
      const result = pairwiseIntersections(radialHybrid(space, m, "linear"));
      expect(result.candidates).toBeGreaterThan(0);
      expect(result.intersections).toBe(0);
    }
  });
});

describe("production grid under the same diagnostics", () => {
  it("is closed and outward by the true normal, and mostly non-radial on the lower faces", () => {
    const mesh = cubicGrid("srgb", 8);
    expect(analyzeTopology(mesh).closedOrientedManifold).toBe(true);
    expect(analyzeOrientation(mesh, "srgb").inwardTriangles).toBe(0);
    // Only grid triangles with an edge on a black axis ray are radial (92 of the 384 lower-face
    // triangles at n=8); the rest are chords of a cone, unlike the hybrid's fans.
    const lowerTriangles = 3 * 2 * 8 * 8;
    expect(analyzeStarShape(mesh).radial).toBeLessThan(lowerTriangles / 2);
  });
});

describe("qualification metrics are themselves correct", () => {
  it("matches a brute-force nearest-triangle search on random points", () => {
    const mesh = radialHybrid("srgb", 8, "linear");
    const grid = new TriangleGrid(mesh.positions, mesh.triangles, 0.05);
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 300; i++) {
      const p: Vec3 = [random() * 0.8 - 0.4, random() * 1.1 - 0.05, random() * 0.7 - 0.4];
      let brute = Infinity;
      for (let t = 0; t < mesh.triangles.length / 3; t++) {
        const [a, b, c] = [0, 1, 2].map((k) => {
          const v = mesh.triangles[3 * t + k]!;
          return [
            mesh.positions[3 * v]!,
            mesh.positions[3 * v + 1]!,
            mesh.positions[3 * v + 2]!,
          ] as Vec3;
        }) as [Vec3, Vec3, Vec3];
        brute = Math.min(brute, distanceToTriangleScalarForTest(p, a, b, c));
      }
      expect(Math.abs(grid.nearest(p) - brute)).toBeLessThan(1e-12);
    }
  });

  it("recovers a known offset from the true upper surface by Gauss-Newton", () => {
    for (const space of spaces)
      for (const face of [1, 3, 5])
        for (const [u, v] of [
          [0.3, 0.7],
          [0.9, 0.1],
          [0.5, 0.5],
        ] as const) {
          const normal = faceOutwardNormal(face, u, v, space)!;
          const surface = scene(faceRgb(face, u, v), space);
          for (const offset of [0, 1e-3, -2e-3]) {
            const x = surface.map((c, k) => c + normal[k]! * offset) as Vec3;
            const result = projectToFace(x, face, [u + 0.05, v - 0.04], space);
            expect(result.distance).toBeLessThanOrEqual(Math.abs(offset) + 1e-9);
            expect(result.distance).toBeGreaterThan(Math.abs(offset) - 1e-6);
          }
        }
  });

  it("measures zero on the true cone faces and the known gap off them", () => {
    for (const space of spaces)
      for (const axis of [0, 1, 2]) {
        const cone = new ConeFace(axis, space);
        const u = axis === 0 ? 1 : 0,
          w = axis === 2 ? 1 : 2;
        for (const [a, b] of [
          [0.2, 0.9],
          [1, 0.4],
          [0.7, 1],
          [1e-6, 0.5],
          [0.01, 1],
        ] as const) {
          const q: Vec3 = [0, 0, 0];
          q[u] = a;
          q[w] = b;
          expect(cone.distance(scene(q, space))).toBeLessThan(2e-6);
        }
      }
  });

  it("evaluates the same held-out true points for every candidate and finds them on the surface", () => {
    const probes = heldOutProbes("srgb", 64);
    expect(probes.map((set) => set.name)).toEqual([
      "uniform-linear-rgb",
      "uniform-encoded-rgb",
      "near-black-geometric",
      "cube-edges",
    ]);
    expect(probes[0]!.scene.length / 3).toBe(6 * 64);
    expect(probes[2]!.scene.length / 3).toBe(6 * 144);
    // The fixed grid contains every vertex it was built from: a vertex-valued probe has zero error.
    const mesh = cubicGrid("srgb", 8);
    const grid = new TriangleGrid(mesh.positions, mesh.triangles, 0.05);
    expect(
      grid.nearest([
        mesh.positions[3 * 5]!,
        mesh.positions[3 * 5 + 1]!,
        mesh.positions[3 * 5 + 2]!,
      ]),
    ).toBe(0);
  });

  it("decays quadratically with m for encoded upper knots, and more slowly for linear knots", () => {
    const encoded = [8, 16].map((m) => meshToTrue(radialHybrid("srgb", m, "encoded"), "srgb"));
    expect(encoded[0]!.samples).toBe(4 * (6 * 64 + 48));
    // Chord sag is O(h^2): halving h cuts the error by about 4 (measured 3.95-3.99 from m=8 up).
    expect(encoded[0]!.upperFaces.max / encoded[1]!.upperFaces.max).toBeGreaterThan(3.5);
    // Linear knots are measurably worse at equal m and have not reached the asymptotic regime at
    // m=8..16 (measured ratio 2.5); this pins the behavior that motivated the encoded default.
    const linear = [8, 16].map((m) => meshToTrue(radialHybrid("srgb", m, "linear"), "srgb"));
    expect(linear[1]!.all.max).toBeLessThan(linear[0]!.all.max);
    expect(linear[0]!.upperFaces.max / linear[1]!.upperFaces.max).toBeLessThan(3);
    expect(linear[1]!.upperFaces.max).toBeGreaterThan(5 * encoded[1]!.upperFaces.max);
  });
});

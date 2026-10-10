import { describe, expect, it } from "vitest";
import { gamutRayCrossings } from "@gamut-plane/core/internal/capabilities";
import {
  generateRadialBoundaryMesh,
  MAX_RADIAL_SUBDIVISIONS,
} from "../src/spatial/radialBoundaryMesh.js";
import { generateBoundaryMesh, quantizeBoundaryPositions } from "../src/spatial/boundaryMesh.js";
import type { BoundaryMesh } from "../src/spatial/boundaryMesh.js";
import { radialHybrid, type CandidateMesh } from "../experiments/spatial/candidates.ts";
import {
  heldOutProbes,
  meshToTrue,
  TriangleGrid,
  trueToMesh,
} from "../experiments/spatial/distance.ts";
import { constantHueSections, constantLightnessSections } from "../experiments/spatial/sections.ts";
import {
  analyzeOrientation,
  analyzeStarShape,
  analyzeTopology,
  pairwiseIntersections,
} from "../experiments/spatial/topology.ts";
import type { Space } from "../experiments/spatial/oracle.ts";

const spaces = ["srgb", "display-p3"] as const;
const knots = ["linear", "encoded", "cubic"] as const;

function radial(
  space: Space,
  subdivisions: number,
  upperKnots: (typeof knots)[number] = "encoded",
) {
  const result = generateRadialBoundaryMesh({ space, subdivisions, upperKnots });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
/** The same buffers under the experiment harness's candidate shape. */
const asCandidate = (mesh: BoundaryMesh): CandidateMesh => ({
  id: `production-${mesh.subdivisions}`,
  family: "radial-hybrid",
  space: mesh.space,
  positions: mesh.positions,
  linearRgb: mesh.linearRgb,
  triangles: mesh.triangles,
  faces: mesh.faces,
  parameters: {},
  generationMs: 0,
});

describe.each(spaces)("radial boundary mesh: %s", (space) => {
  it.each([1, 2, 7, 16])("is a closed oriented sphere with V=3n^2+3n+2, F=6n^2+6n, n=%i", (n) => {
    const mesh = radial(space, n);
    expect(mesh.topology).toBe("radial-hybrid-v1");
    expect(mesh.generatorRevision).toBe("rgb-radial-hybrid-v1");
    expect(mesh.quality.status).toBe("unqualified-reference");
    expect(mesh.quality.vertexConversions).toBe(3 * n * n + 3 * n + 2);
    const topology = analyzeTopology(asCandidate(mesh));
    expect(topology.vertices).toBe(3 * n * n + 3 * n + 2);
    expect(topology.triangles).toBe(6 * n * n + 6 * n);
    expect(topology.edges).toBe(9 * n * n + 9 * n);
    expect(topology.euler).toBe(2);
    expect(topology.closedOrientedManifold).toBe(true);
    expect(topology.connectedComponents).toBe(1);
    expect(topology.unreferencedVertices).toBe(0);
    expect(topology.zeroAreaTriangles).toBe(0);
    expect(topology.faceProvenanceViolations).toBe(0);
    expect(topology.facePopulation).toEqual([2 * n, 2 * n * n, 2 * n, 2 * n * n, 2 * n, 2 * n * n]);
  });

  it("keeps scientific coordinates unscaled, finite and inside the reported bounds", () => {
    const mesh = radial(space, 16);
    for (let i = 0; i < mesh.positions.length; i += 3)
      for (let axis = 0; axis < 3; axis++) {
        const v = mesh.positions[i + axis]!;
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(mesh.bounds.min[axis]!);
        expect(v).toBeLessThanOrEqual(mesh.bounds.max[axis]!);
      }
    // White is the top of the neutral axis, black the origin: no centering or scaling.
    const white = mesh.linearRgb.findIndex(
      (_, i) =>
        i % 3 === 0 &&
        mesh.linearRgb[i] === 1 &&
        mesh.linearRgb[i + 1] === 1 &&
        mesh.linearRgb[i + 2] === 1,
    );
    expect(mesh.positions[white + 1]).toBeCloseTo(1, 12);
    expect(Math.hypot(...Array.from(mesh.positions.subarray(-3)))).toBe(0); // black apex is last
  });

  it("is deterministic and equals the independent experiment implementation bit for bit", () => {
    for (const upperKnots of knots)
      for (const n of [1, 4, 16, 64]) {
        const mesh = radial(space, n, upperKnots);
        const repeated = radial(space, n, upperKnots);
        const independent = radialHybrid(space, n, upperKnots);
        for (const key of ["positions", "triangles", "faces", "linearRgb"] as const) {
          expect(repeated[key]).toEqual(mesh[key]);
          expect(independent[key]).toEqual(mesh[key]);
        }
      }
  });

  it.each(knots)("faces outward by the true surface normal for %s upper knots", (upperKnots) => {
    const orientation = analyzeOrientation(asCandidate(radial(space, 12, upperKnots)), space);
    expect(orientation.checked).toBeGreaterThan(300);
    expect(orientation.inwardTriangles).toBe(0);
  });

  it("is star-shaped about black with exactly radial fans, which embeds it", () => {
    for (const n of [4, 16, 64]) {
      const report = analyzeStarShape(asCandidate(radial(space, n)));
      expect(report.inwardFromBlack).toBe(0);
      expect(report.radial).toBe(6 * n); // every fan triangle contains black, no other does
      expect(report.outwardFromBlack).toBe(6 * n * n);
    }
  });

  it("has no nonincident triangle intersections at small n", () => {
    for (const n of [4, 8]) {
      const result = pairwiseIntersections(asCandidate(radial(space, n)));
      expect(result.candidates).toBeGreaterThan(0);
      expect(result.intersections).toBe(0);
    }
  });

  it("represents the faces through black exactly as cones by homogeneity", () => {
    // F(tq) = t^(1/3) F(q): fan triangles contain black, so each rim edge is the cone's chord only.
    const mesh = radial(space, 16);
    const black = mesh.positions.length / 3 - 1;
    let fans = 0;
    for (let t = 0; t < mesh.faces.length; t++) {
      if (mesh.faces[t]! & 1) continue;
      fans++;
      expect([...mesh.triangles.subarray(3 * t, 3 * t + 3)]).toContain(black);
    }
    expect(fans).toBe(6 * 16);
  });

  it("keeps Float32 upload deviation near 3e-8 with no degenerate triangle", () => {
    const mesh = radial(space, 64);
    const upload = quantizeBoundaryPositions(mesh);
    expect(upload.maxVertexDeviation).toBeLessThan(5e-8);
    for (let t = 0; t < mesh.faces.length; t++) {
      const [a, b, c] = [0, 1, 2].map((k) => mesh.triangles[3 * t + k]! * 3);
      const p = upload.positions;
      const u = [0, 1, 2].map((k) => p[b! + k]! - p[a! + k]!);
      const v = [0, 1, 2].map((k) => p[c! + k]! - p[a! + k]!);
      expect(
        Math.hypot(
          u[1]! * v[2]! - u[2]! * v[1]!,
          u[2]! * v[0]! - u[0]! * v[2]!,
          u[0]! * v[1]! - u[1]! * v[0]!,
        ),
      ).toBeGreaterThan(0);
    }
  });

  it("meets the sampled accuracy gate at m=32 in both directions and near black", () => {
    const mesh = asCandidate(radial(space, 32));
    const grid = new TriangleGrid(mesh.positions, mesh.triangles, 0.04);
    const worst = Math.max(
      ...heldOutProbes(space, 512).map((set) => trueToMesh(grid, set).all.max),
    );
    const surface = meshToTrue(mesh, space);
    // Measured about 5.5e-5 / 6e-5 (halves twice per doubling of m); gates carry margin.
    expect(worst).toBeLessThan(9e-5);
    expect(surface.all.max).toBeLessThan(9e-5);
    expect(surface.nearBlack.max).toBeLessThan(1e-5);
  });

  it("meets the m=64 gate, which clears the proposed 0.5 CSS px target at 12x by a wide margin", () => {
    const mesh = asCandidate(radial(space, 64));
    const grid = new TriangleGrid(mesh.positions, mesh.triangles, 0.04);
    const worst = Math.max(
      ...heldOutProbes(space, 1024).map((set) => trueToMesh(grid, set).all.max),
    );
    // 900 px stage over 1.42 scene units, zoom 12.
    const pixels = worst * (900 / 1.42) * 12;
    expect(worst).toBeLessThan(2.2e-5);
    expect(pixels).toBeLessThan(0.2);
  });

  it("matches core's exact section crossings: hue lower boundary and constant lightness", () => {
    const mesh = asCandidate(radial(space, 64));
    const hue = constantHueSections(mesh, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    expect(hue.lowerBoundary.max).toBeLessThan(3e-6); // lower boundary is an exact ray from black
    expect(hue.boundaryDistance.max).toBeLessThan(2.2e-5);
    const lightness = constantLightnessSections(mesh);
    expect(lightness.countMismatches).toBe(0);
    expect(lightness.planeDistance.max).toBeLessThan(2.2e-5);
  });
});

describe("section fixtures from the fixed-grid qualification, against the radial mesh", () => {
  // The Phase 3A fixture points, including the notch with three crossings; gate 0.0007 there.
  const fixtures = [
    { space: "srgb", l: 0.44, h: 264.1 },
    { space: "srgb", l: 0.006, h: 264.125 },
    { space: "srgb", l: 0.6, h: 30 },
    { space: "srgb", l: 0.5, h: 180 },
    { space: "srgb", l: 0.99, h: 90 },
    { space: "display-p3", l: 0.44, h: 264.1 },
    { space: "display-p3", l: 0.006, h: 264.125 },
    { space: "display-p3", l: 0.6, h: 30 },
    { space: "display-p3", l: 0.5, h: 180 },
    { space: "display-p3", l: 0.99, h: 90 },
  ] as const;
  it.each(fixtures)("stays within 3e-5 of every boundary point: $space L=$l h=$h", (fixture) => {
    const mesh = radial(fixture.space, 64);
    const crossings = gamutRayCrossings(fixture.l, fixture.h, fixture.space);
    expect(crossings.length).toBeGreaterThan(0);
    const radians = (fixture.h * Math.PI) / 180;
    for (const { chroma, binding } of crossings) {
      const point = [chroma * Math.cos(radians), fixture.l, chroma * Math.sin(radians)] as const;
      let nearest = Infinity;
      // The core crossing names its binding face; the radial mesh keeps the same face bytes.
      for (let t = 0; t < mesh.faces.length; t++) {
        if (mesh.faces[t] !== binding) continue;
        const [a, b, c] = [0, 1, 2].map((k) => mesh.triangles[3 * t + k]! * 3);
        const p = mesh.positions;
        const d = distanceToTriangle(
          point,
          [p[a!]!, p[a! + 1]!, p[a! + 2]!],
          [p[b!]!, p[b! + 1]!, p[b! + 2]!],
          [p[c!]!, p[c! + 1]!, p[c! + 2]!],
        );
        nearest = Math.min(nearest, d);
      }
      expect(nearest).toBeLessThan(3e-5);
    }
  });
});

describe("radial generator contract", () => {
  it("refuses invalid options and over-budget resolutions without returning a partial mesh", () => {
    // @ts-expect-error runtime boundary for untyped callers
    expect(generateRadialBoundaryMesh({ space: "rec2020", subdivisions: 4 })).toEqual({
      ok: false,
      error: "invalid-options",
    });
    for (const subdivisions of [0, -1, 2.5, NaN, Infinity])
      expect(generateRadialBoundaryMesh({ space: "srgb", subdivisions })).toEqual({
        ok: false,
        error: "invalid-options",
      });
    expect(
      // @ts-expect-error runtime boundary for untyped callers
      generateRadialBoundaryMesh({ space: "srgb", subdivisions: 4, upperKnots: "quadratic" }),
    ).toEqual({ ok: false, error: "invalid-options" });
    expect(
      generateRadialBoundaryMesh({ space: "srgb", subdivisions: MAX_RADIAL_SUBDIVISIONS + 1 }),
    ).toEqual({ ok: false, error: "resource-budget" });
    expect(
      generateRadialBoundaryMesh({ space: "srgb", subdivisions: MAX_RADIAL_SUBDIVISIONS }).ok,
    ).toBe(true);
  });

  it("leaves the fixed-grid generator unchanged apart from its topology label", () => {
    const grid = generateBoundaryMesh({ space: "srgb", subdivisions: 8, distribution: "cubic" });
    if (!grid.ok) throw new Error(grid.error);
    expect(grid.value.topology).toBe("cube-grid-v1");
    expect(grid.value.generatorRevision).toBe("rgb-cube-grid-v1");
    expect(grid.value.positions.length / 3).toBe(6 * 8 * 8 + 2);
  });

  it("is smaller than the fixed grid at equal accuracy class", () => {
    const grid = generateBoundaryMesh({ space: "srgb", subdivisions: 64, distribution: "cubic" });
    if (!grid.ok) throw new Error(grid.error);
    const hybrid = radial("srgb", 64);
    expect(hybrid.faces.length).toBeLessThan(grid.value.faces.length / 1.9);
    expect(hybrid.quality.bufferBytes).toBeLessThan(grid.value.quality.bufferBytes / 1.9);
  });
});

function distanceToTriangle(
  p: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
) {
  const sub = (x: readonly number[], y: readonly number[]) => x.map((v, i) => v - y[i]!);
  const dot = (x: readonly number[], y: readonly number[]) =>
    x.reduce((s, v, i) => s + v * y[i]!, 0);
  const ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a);
  const n = [
    ab[1]! * ac[2]! - ab[2]! * ac[1]!,
    ab[2]! * ac[0]! - ab[0]! * ac[2]!,
    ab[0]! * ac[1]! - ab[1]! * ac[0]!,
  ];
  const n2 = dot(n, n);
  const u = (dot(ac, ac) * dot(ap, ab) - dot(ab, ac) * dot(ap, ac)) / n2;
  const v = (dot(ab, ab) * dot(ap, ac) - dot(ab, ac) * dot(ap, ab)) / n2;
  if (u >= 0 && v >= 0 && u + v <= 1) return Math.abs(dot(ap, n)) / Math.sqrt(n2);
  const segment = (s: readonly number[], e: readonly number[]) => {
    const edge = sub(e, s),
      d = sub(p, s);
    const t = Math.max(0, Math.min(1, dot(d, edge) / dot(edge, edge)));
    return Math.hypot(...d.map((x, i) => x - t * edge[i]!));
  };
  return Math.min(segment(a, b), segment(b, c), segment(c, a));
}

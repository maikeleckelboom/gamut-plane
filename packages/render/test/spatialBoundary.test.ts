import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import * as numericCore from "@gamut-plane/core/internal/capabilities";
import { linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import {
  generateBoundaryMesh,
  MAX_SPATIAL_SUBDIVISIONS,
  quantizeBoundaryPositions,
  type BoundaryMesh,
  type KnotDistribution,
} from "../src/spatial/boundaryMesh.js";
import { distanceToTriangle, measureBoundaryQuality, readPoint } from "../src/spatial/quality.js";
import type { BoundaryQuality } from "../src/spatial/quality.js";

const recordedEvidence = JSON.parse(
  readFileSync(
    new URL("../../../docs/phase-3a-spatial-measurements.json", import.meta.url),
    "utf8",
  ),
) as {
  rows: { space: string; distribution: string; subdivisions: number; quality: BoundaryQuality }[];
};

const spaces = ["srgb", "display-p3"] as const;
const distributions: readonly KnotDistribution[] = ["linear", "encoded", "cubic"];
const cases = spaces.flatMap((space) =>
  distributions.flatMap((distribution) =>
    [1, 2, 7, 16].map((subdivisions) => ({ space, distribution, subdivisions })),
  ),
);
function generate(options: Parameters<typeof generateBoundaryMesh>[0]): BoundaryMesh {
  const result = generateBoundaryMesh(options);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const subtract = (a: readonly number[], b: readonly number[]) => a.map((value, i) => value - b[i]!);
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, value, i) => sum + value * b[i]!, 0);

function inspectTopology(mesh: BoundaryMesh) {
  const vertexCount = mesh.positions.length / 3;
  const edges = new Map<string, { count: number; direction: number }>();
  const neighbors = Array.from({ length: vertexCount }, () => new Set<number>());
  const provenance = Array.from({ length: vertexCount }, () => new Set<number>());
  let minimumArea2 = Infinity,
    constraintsValid = true;
  for (let triangle = 0; triangle < mesh.faces.length; triangle++) {
    const ids = readPoint(mesh.triangles, triangle);
    const points = ids.map((id) => readPoint(mesh.positions, id));
    minimumArea2 = Math.min(
      minimumArea2,
      Math.hypot(...cross(subtract(points[1]!, points[0]!), subtract(points[2]!, points[0]!))),
    );
    const face = mesh.faces[triangle]!;
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge]!,
        b = ids[(edge + 1) % 3]!;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const current = edges.get(key) ?? { count: 0, direction: 0 };
      current.count++;
      current.direction += a < b ? 1 : -1;
      edges.set(key, current);
      neighbors[a]!.add(b);
      neighbors[b]!.add(a);
      provenance[a]!.add(face);
      constraintsValid &&= mesh.linearRgb[3 * a + Math.floor(face / 2)] === face % 2;
    }
  }
  const visited = new Set<number>([0]),
    pending = [0];
  while (pending.length)
    for (const neighbor of neighbors[pending.pop()!]!)
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
  expect(visited.size).toBe(vertexCount);
  expect([...edges.values()].every(({ count, direction }) => count === 2 && direction === 0)).toBe(
    true,
  );
  expect(vertexCount - edges.size + mesh.faces.length).toBe(2);
  expect(constraintsValid).toBe(true);
  expect(minimumArea2).toBeGreaterThan(0);
  const sourceKeys = new Set<string>();
  let seamsValid = true;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const source = readPoint(mesh.linearRgb, vertex);
    sourceKeys.add(source.join(","));
    seamsValid &&=
      provenance[vertex]!.size === source.filter((value) => value === 0 || value === 1).length;
  }
  expect(sourceKeys.size).toBe(vertexCount);
  expect(seamsValid).toBe(true);
}

describe("scientific boundary construction", () => {
  it("locks the canonical corner indexing and all six face orientations", () => {
    const mesh = generate({ space: "srgb", distribution: "linear", subdivisions: 1 });
    expect([...mesh.triangles]).toEqual([
      0, 2, 6, 0, 6, 4, 1, 7, 3, 1, 5, 7, 0, 5, 1, 0, 4, 5, 2, 3, 7, 2, 7, 6, 0, 1, 3, 0, 3, 2, 4,
      7, 5, 4, 6, 7,
    ]);
    expect([...mesh.faces]).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("fails without partial geometry when conversion collapses or fails", () => {
    const spy = vi.spyOn(numericCore, "linearRgbToOklabBatch");
    try {
      spy.mockImplementation((input) => ({ ok: true, value: new Float64Array(input.length) }));
      expect(
        generateBoundaryMesh({ space: "srgb", distribution: "cubic", subdivisions: 2 }),
      ).toEqual({ ok: false, error: "numerical-failure" });
      spy.mockReturnValue({ ok: false, error: { code: "numerical-range" } });
      expect(
        generateBoundaryMesh({ space: "srgb", distribution: "linear", subdivisions: 2 }),
      ).toEqual({ ok: false, error: "numerical-failure" });
    } finally {
      spy.mockRestore();
    }
  });
  it.each(cases)("has welded, closed, connected and oriented topology: %o", (options) => {
    const mesh = generate(options),
      n = options.subdivisions;
    expect(mesh.positions.length / 3).toBe(6 * n ** 2 + 2);
    expect(mesh.faces.length).toBe(12 * n ** 2);
    inspectTopology(mesh);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.linearRgb.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(mesh.coordinates).toBe("oklab-a-l-b");
    for (let axis = 0; axis < 3; axis++) {
      const components = mesh.positions.filter((_, index) => index % 3 === axis);
      expect(mesh.bounds.min[axis]).toBe(Math.min(...components));
      expect(mesh.bounds.max[axis]).toBe(Math.max(...components));
    }
    // Verify winding in scene space against the mapped inward direction at EVERY triangle centroid.
    // No convexity/center-of-volume assumption.
    const source = new Float64Array(mesh.faces.length * 6);
    for (let triangle = 0; triangle < mesh.faces.length; triangle++) {
      const ids = readPoint(mesh.triangles, triangle);
      for (let axis = 0; axis < 3; axis++) {
        const value = ids.reduce((sum, id) => sum + mesh.linearRgb[3 * id + axis]! / 3, 0);
        source[6 * triangle + axis] = value;
        source[6 * triangle + 3 + axis] = value;
      }
      const face = mesh.faces[triangle]!;
      source[6 * triangle + 3 + Math.floor(face / 2)]! += (face % 2 === 0 ? 1 : -1) * 1e-7;
    }
    const converted = linearRgbToOklabBatch(source, options.space);
    if (!converted.ok) throw new Error(converted.error.code);
    let largestDot = -Infinity;
    for (let triangle = 0; triangle < mesh.faces.length; triangle++) {
      const [a, b, c] = readPoint(mesh.triangles, triangle).map((id) =>
        readPoint(mesh.positions, id),
      );
      const normal = cross(subtract(b!, a!), subtract(c!, a!));
      const [dl, da, db] = subtract(
        readPoint(converted.value, 2 * triangle + 1),
        readPoint(converted.value, 2 * triangle),
      );
      largestDot = Math.max(largestDot, dot(normal, [da!, dl!, db!]));
    }
    expect(largestDot).toBeLessThan(0);
  });

  it.each(spaces)(
    "validates maximum-budget topology and exact-analysis surface observations: %s",
    (space) => {
      const mesh = generate({
        space,
        distribution: "cubic",
        subdivisions: MAX_SPATIAL_SUBDIVISIONS,
      });
      inspectTopology(mesh);
      // All vertices at a smaller grid, including every face, edge, corner and black/white.
      const observed = generate({ space, distribution: "cubic", subdivisions: 8 });
      let largestBoundaryResidual = 0;
      for (let vertex = 0; vertex < observed.positions.length / 3; vertex++) {
        const [a, l, b] = readPoint(observed.positions, vertex);
        const value = createColorValue({ space: "oklab", channels: [l, a, b], alpha: 1 });
        if (!value.ok) throw new Error(value.error.code);
        const result = analyzeGamut(value.value, mesh.gamut);
        if (!result.ok) throw new Error(result.error.code);
        expect(result.value.status).not.toBe("outside");
        const rgb = readPoint(observed.linearRgb, vertex);
        largestBoundaryResidual = Math.max(
          largestBoundaryResidual,
          ...rgb.map((v, axis) => Math.abs(v - result.value.linearRgb[axis]!)),
        );
      }
      expect(largestBoundaryResidual).toBeLessThan(1e-12);
      expect(mesh.quality.vertexConversions).toBe(6 * MAX_SPATIAL_SUBDIVISIONS ** 2 + 2);
    },
  );

  it("is deterministic, keeps Float64 authority and reports Float32 separately", () => {
    for (const space of spaces)
      for (const distribution of distributions) {
        const options = { space, distribution, subdivisions: 16 };
        const mesh = generate(options);
        expect(generate(options)).toEqual(mesh);
        const scientific = mesh.positions.slice(),
          upload = quantizeBoundaryPositions(mesh);
        expect(mesh.positions).toEqual(scientific);
        expect(upload.positions).toBeInstanceOf(Float32Array);
        expect(upload.maxVertexDeviation).toBeGreaterThan(0);
        expect(upload.maxVertexDeviation).toBeLessThan(4e-8); // finite fixture gate, not universal precision
        expect(upload.rmsVertexDeviation).toBeLessThan(upload.maxVertexDeviation);
        const allBytes =
          mesh.positions.byteLength +
          mesh.linearRgb.byteLength +
          mesh.triangles.byteLength +
          mesh.faces.byteLength +
          mesh.knots.byteLength;
        expect(mesh.quality.bufferBytes).toBe(allBytes);
      }
  });

  it("rejects invalid and over-budget requests before allocation", () => {
    // @ts-expect-error runtime validation
    expect(generateBoundaryMesh(null)).toEqual({ ok: false, error: "invalid-options" });
    for (const subdivisions of [0, -1, 1.5, NaN, Infinity])
      expect(generateBoundaryMesh({ space: "srgb", distribution: "cubic", subdivisions })).toEqual({
        ok: false,
        error: "invalid-options",
      });
    expect(
      generateBoundaryMesh({ space: "srgb", distribution: "linear", subdivisions: 129 }),
    ).toEqual({ ok: false, error: "resource-budget" });
    expect(
      // @ts-expect-error runtime validation
      generateBoundaryMesh({ space: "rec2020", distribution: "linear", subdivisions: 8 }),
    ).toEqual({ ok: false, error: "invalid-options" });
    expect(
      // @ts-expect-error runtime validation
      generateBoundaryMesh({ space: "srgb", distribution: "adaptive", subdivisions: 8 }),
    ).toEqual({ ok: false, error: "invalid-options" });
  });

  it.each(spaces)(
    "does not confuse mesh chords or quantized positions with exact membership: %s",
    (space) => {
      const mesh = generate({ space, subdivisions: 8, distribution: "cubic" });
      const upload = quantizeBoundaryPositions(mesh);
      let outsideChords = 0,
        outsideFloat32 = 0;
      const status = (point: readonly number[]) => {
        const value = createColorValue({
          space: "oklab",
          channels: [point[1]!, point[0]!, point[2]!],
          alpha: 1,
        });
        if (!value.ok) throw new Error(value.error.code);
        const analysis = analyzeGamut(value.value, mesh.gamut);
        if (!analysis.ok) throw new Error(analysis.error.code);
        return analysis.value.status;
      };
      for (let triangle = 0; triangle < mesh.faces.length; triangle++) {
        const indices = readPoint(mesh.triangles, triangle);
        const point = [0, 1, 2].map((axis) =>
          indices.reduce((sum, index) => sum + mesh.positions[3 * index + axis]! / 3, 0),
        );
        if (status(point) === "outside") outsideChords++;
      }
      for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++)
        if (status(readPoint(upload.positions, vertex)) === "outside") outsideFloat32++;
      expect(outsideChords).toBeGreaterThan(0);
      expect(outsideFloat32).toBeGreaterThan(0);
    },
  );
});

describe("sampled approximation evidence", () => {
  it("checks distance metrics independently, including degeneracy and outside projections", () => {
    expect(distanceToTriangle([0.25, 0.25, 2], [0, 0, 0], [1, 0, 0], [0, 1, 0])).toBe(2);
    expect(distanceToTriangle([1, 1, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0])).toBeCloseTo(
      Math.SQRT1_2,
      14,
    );
    expect(distanceToTriangle([0.5, 2, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0])).toBe(2);
    expect(distanceToTriangle([0, 3, 4], [0, 0, 0], [0, 0, 0], [0, 0, 0])).toBe(5);
  });
  it.each(spaces)("compares identical budgets and held-out face probes: %s", (space) => {
    const reports = distributions.map((distribution) => {
      const mesh = generate({ space, distribution, subdivisions: 16 });
      expect(measureBoundaryQuality(mesh, 0)).toEqual({ ok: false, error: "resource-budget" });
      const result = measureBoundaryQuality(mesh);
      if (!result.ok) throw new Error(result.error);
      const recorded = recordedEvidence.rows.find(
        (row) =>
          row.space === space && row.distribution === distribution && row.subdivisions === 16,
      );
      expect(recorded).toBeDefined();
      for (const metric of [
        "surfaceToTriangle",
        "pairedCorrespondence",
        "commonFaceProbes",
      ] as const) {
        expect(result.value[metric].max).toBeCloseTo(recorded!.quality[metric].max, 12);
        expect(result.value[metric].rms).toBeCloseTo(recorded!.quality[metric].rms, 12);
        expect(result.value[metric].samples).toBe(recorded!.quality[metric].samples);
      }
      expect(result.value.surfaceToTriangle.samples).toBe(12 * 16 ** 2 * 13);
      expect(result.value.commonFaceProbes.samples).toBe(864);
      expect(result.value.faceMaxima).toHaveLength(6);
      expect(result.value.pairedCorrespondence.max).toBeGreaterThanOrEqual(
        result.value.surfaceToTriangle.max,
      );
      expect(result.value.surfaceToTriangle.max).toBeLessThan(0.017);
      return result.value;
    });
    expect(reports[2]!.surfaceToTriangle.max).toBeLessThan(reports[1]!.surfaceToTriangle.max / 2);
    expect(reports[1]!.surfaceToTriangle.max).toBeLessThan(reports[0]!.surfaceToTriangle.max);
    expect(reports[2]!.commonFaceProbes.max).toBeLessThan(reports[1]!.commonFaceProbes.max);
  });
});

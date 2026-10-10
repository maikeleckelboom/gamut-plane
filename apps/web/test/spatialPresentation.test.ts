// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateBoundaryMesh } from "@gamut-plane/render/internal/spatial";
import { createSilhouetteTopology, extractSilhouette } from "../src/spatial/silhouette";
import { createBodyProbe, isOccluded } from "../src/spatial/occlusion";
import { referenceLab, type Triple } from "./spatialReference";

const views: Triple[] = [
  [1.35, 0.8, 1.65],
  [-0.4, 0.1, -2],
  [2, 0.1, 0.1],
  [0, 1, 0],
  [0.3, -1, 0.2],
  [-1, 0.3, 0.7],
].map((v) => {
  const length = Math.hypot(...v);
  return v.map((x) => x / length) as Triple;
});

function mesh(space: "srgb" | "display-p3", subdivisions: number) {
  const result = generateBoundaryMesh({ space, subdivisions, distribution: "cubic" });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe.each(["srgb", "display-p3"] as const)("silhouette of the %s boundary mesh", (space) => {
  const boundary = mesh(space, 16);
  const topology = createSilhouetteTopology(boundary);

  it("pairs every edge of the closed mesh with exactly two triangles", () => {
    // Closed triangulated sphere: E = 18 n^2, and no edge keeps a single incident triangle.
    expect(topology.edgeTriangles.length / 2).toBe(18 * 16 * 16);
    for (let edge = 0; edge < topology.edgeTriangles.length / 2; edge++)
      expect(topology.edgeTriangles[2 * edge]).not.toBe(topology.edgeTriangles[2 * edge + 1]);
  });

  it.each(views)("forms closed loops with the extremal vertices on it for view %#", (...view) => {
    const out = new Float32Array(6 * 20000);
    const { segments, truncated } = extractSilhouette(topology, boundary.positions, view, out);
    expect(truncated).toBe(false);
    expect(segments).toBeGreaterThan(8);
    // A silhouette of a closed surface is a union of closed curves: even degree at every vertex.
    const degree = new Map<string, number>();
    for (let i = 0; i < segments; i++)
      for (const o of [0, 3]) {
        const key = `${out[6 * i + o]},${out[6 * i + o + 1]},${out[6 * i + o + 2]}`;
        degree.set(key, (degree.get(key) ?? 0) + 1);
      }
    for (const count of degree.values()) expect(count % 2).toBe(0);
    // Independent of the facing test: the vertex extreme in any screen direction is a silhouette
    // vertex of a closed mesh, so the silhouette's screen extent equals the whole mesh's.
    const up: Triple = Math.abs(view[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    const right = cross(up, view);
    const rightLength = Math.hypot(...right);
    const screenX = right.map((v) => v / rightLength) as Triple;
    const screenY = cross(view, screenX);
    const extent = (points: Iterable<Triple>) => {
      const box = [Infinity, -Infinity, Infinity, -Infinity];
      for (const p of points) {
        const x = dot(p, screenX),
          y = dot(p, screenY);
        box[0] = Math.min(box[0]!, x);
        box[1] = Math.max(box[1]!, x);
        box[2] = Math.min(box[2]!, y);
        box[3] = Math.max(box[3]!, y);
      }
      return box;
    };
    const all: Triple[] = [];
    for (let i = 0; i < boundary.positions.length; i += 3)
      all.push([boundary.positions[i]!, boundary.positions[i + 1]!, boundary.positions[i + 2]!]);
    const outline: Triple[] = [];
    for (let i = 0; i < segments; i++)
      for (const o of [0, 3])
        outline.push([out[6 * i + o]!, out[6 * i + o + 1]!, out[6 * i + o + 2]!]);
    // Outline points are Float32 copies of Float64 vertices.
    extent(all).forEach((value, k) => expect(extent(outline)[k]).toBeCloseTo(value, 6));
  });

  it("reports truncation instead of overrunning a small buffer", () => {
    const out = new Float32Array(6 * 4);
    const result = extractSilhouette(topology, boundary.positions, views[0]!, out);
    expect(result).toEqual({ segments: 4, truncated: true });
  });

  it("gives the same outline from opposite viewing directions", () => {
    const front = new Float32Array(6 * 20000),
      back = new Float32Array(6 * 20000);
    const a = extractSilhouette(topology, boundary.positions, views[0]!, front);
    const b = extractSilhouette(
      topology,
      boundary.positions,
      views[0]!.map((v) => -v) as Triple,
      back,
    );
    expect(b.segments).toBe(a.segments);
  });
});

it("rejects an open mesh instead of drawing a wrong outline", () => {
  const boundary = mesh("srgb", 2);
  const open = {
    ...boundary,
    triangles: boundary.triangles.slice(0, boundary.triangles.length - 3),
  };
  expect(() => createSilhouetteTopology(open)).toThrow(/closed/);
});

describe("label occlusion probe", () => {
  const probe = createBodyProbe("srgb");
  it("classifies the scientific body from independent fixtures", () => {
    // Mid gray and the sRGB primaries are in the closed body; a strongly negative a at L=0.5 is not.
    for (const rgb of [
      [0.2, 0.2, 0.2],
      [1, 0, 0],
      [0, 0, 1],
      [1, 1, 1],
    ]) {
      const [l, a, b] = referenceLab(rgb, "srgb");
      expect(probe([a, l, b])).toBe(true);
    }
    expect(probe([-0.4, 0.5, 0])).toBe(false);
    expect(probe([0, 1.2, 0])).toBe(false);
  });
  it("hides an anchor behind the body but not one facing the viewer", () => {
    const behind: Triple = [-0.4, 0.5, 0];
    expect(isOccluded(probe, behind, [1, 0, 0])).toBe(true); // viewer on +a, body in between
    expect(isOccluded(probe, behind, [-1, 0, 0])).toBe(false); // viewer on -a
    expect(isOccluded(probe, [0, 0.5, 0], [1, 0, 0])).toBe(false); // already inside: never hidden
  });
});

function cross(a: Triple, b: Triple): Triple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Triple, b: Triple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

import {
  decodeRgbCoordinate,
  linearRgbToOklabBatch,
  representationDefinitions,
  RGB_NUMERIC_REVISION,
  type RgbRepresentationId,
} from "@gamut-plane/core/internal/capabilities";
import type { BoundaryMesh, KnotDistribution } from "./boundaryMesh.js";

export const SPATIAL_RADIAL_GENERATOR_REVISION = "rgb-radial-hybrid-v1";
export const MAX_RADIAL_SUBDIVISIONS = 128;

/**
 * The radial/conical boundary: tessellated grids on the three RGB faces away from black (R=1, G=1,
 * B=1) and triangle fans from black to the outer rim of the three faces through black (R=0, G=0,
 * B=0). The same `BoundaryMesh` contract as the fixed-grid generator, with `topology` telling
 * consumers which construction produced it.
 *
 * Mathematics. The linear RGB to OKLab map is F(q) = B cbrt(A q) with A the RGB to LMS matrix and B
 * the LMS' to OKLab matrix. Because cbrt(tx) = t^(1/3) cbrt(x), F(tq) = t^(1/3) F(q) for t >= 0:
 * every ray from RGB black maps to a straight ray from OKLab black, merely reparameterized. The
 * three faces through black are therefore exactly cones over their outer rim curves, and a fan
 * triangle (black, rim_i, rim_i+1) differs from the true cone only by the lateral sag of one rim
 * chord, which shrinks linearly toward the apex. The fixed grid has no such property: its cells
 * collapse toward the cube-root singularity and carry the largest approximation error there.
 *
 * Construction. The upper faces share one knot vector per channel; rim vertices are the grid's own
 * boundary vertices, so every seam is shared exactly. No vertex is welded and no triangle removed.
 * The default knot policy is the sRGB-encoded spacing, which equidistributes the upper faces'
 * curvature far better than linear spacing (see docs/phase-3b-refinement.md); `cubic` is available
 * only for comparison, because there is no singularity left on the upper faces for it to serve.
 *
 * Counts: V = 3n^2 + 3n + 2, F = 6n^2 + 6n, E = 9n^2 + 9n, Euler characteristic 2.
 *
 * Normals. A cone's normal is constant along each ray, so one shared apex normal is a face-wide
 * average interpolated along rays. Consumers must give every apex-touching fan triangle its own
 * apex normal (`createBoundaryUpload` does). Chord normals of a fan are exact along a ray.
 */
export function generateRadialBoundaryMesh(
  options: Readonly<{
    space: RgbRepresentationId;
    subdivisions: number;
    /** Knot spacing of the three upper faces. Default `encoded`. */
    upperKnots?: KnotDistribution;
  }>,
):
  | Readonly<{ ok: true; value: BoundaryMesh }>
  | Readonly<{ ok: false; error: "invalid-options" | "resource-budget" | "numerical-failure" }> {
  if (typeof options !== "object" || options === null)
    return { ok: false, error: "invalid-options" };
  const { space, subdivisions: n, upperKnots: distribution = "encoded" } = options;
  if (
    (space !== "srgb" && space !== "display-p3") ||
    !Number.isSafeInteger(n) ||
    n < 1 ||
    !["linear", "encoded", "cubic"].includes(distribution)
  )
    return { ok: false, error: "invalid-options" };
  if (n > MAX_RADIAL_SUBDIVISIONS) return { ok: false, error: "resource-budget" };
  const knots = Float64Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    // Both admitted core definitions declare the same extended sRGB transfer function.
    return i === 0 || i === n
      ? t
      : distribution === "encoded"
        ? decodeRgbCoordinate(t)
        : distribution === "cubic"
          ? t ** 3
          : t;
  });
  // Upper surface lattice points (at least one coordinate at n): three blocks, then black last.
  const redBlock = (n + 1) * (n + 1);
  const greenBlock = n * (n + 1);
  const upper = redBlock + greenBlock + n * n; // 3 n^2 + 3 n + 1
  const apex = upper;
  const vertexCount = upper + 1;
  const index = (x: number, y: number, z: number) =>
    x === n
      ? y * (n + 1) + z
      : y === n
        ? redBlock + x * (n + 1) + z
        : redBlock + greenBlock + x * n + y;
  const linearRgb = new Float64Array(vertexCount * 3);
  const writeVertex = (x: number, y: number, z: number) => {
    const offset = 3 * index(x, y, z);
    linearRgb[offset] = knots[x]!;
    linearRgb[offset + 1] = knots[y]!;
    linearRgb[offset + 2] = knots[z]!;
  };
  for (let y = 0; y <= n; y++) for (let z = 0; z <= n; z++) writeVertex(n, y, z);
  for (let x = 0; x < n; x++) for (let z = 0; z <= n; z++) writeVertex(x, n, z);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) writeVertex(x, y, n);
  const converted = linearRgbToOklabBatch(linearRgb, space);
  if (!converted.ok) return { ok: false, error: "numerical-failure" };
  // Reuse the conversion allocation; only permute [L,a,b] to [a,L,b], never scale or center.
  const positions = converted.value;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    const l = positions[i]!;
    positions[i] = positions[i + 1]!;
    positions[i + 1] = l;
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, positions[i + axis]!);
      max[axis] = Math.max(max[axis]!, positions[i + axis]!);
    }
  }
  const triangleCount = 6 * n * n + 6 * n;
  const triangles = new Uint32Array(3 * triangleCount);
  const faces = new Uint8Array(triangleCount);
  let triangle = 0;
  const push = (a: number, b: number, c: number, face: number) => {
    triangles[3 * triangle] = a;
    triangles[3 * triangle + 1] = b;
    triangles[3 * triangle + 2] = c;
    faces[triangle++] = face;
  };
  const lattice = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    lattice[axis] = n;
    const at = (i: number, j: number) => {
      lattice[u] = i;
      lattice[v] = j;
      return index(lattice[0]!, lattice[1]!, lattice[2]!);
    };
    // RGB -> [L,a,b] preserves orientation; [L,a,b] -> [a,L,b] reverses it. Triangles are emitted
    // inward in RGB-lattice order so the scene-space normal points outward; side 1 flips on every
    // axis except G, whose (u, v) = (R, B) order is mirrored.
    const flip = axis !== 1;
    const emit = (a: number, b: number, c: number) =>
      push(a, flip ? c : b, flip ? b : c, 2 * axis + 1);
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
  // Outer rim path of each lower face, as lattice points; black is the origin.
  const rim = (axis: number): [number, number, number][] => {
    const path: [number, number, number][] = [];
    for (let i = 0; i <= n; i++)
      path.push(axis === 0 ? [0, n, i] : axis === 1 ? [n, 0, i] : [n, i, 0]);
    for (let i = n - 1; i >= 0; i--)
      path.push(axis === 0 ? [0, i, n] : axis === 1 ? [i, 0, n] : [i, n, 0]);
    return path;
  };
  for (let axis = 0; axis < 3; axis++) {
    const path = rim(axis);
    for (let k = 0; k + 1 < path.length; k++) {
      const p = path[k]!,
        q = path[k + 1]!;
      // The lattice normal (p x q) of the triangle (origin, p, q) lies on the fixed axis; inward
      // for side 0 means positive.
      const normal = [
        p[1] * q[2] - p[2] * q[1],
        p[2] * q[0] - p[0] * q[2],
        p[0] * q[1] - p[1] * q[0],
      ][axis]!;
      const a = index(...p),
        b = index(...q);
      push(apex, normal > 0 ? a : b, normal > 0 ? b : a, 2 * axis);
    }
  }
  // Fail closed on numerical collapse. No epsilon weld or triangle removal may change topology.
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3,
      b = triangles[offset + 1]! * 3,
      c = triangles[offset + 2]! * 3;
    const ux = positions[b]! - positions[a]!,
      uy = positions[b + 1]! - positions[a + 1]!,
      uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!,
      vy = positions[c + 1]! - positions[a + 1]!,
      vz = positions[c + 2]! - positions[a + 2]!;
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (!(area2 > 0) || !Number.isFinite(area2)) return { ok: false, error: "numerical-failure" };
  }
  const gamut = representationDefinitions[space].associatedGamutId;
  if (gamut !== "srgb-gamut" && gamut !== "display-p3-gamut")
    return { ok: false, error: "numerical-failure" };
  return {
    ok: true,
    value: {
      space,
      gamut,
      coordinates: "oklab-a-l-b",
      topology: "radial-hybrid-v1",
      definitionRevision: RGB_NUMERIC_REVISION,
      generatorRevision: SPATIAL_RADIAL_GENERATOR_REVISION,
      subdivisions: n,
      distribution,
      knots,
      positions,
      linearRgb,
      triangles,
      faces,
      bounds: { min, max },
      quality: {
        status: "unqualified-reference",
        vertexConversions: vertexCount,
        bufferBytes:
          knots.byteLength +
          positions.byteLength +
          linearRgb.byteLength +
          triangles.byteLength +
          faces.byteLength,
      },
    },
  };
}

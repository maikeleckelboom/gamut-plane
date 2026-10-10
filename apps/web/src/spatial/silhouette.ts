import type { BoundaryMesh } from "@gamut-plane/render/internal/spatial";

/**
 * Camera-independent adjacency used to extract a mesh silhouette. Built once per scientific mesh.
 * Every edge of the closed boundary mesh has exactly two incident triangles; a cube-face crease is
 * simply an edge between triangles of different source faces and needs no special case.
 */
export interface SilhouetteTopology {
  /** Two logical vertex ids per unique edge. */
  readonly edgeVertices: Uint32Array;
  /** The two incident triangle ids per unique edge. */
  readonly edgeTriangles: Uint32Array;
  /** Float64 triangle normals of the scientific chords, unnormalized, three per triangle. */
  readonly normals: Float64Array;
}

export function createSilhouetteTopology(mesh: BoundaryMesh): SilhouetteTopology {
  const triangleCount = mesh.triangles.length / 3;
  const vertexCount = mesh.positions.length / 3;
  const normals = new Float64Array(triangleCount * 3);
  const first = new Map<number, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];
  const p = mesh.positions;
  for (let t = 0; t < triangleCount; t++) {
    const a = mesh.triangles[3 * t]!,
      b = mesh.triangles[3 * t + 1]!,
      c = mesh.triangles[3 * t + 2]!;
    const ux = p[3 * b]! - p[3 * a]!,
      uy = p[3 * b + 1]! - p[3 * a + 1]!,
      uz = p[3 * b + 2]! - p[3 * a + 2]!;
    const vx = p[3 * c]! - p[3 * a]!,
      vy = p[3 * c + 1]! - p[3 * a + 1]!,
      vz = p[3 * c + 2]! - p[3 * a + 2]!;
    normals[3 * t] = uy * vz - uz * vy;
    normals[3 * t + 1] = uz * vx - ux * vz;
    normals[3 * t + 2] = ux * vy - uy * vx;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const low = Math.min(u, v),
        high = Math.max(u, v);
      const key = low * vertexCount + high;
      const other = first.get(key);
      if (other === undefined) first.set(key, t);
      else {
        vertices.push(low, high);
        triangles.push(other, t);
        first.delete(key);
      }
    }
  }
  // A closed mesh leaves no edge with a single triangle; refuse silently-wrong adjacency.
  if (first.size !== 0) throw new Error("Silhouette topology requires a closed boundary mesh");
  return {
    edgeVertices: Uint32Array.from(vertices),
    edgeTriangles: Uint32Array.from(triangles),
    normals,
  };
}

/**
 * Writes silhouette segments for an orthographic view as `[x,y,z,x,y,z]` Float32 tuples and
 * returns how many fit. `toViewer` points from the scene toward the camera. An edge is on the
 * silhouette when exactly one incident chord faces the viewer. This is the outline of the SAMPLED
 * mesh, not a certified extremal silhouette of the curved surface.
 */
export function extractSilhouette(
  topology: SilhouetteTopology,
  positions: Float64Array,
  toViewer: readonly [number, number, number],
  out: Float32Array,
): { segments: number; truncated: boolean } {
  const { edgeVertices, edgeTriangles, normals } = topology;
  const capacity = Math.floor(out.length / 6);
  const [dx, dy, dz] = toViewer;
  let segments = 0;
  let truncated = false;
  for (let edge = 0; edge < edgeTriangles.length / 2; edge++) {
    const t0 = edgeTriangles[2 * edge]!,
      t1 = edgeTriangles[2 * edge + 1]!;
    const front0 =
      normals[3 * t0]! * dx + normals[3 * t0 + 1]! * dy + normals[3 * t0 + 2]! * dz > 0;
    const front1 =
      normals[3 * t1]! * dx + normals[3 * t1 + 1]! * dy + normals[3 * t1 + 2]! * dz > 0;
    if (front0 === front1) continue;
    if (segments === capacity) {
      truncated = true;
      break;
    }
    const a = edgeVertices[2 * edge]! * 3,
      b = edgeVertices[2 * edge + 1]! * 3;
    const offset = segments * 6;
    out[offset] = positions[a]!;
    out[offset + 1] = positions[a + 1]!;
    out[offset + 2] = positions[a + 2]!;
    out[offset + 3] = positions[b]!;
    out[offset + 4] = positions[b + 1]!;
    out[offset + 5] = positions[b + 2]!;
    segments++;
  }
  return { segments, truncated };
}

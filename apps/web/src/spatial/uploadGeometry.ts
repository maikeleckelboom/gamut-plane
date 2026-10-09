import { BufferAttribute, BufferGeometry } from "three";
import type { BoundaryMesh } from "@gamut-plane/render/internal/spatial";

/** GPU vertices share normals within a source face, never across RGB cube creases. */
export function createBoundaryUpload(mesh: BoundaryMesh) {
  const lookup = new Map<number, number>();
  const logical: number[] = [];
  const sourceFaces: number[] = [];
  const indices = new Uint32Array(mesh.triangles.length);
  const logicalCount = mesh.positions.length / 3;
  mesh.triangles.forEach((id, corner) => {
    const face = mesh.faces[Math.floor(corner / 3)]!;
    const key = face * logicalCount + id;
    let index = lookup.get(key);
    if (index === undefined) {
      index = logical.length;
      lookup.set(key, index);
      logical.push(id);
      sourceFaces.push(face);
    }
    indices[corner] = index;
  });
  const positions = new Float32Array(logical.length * 3);
  logical.forEach((id, index) =>
    positions.set(mesh.positions.subarray(id * 3, id * 3 + 3), index * 3),
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // Sparse parameter cage: four intervals on every source face; no triangle diagonals.
  // Use the actual scientific samples so a straight GPU segment is a known boundary chord.
  const cage: number[] = [];
  const emitted = new Set<string>();
  const stride = Math.max(1, Math.floor(mesh.subdivisions / 4));
  const levels = new Set(
    Array.from(mesh.knots).filter((_, i) => i % stride === 0 || i === mesh.subdivisions),
  );
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    for (const [u, v] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const a = mesh.triangles[t + u]!,
        b = mesh.triangles[t + v]!;
      const fixed = Math.floor(mesh.faces[t / 3]! / 2);
      let isLine = false;
      for (let axis = 0; axis < 3; axis++) {
        if (
          axis !== fixed &&
          mesh.linearRgb[3 * a + axis] === mesh.linearRgb[3 * b + axis] &&
          levels.has(mesh.linearRgb[3 * a + axis]!)
        )
          isLine = true;
      }
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      if (!isLine || emitted.has(key)) continue;
      emitted.add(key);
      cage.push(
        ...mesh.positions.subarray(3 * a, 3 * a + 3),
        ...mesh.positions.subarray(3 * b, 3 * b + 3),
      );
    }
  }
  const cageGeometry = new BufferGeometry();
  cageGeometry.setAttribute("position", new BufferAttribute(new Float32Array(cage), 3));
  const logicalVertices = Uint32Array.from(logical);
  const vertexFaces = Uint8Array.from(sourceFaces);
  return {
    geometry,
    cageGeometry,
    logicalVertices,
    vertexFaces,
    // Triangle order is unchanged: mesh.faces[triangle] retains provenance.
    bufferBytes: positions.byteLength * 2 + indices.byteLength + cage.length * 4,
    mappingBytes: logicalVertices.byteLength + vertexFaces.byteLength,
    dispose() {
      geometry.dispose();
      cageGeometry.dispose();
    },
  };
}

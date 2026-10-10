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

  const logicalVertices = Uint32Array.from(logical);
  const vertexFaces = Uint8Array.from(sourceFaces);
  return {
    geometry,
    logicalVertices,
    vertexFaces,
    // Triangle order is unchanged: mesh.faces[triangle] retains provenance.
    bufferBytes: positions.byteLength * 2 + indices.byteLength,
    mappingBytes: logicalVertices.byteLength + vertexFaces.byteLength,
    dispose() {
      geometry.dispose();
    },
  };
}

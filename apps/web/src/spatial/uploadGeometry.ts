import { BufferAttribute, BufferGeometry } from "three";
import type { BoundaryMesh } from "@gamut-plane/render/internal/spatial";

/**
 * GPU vertices share normals within a source face, never across RGB cube creases.
 *
 * A radial boundary mesh additionally splits the black apex of its fan faces per triangle. The
 * true surface there is a cone, whose normal is constant along every ray; a single shared apex
 * vertex would interpolate a face-wide average normal along each ray and mis-shade the whole cone
 * (measured: 32% of the surface more than 1 degree off). Each fan triangle instead takes the mean
 * of its two rim vertices' normals at its apex, which matches the cone to within the rim spacing.
 */
export function createBoundaryUpload(mesh: BoundaryMesh) {
  const splitApex = mesh.topology === "radial-hybrid-v1";
  const isApexCorner = (face: number, id: number) =>
    splitApex &&
    (face & 1) === 0 &&
    mesh.linearRgb[3 * id] === 0 &&
    mesh.linearRgb[3 * id + 1] === 0 &&
    mesh.linearRgb[3 * id + 2] === 0;
  const lookup = new Map<number, number>();
  const logical: number[] = [];
  const sourceFaces: number[] = [];
  const indices = new Uint32Array(mesh.triangles.length);
  const logicalCount = mesh.positions.length / 3;
  mesh.triangles.forEach((id, corner) => {
    const face = mesh.faces[Math.floor(corner / 3)]!;
    // Apex corners are never shared; every other vertex is shared per (source face, logical vertex).
    const key = isApexCorner(face, id) ? -1 - corner : face * logicalCount + id;
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
  if (!splitApex) geometry.computeVertexNormals();
  else geometry.setAttribute("normal", new BufferAttribute(apexSplitNormals(), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  /** Area-weighted normals for shared vertices; per-triangle apex normals from the rim vertices. */
  function apexSplitNormals() {
    const normals = new Float32Array(positions.length);
    const apex = new Uint8Array(logical.length);
    logical.forEach((id, index) => {
      if (isApexCorner(sourceFaces[index]!, id)) apex[index] = 1;
    });
    const cross = (triangle: number): [number, number, number] => {
      const [a, b, c] = [0, 1, 2].map((k) => indices[3 * triangle + k]! * 3) as [
        number,
        number,
        number,
      ];
      const ux = positions[b]! - positions[a]!,
        uy = positions[b + 1]! - positions[a + 1]!,
        uz = positions[b + 2]! - positions[a + 2]!;
      const vx = positions[c]! - positions[a]!,
        vy = positions[c + 1]! - positions[a + 1]!,
        vz = positions[c + 2]! - positions[a + 2]!;
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    for (let t = 0; t < indices.length / 3; t++) {
      const n = cross(t);
      for (let k = 0; k < 3; k++) {
        const v = indices[3 * t + k]!;
        if (apex[v]) continue;
        normals[3 * v] = normals[3 * v]! + n[0];
        normals[3 * v + 1] = normals[3 * v + 1]! + n[1];
        normals[3 * v + 2] = normals[3 * v + 2]! + n[2];
      }
    }
    const normalize = (v: number) => {
      const length = Math.hypot(normals[3 * v]!, normals[3 * v + 1]!, normals[3 * v + 2]!) || 1;
      for (let k = 0; k < 3; k++) normals[3 * v + k] = normals[3 * v + k]! / length;
    };
    for (let v = 0; v < logical.length; v++) if (!apex[v]) normalize(v);
    for (let t = 0; t < indices.length / 3; t++)
      for (let k = 0; k < 3; k++) {
        const v = indices[3 * t + k]!;
        if (!apex[v]) continue;
        const [p, q] = [1, 2].map((offset) => indices[3 * t + ((k + offset) % 3)]!) as [
          number,
          number,
        ];
        const mean = [0, 1, 2].map((axis) => normals[3 * p + axis]! + normals[3 * q + axis]!);
        // Two adjacent rim normals never cancel; fall back to the chord normal if they somehow do.
        const fallback = cross(t);
        const length = Math.hypot(...mean);
        const source = length > 1e-12 ? mean : fallback;
        const norm = Math.hypot(...source) || 1;
        for (let axis = 0; axis < 3; axis++) normals[3 * v + axis] = source[axis]! / norm;
      }
    return normals;
  }

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

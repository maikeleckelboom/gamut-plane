import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  adaptiveBounded,
  cubicGrid,
  radialHybrid,
  type CandidateMesh,
} from "../experiments/spatial/candidates.ts";
import { buildUpload, type NormalPolicy } from "../experiments/spatial/normals.ts";
import type { Space } from "../experiments/spatial/oracle.ts";

// Writes renderer upload geometry for the appearance comparison (apps/web/scripts/captureSpatialCandidates.ts).
// The two scripts share only this directory format, never source files, to keep package boundaries.
//
//   node packages/render/scripts/exportSpatialCandidates.ts <output directory>
//
// <id>.<policy>.bin: uint32 vertexCount, uint32 indexCount, float32 positions, float32 normals, uint32 indices.
const out = process.argv[2];
if (!out) throw new Error("Usage: exportSpatialCandidates.ts <output directory>");
mkdirSync(out, { recursive: true });
interface Entry {
  space: Space;
  mesh: CandidateMesh;
  policy: NormalPolicy;
  role: "reference-a" | "reference-b" | "candidate";
}
const entries: Entry[] = [];
for (const space of ["srgb", "display-p3"] as const) {
  entries.push(
    { space, mesh: radialHybrid(space, 181, "encoded"), policy: "analytic", role: "reference-a" },
    { space, mesh: cubicGrid(space, 128), policy: "analytic", role: "reference-b" },
    { space, mesh: cubicGrid(space, 64), policy: "area-weighted", role: "candidate" },
    { space, mesh: adaptiveBounded(space), policy: "area-weighted", role: "candidate" },
    { space, mesh: radialHybrid(space, 64, "encoded"), policy: "area-weighted", role: "candidate" },
    { space, mesh: radialHybrid(space, 64, "encoded"), policy: "apex-split", role: "candidate" },
    { space, mesh: radialHybrid(space, 64, "encoded"), policy: "analytic", role: "candidate" },
    { space, mesh: radialHybrid(space, 90, "encoded"), policy: "apex-split", role: "candidate" },
  );
}
const manifest = entries.map(({ space, mesh, policy, role }) => {
  const upload = buildUpload(mesh, space, policy);
  const file = `${space}.${mesh.id}.${policy}.bin`;
  const header = Buffer.alloc(8);
  header.writeUInt32LE(upload.vertexCount, 0);
  header.writeUInt32LE(upload.indices.length, 4);
  writeFileSync(
    join(out, file),
    Buffer.concat([
      header,
      Buffer.from(upload.positions.buffer),
      Buffer.from(upload.normals.buffer),
      Buffer.from(upload.indices.buffer),
    ]),
  );
  return {
    id: `${mesh.id}.${policy}`,
    space,
    meshId: mesh.id,
    family: mesh.family,
    policy,
    role,
    file,
    triangles: upload.indices.length / 3,
    uploadVertices: upload.vertexCount,
  };
});
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`wrote ${manifest.length} candidates to ${out}`);

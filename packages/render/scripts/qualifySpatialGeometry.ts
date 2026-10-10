import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import {
  adaptiveBounded,
  cubicGrid,
  meshBytes,
  radialHybrid,
  type CandidateMesh,
  type HybridKnots,
} from "../experiments/spatial/candidates.ts";
import {
  heldOutProbes,
  meshToTrue,
  TriangleGrid,
  trueToMesh,
} from "../experiments/spatial/distance.ts";
import { normalErrors, type NormalPolicy } from "../experiments/spatial/normals.ts";
import { constantHueSections, constantLightnessSections } from "../experiments/spatial/sections.ts";
import {
  PIXELS_PER_UNIT_AT_ZOOM_1,
  silhouetteError,
  trueSilhouette,
  type View,
} from "../experiments/spatial/silhouette.ts";
import {
  analyzeOrientation,
  analyzeStarShape,
  analyzeTopology,
  pairwiseIntersections,
} from "../experiments/spatial/topology.ts";
import type { Space } from "../experiments/spatial/oracle.ts";

// Offline qualification of boundary tessellations. Build core and render first (this imports the
// shipped generator from dist). stdout is the report; no repository file is written. Every number
// is a finite sampled diagnostic against an independent truth, never a continuous bound.
//
//   node packages/render/scripts/qualifySpatialGeometry.ts [--quick] [--space srgb|display-p3] > report.json
const args = process.argv.slice(2);
const quick = args.includes("--quick");
const spaceArgument = args[args.indexOf("--space") + 1];
const spaces: Space[] =
  args.includes("--space") && (spaceArgument === "srgb" || spaceArgument === "display-p3")
    ? [spaceArgument]
    : ["srgb", "display-p3"];

const ZOOMS = [1, 4, 12];
const views: View[] = [
  { name: "home", toViewer: [1.35, 0.8, 1.65] },
  { name: "blue", toViewer: [-0.4, 0.1, -2] },
  { name: "side", toViewer: [2, 0.1, 0.1] },
];

interface Spec {
  /** Why this candidate is in the comparison. */
  role: string;
  make: (space: Space) => CandidateMesh;
  /** Repeat generation this many times to report a median. */
  repeats: number;
}
const hybrid = (m: number, knots: HybridKnots, role: string): Spec => ({
  role,
  make: (space) => radialHybrid(space, m, knots),
  repeats: 5,
});
const grid = (n: number, role: string): Spec => ({
  role,
  make: (space) => cubicGrid(space, n),
  repeats: 5,
});
const specs: Spec[] = quick
  ? [
      grid(64, "production"),
      hybrid(64, "encoded", "proposed hybrid, encoded upper knots, half the production budget"),
    ]
  : [
      grid(64, "production"),
      grid(45, "production generator at the hybrid(m=64) triangle budget"),
      grid(96, "production generator near the adaptive triangle budget"),
      {
        role: "bounded adaptive refinement (Phase 3B experiment, reproduced)",
        make: (s) => adaptiveBounded(s),
        repeats: 1,
      },
      hybrid(64, "encoded", "radial hybrid, encoded upper knots, ~half the production budget"),
      hybrid(90, "encoded", "radial hybrid, encoded upper knots, production triangle budget"),
      hybrid(
        135,
        "encoded",
        "radial hybrid, encoded upper knots, near the adaptive triangle budget",
      ),
      hybrid(90, "linear", "knot-policy control at the production budget: linear upper knots"),
      hybrid(90, "cubic", "knot-policy control at the production budget: cubic upper knots"),
    ];

const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const pixels = (units: number, zoom: number) => units * PIXELS_PER_UNIT_AT_ZOOM_1 * zoom;

function uploadAccounting(mesh: CandidateMesh) {
  // Vertices are split by (source face, logical vertex) so creases are never smoothed; a vertex
  // that is the black apex of a lower face is further split per triangle for apex-split normals.
  const pairs = new Set<number>();
  const V = mesh.positions.length / 3;
  let apexTriangles = 0;
  for (let t = 0; t < mesh.faces.length; t++)
    for (let k = 0; k < 3; k++) {
      const v = mesh.triangles[3 * t + k]!;
      const apex =
        mesh.linearRgb[3 * v] === 0 &&
        mesh.linearRgb[3 * v + 1] === 0 &&
        mesh.linearRgb[3 * v + 2] === 0;
      if (apex && !(mesh.faces[t]! & 1)) apexTriangles++;
      else pairs.add(mesh.faces[t]! * V + v);
    }
  const uploadVertices = pairs.size + apexTriangles;
  return {
    uploadVertices,
    apexSplitTriangles: apexTriangles,
    gpuBytes: uploadVertices * 24 + mesh.triangles.length * 4,
  };
}

function float32Report(mesh: CandidateMesh) {
  const quantized = new Float32Array(mesh.positions);
  let max = 0;
  for (let i = 0; i < quantized.length; i += 3)
    max = Math.max(
      max,
      Math.hypot(
        quantized[i]! - mesh.positions[i]!,
        quantized[i + 1]! - mesh.positions[i + 1]!,
        quantized[i + 2]! - mesh.positions[i + 2]!,
      ),
    );
  let degenerate = 0;
  for (let t = 0; t < mesh.faces.length; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.triangles[3 * t + k]! * 3);
    const u = [0, 1, 2].map((k) => quantized[b! + k]! - quantized[a! + k]!);
    const v = [0, 1, 2].map((k) => quantized[c! + k]! - quantized[a! + k]!);
    const area2 = Math.hypot(
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    );
    if (!(area2 > 0)) degenerate++;
  }
  return { maxVertexDeviation: max, degenerateAfterFloat32: degenerate };
}

const trueOutlines = new Map<string, ReturnType<typeof trueSilhouette>>();
const probeSets = new Map<Space, ReturnType<typeof heldOutProbes>>();
const rows: unknown[] = [];
const started = performance.now();
for (const space of spaces) {
  probeSets.set(space, heldOutProbes(space));
  for (const view of views) trueOutlines.set(`${space}:${view.name}`, trueSilhouette(space, view));
  for (const spec of specs) {
    const timings: number[] = [];
    let mesh = spec.make(space);
    timings.push(mesh.generationMs);
    for (let repeat = 1; repeat < spec.repeats; repeat++)
      timings.push(spec.make(space).generationMs);
    process.stderr.write(
      `[${((performance.now() - started) / 1000).toFixed(0)}s] ${space} ${mesh.id}\n`,
    );
    const topology = analyzeTopology(mesh);
    const distanceGrid = new TriangleGrid(mesh.positions, mesh.triangles, 0.04);
    const truth = probeSets
      .get(space)!
      .map((set) => ({ set: set.name, ...trueToMesh(distanceGrid, set) }));
    const surface = meshToTrue(mesh, space);
    const trueToMeshMax = Math.max(...truth.map((t) => t.all.max));
    const symmetricMax = Math.max(trueToMeshMax, surface.all.max);
    const nearBlackSymmetricMax = Math.max(
      ...truth.map((t) => t.nearBlack.max),
      surface.nearBlack.max,
    );
    const elsewhereSymmetricMax = Math.max(
      ...truth.map((t) => t.elsewhere.max),
      surface.elsewhere.max,
    );
    const policies: NormalPolicy[] = ["area-weighted", "apex-split", "analytic"];
    rows.push({
      space,
      id: mesh.id,
      family: mesh.family,
      role: spec.role,
      parameters: mesh.parameters,
      construction: mesh.notes ?? null,
      resources: {
        vertices: topology.vertices,
        triangles: topology.triangles,
        scientificNumericBytes: meshBytes(mesh),
        ...uploadAccounting(mesh),
        generationMsMedian: median(timings),
        generationRepeats: timings.length,
      },
      topology,
      orientation: analyzeOrientation(mesh, space),
      starShapeAboutBlack: analyzeStarShape(mesh),
      float32: float32Report(mesh),
      distance: {
        trueToMesh: truth,
        meshToTrue: surface,
        symmetricMaxOklab: symmetricMax,
        nearBlackSymmetricMaxOklab: nearBlackSymmetricMax,
        elsewhereSymmetricMaxOklab: elsewhereSymmetricMax,
        projectedPixels: ZOOMS.map((zoom) => ({
          zoom,
          symmetricMax: pixels(symmetricMax, zoom),
          nearBlack: pixels(nearBlackSymmetricMax, zoom),
          elsewhere: pixels(elsewhereSymmetricMax, zoom),
        })),
      },
      silhouette: views.map((view) =>
        silhouetteError(mesh, trueOutlines.get(`${space}:${view.name}`)!, view),
      ),
      sections: {
        constantLightness: constantLightnessSections(mesh),
        constantHue: constantHueSections(mesh),
      },
      normals: policies.map((policy) => normalErrors(mesh, space, policy)),
    });
  }
}
// Pairwise embedding at small resolution (quadratic): production grid and hybrid on the same budget class.
const embedding = spaces.flatMap((space) =>
  [cubicGrid(space, 8), radialHybrid(space, 8, "encoded"), radialHybrid(space, 12, "linear")].map(
    (mesh) => ({ space, id: mesh.id, ...pairwiseIntersections(mesh) }),
  ),
);
console.log(
  JSON.stringify(
    {
      schema: 1,
      status: "offline-experiment-sampled-not-a-certificate",
      environment: { node: process.version, platform: process.platform, cpu: cpus()[0]?.model },
      camera: {
        stageHeightCssPixels: 900,
        sceneHeightAtZoom1: 1.42,
        pixelsPerUnitAtZoom1: PIXELS_PER_UNIT_AT_ZOOM_1,
        zooms: ZOOMS,
        views: views.map((view) => ({ name: view.name, toViewer: view.toViewer })),
      },
      truth:
        "Independent CSS Color 4 XYZ D65 route (experiments/spatial/oracle.ts). Section exactness from core's gamutRayCrossings.",
      probes: [...probeSets.get(spaces[0]!)!].map((set) => ({
        name: set.name,
        count: set.scene.length / 3,
      })),
      elapsedSeconds: (performance.now() - started) / 1000,
      candidates: rows,
      embedding,
    },
    null,
    2,
  ),
);

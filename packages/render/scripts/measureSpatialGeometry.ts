import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { generateBoundaryMesh, quantizeBoundaryPositions } from "../dist/spatial/boundaryMesh.js";
import { measureBoundaryQuality } from "../dist/spatial/quality.js";

// Build core/render first. stdout is the report; no repository files are written by this command.
const rows = [];
for (const space of ["srgb", "display-p3"] as const)
  for (const distribution of ["linear", "encoded", "cubic"] as const)
    for (const subdivisions of [16, 32, 64, 128]) {
      const start = performance.now();
      const generated = generateBoundaryMesh({ space, distribution, subdivisions });
      const generationMs = performance.now() - start;
      if (!generated.ok) throw new Error(generated.error);
      const mesh = generated.value;
      const timings = [];
      for (let repeat = 0; repeat < 7; repeat++) {
        const before = performance.now();
        const repeated = generateBoundaryMesh({ space, distribution, subdivisions });
        if (!repeated.ok) throw new Error(repeated.error);
        timings.push(performance.now() - before);
      }
      timings.sort((a, b) => a - b);
      const qualityStart = performance.now();
      const measured = measureBoundaryQuality(mesh);
      const qualityMs = performance.now() - qualityStart;
      if (!measured.ok) throw new Error(measured.error);
      const upload = quantizeBoundaryPositions(mesh);
      rows.push({
        space,
        distribution,
        subdivisions,
        vertices: mesh.positions.length / 3,
        triangles: mesh.faces.length,
        bufferBytes: mesh.quality.bufferBytes,
        uploadPositionBytes: upload.positions.byteLength,
        float32Max: upload.maxVertexDeviation,
        float32Rms: upload.rmsVertexDeviation,
        work: {
          vertexConversions: mesh.quality.vertexConversions,
          trianglesChecked: mesh.faces.length,
          retainedNumericAllocations: 5,
          retainedNumericBytes: mesh.quality.bufferBytes,
          generationMs: {
            initial: generationMs,
            min: timings[0],
            median: timings[3],
            max: timings[6],
            repeats: timings.length,
          },
          qualityMs,
        },
        quality: measured.value,
      });
    }
console.log(
  JSON.stringify(
    {
      schema: 1,
      generator: "rgb-cube-grid-v1",
      definition: "texel-1.1.11-linear-oklab-v1",
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0]?.model,
      },
      timing:
        "one initial generation then seven repeats per case; quality measured separately; no GC isolation or performance acceptance claim",
      rows,
    },
    null,
    2,
  ),
);

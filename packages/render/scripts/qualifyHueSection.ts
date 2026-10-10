// Build packages first. stdout is a reproducible JSON report; this script never edits the repo.
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { gamutRayCrossings, linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import {
  generateHueSection,
  HUE_SECTION_REVISION,
  type HueSection,
} from "../dist/spatial/hueSection.js";
import {
  compareHueContour,
  hueSegments,
  independentLightnessCrossings,
  lightnessHits,
} from "../experiments/spatial/hueSectionOracle.ts";
import { inverseScene } from "../experiments/spatial/oracle.ts";
import { SegmentIndex } from "../experiments/spatial/silhouette.ts";
import { qualifyHueMembership } from "../experiments/spatial/hueMembership.ts";

const spaces = ["srgb", "display-p3"] as const;
const quantiles = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    max: sorted.at(-1),
  };
};
function section(space: (typeof spaces)[number], hue: number): HueSection {
  const result = generateHueSection({ space, hue });
  if (!result.ok) throw new Error(`${space}, h=${hue}: ${result.error}, ${result.detail}`);
  return result.value;
}
const reports = spaces.map((space) => {
  const hues = [
    ...new Set([
      ...Array.from({ length: 1440 }, (_, i) => i / 4),
      ...Array.from({ length: 2001 }, (_, i) => 263.9 + i / 5000),
    ]),
  ];
  // Warm the same production entry; no hidden cache or asynchronous work.
  for (let i = 0; i < 100; i++) section(space, i * 3.6);
  const times: number[] = [],
    counts: number[] = [],
    evaluations: number[] = [],
    conversions: number[] = [],
    bytes: number[] = [],
    depths: number[] = [];
  const sectorRanges: { hue: number; sectors: number }[] = [];
  let lastSectors = 0,
    determinismFailures = 0,
    maxIndependentResidual = 0,
    outsideVertices = 0;
  let maxSourceResidual = 0,
    maxPlaneResidual = 0,
    maxTemporaryRecords = 0;
  let worstTime = { hue: 0, milliseconds: 0 };
  for (const hue of hues.toSorted((a, b) => a - b)) {
    const start = performance.now(),
      s = section(space, hue),
      time = performance.now() - start;
    times.push(time);
    if (time > worstTime.milliseconds) worstTime = { hue, milliseconds: time };
    const work = s.quality.work;
    counts.push(work.vertices);
    evaluations.push(work.polynomialEvaluations);
    conversions.push(work.conversions);
    bytes.push(work.retainedBufferBytes);
    depths.push(work.maxDepth);
    maxTemporaryRecords = Math.max(maxTemporaryRecords, work.peakPointRecords);
    if (s.loops.length !== lastSectors) {
      sectorRanges.push({ hue, sectors: s.loops.length });
      lastSectors = s.loops.length;
    }
    if (JSON.stringify(s) !== JSON.stringify(section(space, hue))) determinismFailures++;
    const angle = (s.hue * Math.PI) / 180;
    for (let i = 0; i < s.vertices.length; i++) {
      const position = Array.from(s.positions.slice(3 * i, 3 * i + 3));
      const q = inverseScene(position, space);
      maxPlaneResidual = Math.max(
        maxPlaneResidual,
        Math.abs(position[0]! * Math.sin(angle) - position[2]! * Math.cos(angle)),
      );
      for (let k = 0; k < 3; k++)
        maxIndependentResidual = Math.max(
          maxIndependentResidual,
          Math.abs(q[k]! - s.linearRgb[3 * i + k]!),
        );
      maxSourceResidual = Math.max(maxSourceResidual, s.quality.maxConstraintResidual);
      const color = createColorValue({
        space: "oklab",
        channels: [position[1]!, position[0]!, position[2]!],
        alpha: 1,
      });
      if (!color.ok) throw new Error(color.error.code);
      const analysis = analyzeGamut(
        color.value,
        space === "srgb" ? "srgb-gamut" : "display-p3-gamut",
      );
      if (!analysis.ok) throw new Error(analysis.error.code);
      if (analysis.value.status === "outside") outsideVertices++;
    }
  }
  const independent = [
    ...Array.from({ length: 72 }, (_, i) => i * 5),
    ...Array.from({ length: 41 }, (_, i) => 264 + i / 200),
  ].map((hue) => {
    const s = section(space, hue),
      comparison = compareHueContour(s, 16384);
    return { hue, sectors: s.loops.length, ...comparison };
  });
  let coreRays = 0,
    maxCoreDistance = 0;
  const countDisputes: {
    hue: number;
    lightness: number;
    core: number[];
    polyline: number[];
    independent: number[];
  }[] = [];
  const levels = [
    1e-12,
    1e-8,
    0.002,
    0.006,
    0.44,
    ...Array.from({ length: 49 }, (_, i) => (i + 1) / 50),
    0.9999,
    1 - 1e-12,
  ];
  for (const hue of [...Array.from({ length: 360 }, (_, i) => i), 264.09, 264.1, 264.125, 264.14]) {
    const s = section(space, hue),
      index = new SegmentIndex(hueSegments(s));
    for (const lightness of levels) {
      coreRays++;
      const core = gamutRayCrossings(lightness, hue, space).map((c) => c.chroma);
      for (const c of core)
        maxCoreDistance = Math.max(maxCoreDistance, index.nearest(lightness, c));
      const polyline = lightnessHits(s, lightness);
      if (core.length !== polyline.length)
        countDisputes.push({
          hue,
          lightness,
          core,
          polyline,
          independent: independentLightnessCrossings(space, hue, lightness, 131072),
        });
    }
  }
  const cornerContacts = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
  ].map((rgb) => {
    const result = linearRgbToOklabBatch(Float64Array.from(rgb), space);
    if (!result.ok) throw new Error(result.error.code);
    const [l, a, b] = result.value,
      hue = (Math.atan2(b!, a!) * 180) / Math.PI;
    const generated = generateHueSection({ space, hue });
    const core = gamutRayCrossings(l!, hue, space);
    return {
      rgb,
      hue,
      lightness: l,
      chroma: Math.hypot(a!, b!),
      core,
      generated: generated.ok
        ? {
            sectors: generated.value.loops.length,
            contactRays: generated.value.contacts.length,
            distance: new SegmentIndex(hueSegments(generated.value)).nearest(
              l!,
              Math.hypot(a!, b!),
            ),
          }
        : generated,
    };
  });
  return {
    space,
    membership: [
      ...new Set([0, 30, 90, 180, 264.1, 264.125, 300, ...cornerContacts.map((c) => c.hue)]),
    ].map((hue) => qualifyHueMembership(section(space, hue))),
    generationCases: hues.length,
    timingMilliseconds: quantiles(times),
    worstTime,
    vertices: quantiles(counts),
    evaluations: quantiles(evaluations),
    conversions: quantiles(conversions),
    retainedTypedBufferBytes: quantiles(bytes),
    refinementDepth: quantiles(depths),
    maxTemporaryRecords,
    sectorRanges,
    determinismFailures,
    maxIndependentResidual,
    maxSourceResidual,
    maxPlaneResidual,
    outsideVertices,
    independent,
    core: { rays: coreRays, maxDistance: maxCoreDistance, countDisputes },
    cornerContacts,
  };
});
const passed = reports.every(
  (r) =>
    r.membership.every((m) => m.disputes.length === 0) &&
    r.determinismFailures === 0 &&
    r.outsideVertices === 0 &&
    r.maxIndependentResidual < 2e-7 &&
    r.core.maxDistance < 1.05e-5 &&
    r.core.countDisputes.length === 0 &&
    r.cornerContacts.every((c) => "distance" in c.generated && c.generated.distance < 2e-7) &&
    r.independent.every(
      (c) => c.forward < 1.05e-5 && c.reverse < 1.05e-5 && c.referenceSectors === c.sectors,
    ),
);
console.log(
  JSON.stringify(
    {
      generatorRevision: HUE_SECTION_REVISION,
      sourceDigests: Object.fromEntries(
        [
          "../src/spatial/hueSection.ts",
          "../src/spatial/huePolynomial.ts",
          "../experiments/spatial/hueSectionOracle.ts",
          "../experiments/spatial/hueMembership.ts",
          "../experiments/spatial/oracle.ts",
          "./qualifyHueSection.ts",
        ].map((path) => [
          path,
          createHash("sha256")
            .update(readFileSync(new URL(path, import.meta.url)))
            .digest("hex"),
        ]),
      ),
      environment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        cpu: cpus()[0]?.model,
      },
      method: {
        accuracy:
          "sampled bidirectional (L,C) distance, independent CSS XYZ contour with 16384 direction scan intervals; reverse uses eight samples per production chord against reference polyline",
        topology:
          "production derivative root partition; independent sign scans cannot exclude sub-grid pairs",
        timing:
          "100 warmups then one measured call per hue; repeated call for byte repeatability; Node CPU only",
        memory:
          "exact retained typed buffers; JS object storage engine-dependent; temporary point-record bound is structural, no heap-byte measurement",
        coreDisputes:
          "all count mismatches retained with independent raw-bound scan; near-zero scans may miss narrow intervals; no dispute automatically waived",
      },
      passed,
      reports,
    },
    null,
    2,
  ),
);
if (!passed) process.exitCode = 1;

// Reproducible numerical evidence for the Phase 3C.1 constant-lightness section. stdout is the JSON
// report; no repository file is written by this command. Build core and render first:
//   pnpm build:packages
//   node packages/render/scripts/qualifyLightnessSection.ts > docs/phase-3c1-section-measurements.json
// Every figure is a finite sampled measurement with its method stated in the report; none is a
// continuous guarantee. The authorities are core's ray solver and gamut analysis, not the section
// generator itself.
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { gamutRayCrossings, linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import {
  DEFAULT_SECTION_CHORD_TOLERANCE,
  DEFAULT_SECTION_LIMITS,
  generateLightnessSection,
  lightnessMonotonicityMargin,
} from "../dist/spatial/lightnessSection.js";
import { generateRadialBoundaryMesh } from "../dist/spatial/radialBoundaryMesh.js";
import { generateBoundaryMesh } from "../dist/spatial/boundaryMesh.js";
import type { LightnessSection } from "../dist/spatial/lightnessSection.js";
import {
  compareWithCore,
  coreStatus,
  insideLoops,
  loopSegments,
  meshPlaneSegments,
  rayHits,
} from "../experiments/spatial/sectionContour.ts";
import { SegmentIndex, type Segment2 } from "../experiments/spatial/silhouette.ts";
import { statsOf } from "../experiments/spatial/distance.ts";

type Space = "srgb" | "display-p3";
const spaces: readonly Space[] = ["srgb", "display-p3"];
/** Declared envelope, as in Phase 3B-R: a 900 CSS px tall stage showing 1.42 scene units at zoom 1. */
const PIXELS_PER_UNIT = 900 / 1.42;
const px = (distance: number, zoom: number) => distance * PIXELS_PER_UNIT * zoom;
const pixelReport = (distance: number) => ({
  zoom1: px(distance, 1),
  zoom4: px(distance, 4),
  zoom12: px(distance, 12),
});

function section(space: Space, lightness: number, options = {}): LightnessSection {
  const result = generateLightnessSection({ space, lightness, ...options });
  if (!result.ok) throw new Error(`${space} L=${lightness}: ${result.error} ${result.detail}`);
  return result.value;
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const percentile = (values: number[], q: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(q * values.length))]!;

// 1. Monotonicity: the property the solver relies on.
function monotonicity() {
  const out: Record<string, unknown> = {};
  for (const space of spaces) {
    let seed = 20261010;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let nonIncreasing = 0,
      total = 0,
      smallest = Infinity;
    for (let batch = 0; batch < 6; batch++) {
      const n = 60_000;
      const points = new Float64Array(n * 18);
      let k = 0;
      for (let i = 0; i < n; i++) {
        const q = [0, 1, 2].map(() => (random() < 0.5 ? random() : 10 ** (-9 * random())));
        for (let c = 0; c < 3; c++) {
          const h = Math.max(1e-6 * q[c]!, 1e-13);
          const lo = [...q],
            hi = [...q];
          lo[c] = Math.max(0, q[c]! - h);
          hi[c] = Math.min(1, q[c]! + h);
          points.set(lo, k);
          k += 3;
          points.set(hi, k);
          k += 3;
        }
      }
      const converted = linearRgbToOklabBatch(points, space);
      if (!converted.ok) throw new Error(converted.error.code);
      for (let i = 0; i < n * 3; i++) {
        const delta = converted.value[(2 * i + 1) * 3]! - converted.value[2 * i * 3]!;
        total++;
        smallest = Math.min(smallest, delta);
        if (!(delta > 0)) nonIncreasing++;
      }
    }
    out[space] = {
      analyticMargin: lightnessMonotonicityMargin(space),
      finiteDifferences: {
        total,
        nonIncreasing,
        method:
          "central differences, half-width 1e-6 relative, mixed linear and log-uniform points",
      },
    };
  }
  return out;
}

// 2. A dense lightness sweep: sizes, work, timing and the section's own declared accuracy.
function lightnessSweep() {
  const levels: number[] = [];
  for (let k = 1; k < 400; k++) levels.push(k / 400);
  levels.push(1e-6, 1e-5, 1e-4, 0.001, 0.002, 0.006, 0.99, 0.999, 0.9999, 0.99999, 0.999999);
  const out: Record<string, unknown> = {};
  for (const space of spaces) {
    const times: number[] = [];
    const vertices: number[] = [];
    const conversions: number[] = [];
    const deviation: number[] = [];
    const residual: number[] = [];
    const rounds: number[] = [];
    const failures: { lightness: number; error: string }[] = [];
    let loopCounts = new Map<number, number>();
    for (const lightness of levels) {
      const before = performance.now();
      const result = generateLightnessSection({ space, lightness });
      const elapsed = performance.now() - before;
      if (!result.ok) {
        failures.push({ lightness, error: result.error });
        continue;
      }
      times.push(elapsed);
      const { quality, loops } = result.value;
      vertices.push(quality.work.vertices);
      conversions.push(quality.work.conversions);
      deviation.push(quality.maxObservedChordDeviation);
      residual.push(quality.maxLightnessResidual);
      rounds.push(quality.work.refinementRounds);
      loopCounts.set(loops.length, (loopCounts.get(loops.length) ?? 0) + 1);
    }
    out[space] = {
      levels: levels.length,
      failures,
      loopCountHistogram: Object.fromEntries(loopCounts),
      timeMs: {
        median: median(times),
        p95: percentile(times, 0.95),
        max: Math.max(...times),
        note: "first call per level, Node JIT warm after the first few",
      },
      vertices: {
        min: Math.min(...vertices),
        median: median(vertices),
        max: Math.max(...vertices),
      },
      conversions: {
        min: Math.min(...conversions),
        median: median(conversions),
        max: Math.max(...conversions),
      },
      refinementRounds: { max: Math.max(...rounds) },
      maxObservedChordDeviation: Math.max(...deviation),
      maxLightnessResidual: Math.max(...residual),
      limits: DEFAULT_SECTION_LIMITS,
      declaredChordTolerance: DEFAULT_SECTION_CHORD_TOLERANCE,
    };
  }
  return out;
}

// 3. Core's ray solver as the authority, on a hue sweep, in the section plane and along the ray.
function coreCorrespondence() {
  const levels = [
    0.002, 0.006, 0.02, 0.05, 0.1, 0.2, 0.3, 0.44, 0.452, 0.5, 0.6, 0.68, 0.8, 0.9, 0.95, 0.99,
    0.999,
  ];
  const hues = Array.from({ length: 1440 }, (_, k) => k / 4 + 0.0625);
  const out: Record<string, unknown> = {};
  for (const space of spaces) {
    const plane: number[] = [];
    const chroma: number[] = [];
    let rays = 0,
      mismatches = 0,
      ambiguous = 0;
    const perLevel: unknown[] = [];
    for (const level of levels) {
      const s = section(space, level);
      const report = compareWithCore(s, hues);
      rays += report.rays;
      mismatches += report.countMismatches;
      ambiguous += report.ambiguousRays;
      for (const d of report.planeDistance) plane.push(d);
      for (const d of report.chromaError) chroma.push(d);
      perLevel.push({
        lightness: level,
        maxPlaneDistance: Math.max(0, ...report.planeDistance),
        maxChromaError: Math.max(0, ...report.chromaError),
        countMismatches: report.countMismatches,
        ambiguousRays: report.ambiguousRays,
      });
    }
    const planeStats = statsOf(plane);
    out[space] = {
      method:
        "1440 hue rays per lightness from the neutral axis; core gamutRayCrossings is the authority; plane distance is from each exact crossing point to the nearest point of the section polyline",
      levels: levels.length,
      rays,
      countMismatches: mismatches,
      ambiguousRays: ambiguous,
      planeDistance: planeStats,
      planeDistanceScreenPx: pixelReport(planeStats.max),
      chromaAlongRayError: statsOf(chroma),
      note: "Ray-parameterized chroma error is larger than plane distance where the plane grazes the surface (the 13 to 14 times amplification recorded in Phase 3B-R); only the plane distance is gated.",
      perLevel,
    };
  }
  return out;
}

// 4. Every vertex is an exact boundary point of its face: core's crossing at the vertex's hue.
function vertexProvenance() {
  const out: Record<string, unknown> = {};
  for (const space of spaces) {
    let faceVertices = 0,
      edgeVertices = 0,
      bindingMismatch = 0,
      worst = 0,
      touching = 0;
    for (let k = 1; k < 200; k++) {
      const level = k / 200;
      const s = section(space, level);
      const loop = s.loops[0]!;
      const n = loop.edges.length;
      for (let v = 0; v < n; v++) {
        const a = loop.positions[3 * v]!,
          b = loop.positions[3 * v + 2]!;
        const chroma = Math.hypot(a, b);
        const hue = (Math.atan2(b, a) * 180) / Math.PI;
        const crossings = gamutRayCrossings(level, hue, space);
        const match = crossings.reduce(
          (best, c) => (Math.abs(c.chroma - chroma) < Math.abs(best.chroma - chroma) ? c : best),
          crossings[0]!,
        );
        if (loop.edges[v]! >= 0) {
          edgeVertices++;
          // Two channels bind at a cube edge; core reports no crossing where the ray merely touches.
          if (!match || Math.abs(match.chroma - chroma) > 1e-9) touching++;
          continue;
        }
        faceVertices++;
        worst = Math.max(worst, Math.abs(match!.chroma - chroma) / Math.max(chroma, 1e-3));
        const faces = [loop.segmentFaces[(v + n - 1) % n], loop.segmentFaces[v]];
        if (!faces.includes(match!.binding)) bindingMismatch++;
      }
    }
    out[space] = {
      levels: 199,
      faceVertices,
      edgeCrossingVertices: edgeVertices,
      edgeCrossingsWhereCoreReportsNoCrossing: touching,
      bindingMismatches: bindingMismatch,
      maxRelativeChromaDifference: worst,
      method:
        "chroma and binding at each face vertex's hue from core gamutRayCrossings; edge crossings bind two channels and may be touching points, which core's interval logic does not report",
    };
  }
  return out;
}

// 5. Core gamut analysis as a membership authority on a probe grid in the plane.
function membership() {
  const out: Record<string, unknown> = {};
  for (const space of spaces) {
    let checked = 0,
      skipped = 0,
      mismatches = 0;
    for (const level of [0.01, 0.05, 0.2, 0.44, 0.68, 0.9, 0.99]) {
      const s = section(space, level);
      const segments = loopSegments(s);
      const index = new SegmentIndex(segments, 0.02);
      const [minA, minB] = s.bounds!.min,
        [maxA, maxB] = s.bounds!.max;
      const pad = 0.1 * Math.max(maxA - minA, maxB - minB);
      for (let i = 0; i < 80; i++)
        for (let j = 0; j < 80; j++) {
          const a = minA - pad + ((maxA - minA + 2 * pad) * i) / 79;
          const b = minB - pad + ((maxB - minB + 2 * pad) * j) / 79;
          if (index.nearest(a, b) < 4 * DEFAULT_SECTION_CHORD_TOLERANCE) {
            skipped++;
            continue;
          }
          checked++;
          if (insideLoops(segments, a, b) !== (coreStatus(s, a, b) !== "outside")) mismatches++;
        }
    }
    out[space] = {
      probes: checked + skipped,
      checked,
      skippedWithinFourTolerances: skipped,
      mismatches,
      method:
        "even-odd polygon membership of the section against core analyzeGamut of the OKLab color",
    };
  }
  return out;
}

// 6. Dense, independently parameterized samples of the TRUE boundary against the polyline. Each face is
// swept in u and in v with plain bisection on the conversion; every sample lies on the true boundary.
function denseTrueCurve() {
  const out: Record<string, unknown> = {};
  const levels = [0.006, 0.05, 0.2, 0.44, 0.452, 0.68, 0.9, 0.99];
  for (const space of spaces) {
    const distances: number[] = [];
    const perLevel: unknown[] = [];
    let sampleCount = 0;
    for (const level of levels) {
      const s = section(space, level);
      const index = new SegmentIndex(loopSegments(s), 0.02);
      const own: number[] = [];
      for (let face = 0; face < 6; face++) {
        const fixed = face >> 1,
          bound = face & 1;
        const [p, q] = [0, 1, 2].filter((c) => c !== fixed) as [number, number];
        for (const sweep of [p, q]) {
          const other = sweep === p ? q : p;
          const N = 5000;
          // Knots dense toward 0 so the cone near black is sampled where it curves most.
          const grid = Float64Array.from({ length: N }, (_, i) => (i / (N - 1)) ** 3);
          const lo = new Float64Array(N),
            hi = new Float64Array(N).fill(1);
          const rgbAt = (value: Float64Array, offset: number) => {
            const buffer = new Float64Array(3 * N);
            for (let i = 0; i < N; i++) {
              buffer[3 * i + fixed] = bound;
              buffer[3 * i + sweep] = grid[i]!;
              buffer[3 * i + other] = value[i]!;
            }
            void offset;
            return buffer;
          };
          const lowL = linearRgbToOklabBatch(rgbAt(lo, 0), space);
          const highL = linearRgbToOklabBatch(rgbAt(hi, 0), space);
          if (!lowL.ok || !highL.ok) throw new Error("conversion");
          const active = new Uint8Array(N);
          for (let i = 0; i < N; i++)
            active[i] = lowL.value[3 * i]! <= level && level <= highL.value[3 * i]! ? 1 : 0;
          for (let iteration = 0; iteration < 70; iteration++) {
            const mid = new Float64Array(N);
            for (let i = 0; i < N; i++) mid[i] = 0.5 * (lo[i]! + hi[i]!);
            const converted = linearRgbToOklabBatch(rgbAt(mid, 0), space);
            if (!converted.ok) throw new Error("conversion");
            for (let i = 0; i < N; i++)
              if (converted.value[3 * i]! <= level) lo[i] = mid[i]!;
              else hi[i] = mid[i]!;
          }
          const final = linearRgbToOklabBatch(rgbAt(lo, 0), space);
          if (!final.ok) throw new Error("conversion");
          for (let i = 0; i < N; i++) {
            if (!active[i]) continue;
            const d = index.nearest(final.value[3 * i + 1]!, final.value[3 * i + 2]!);
            own.push(d);
            distances.push(d);
            sampleCount++;
          }
        }
      }
      const stats = statsOf(own);
      perLevel.push({
        lightness: level,
        samples: stats.count,
        maxDistance: stats.max,
        p99: stats.p99,
      });
    }
    const stats = statsOf(distances);
    out[space] = {
      method:
        "per face, 5000 cubic-spaced knots in each free channel, the other channel solved by 70 bisection steps on the converted lightness; independent of the generator's tau chords",
      samples: sampleCount,
      distanceToPolyline: stats,
      screenPx: pixelReport(stats.max),
      declaredChordTolerance: DEFAULT_SECTION_CHORD_TOLERANCE,
      perLevel,
    };
  }
  return out;
}

// 7. A mesh cut by the plane is an approximation of the section, not the section.
function meshContrast() {
  const levels = [0.002, 0.006, 0.02, 0.05, 0.1, 0.2, 0.3, 0.44, 0.5, 0.68, 0.8, 0.9, 0.99];
  const out: Record<string, unknown> = {};
  for (const space of spaces) {
    const radial = generateRadialBoundaryMesh({ space, subdivisions: 64, upperKnots: "encoded" });
    const grid = generateBoundaryMesh({ space, subdivisions: 64, distribution: "cubic" });
    if (!radial.ok || !grid.ok) throw new Error("mesh");
    const result: Record<string, unknown> = {};
    for (const [name, mesh] of [
      ["radialHybridM64", radial.value],
      ["fixedGridCubicN64", grid.value],
    ] as const) {
      const rows: unknown[] = [];
      let worst = 0;
      for (const level of levels) {
        const s = section(space, level);
        const exact = loopSegments(s);
        const meshSegments = meshPlaneSegments(mesh.positions, mesh.triangles, level);
        const toMesh = new SegmentIndex(meshSegments, 0.02);
        const toExact = new SegmentIndex(exact, 0.02);
        let forward = 0,
          backward = 0;
        for (const [ax, ay, bx, by] of exact) {
          for (const t of [0, 0.25, 0.5, 0.75])
            forward = Math.max(forward, toMesh.nearest(ax + t * (bx - ax), ay + t * (by - ay)));
        }
        for (const [ax, ay, bx, by] of meshSegments as Segment2[]) {
          backward = Math.max(
            backward,
            toExact.nearest(ax, ay),
            toExact.nearest((ax + bx) / 2, (ay + by) / 2),
          );
        }
        worst = Math.max(worst, forward, backward);
        rows.push({ lightness: level, exactToMesh: forward, meshToExact: backward });
      }
      result[name] = { worst, screenPx: pixelReport(worst), perLevel: rows };
    }
    out[space] = {
      method:
        "distance in the section plane between the exact contour (four points per segment) and the polyline of the triangle mesh cut by the same plane, in both directions",
      ...result,
    };
  }
  return out;
}

// 8. The two multi-crossing regression cases and a fine sweep through the fold hues.
function notches() {
  const out: Record<string, unknown> = {};
  for (const [space, level, hue] of [
    ["srgb", 0.44, 264.1],
    ["srgb", 0.006, 264.125],
  ] as const) {
    const s = section(space, level);
    const segments = loopSegments(s);
    const index = new SegmentIndex(segments, 0.005);
    const exact = gamutRayCrossings(level, hue, space);
    const radians = (hue * Math.PI) / 180;
    out[`${space} L=${level} h=${hue}`] = {
      coreCrossings: exact.map((c) => ({ chroma: c.chroma, exit: c.exit, binding: c.binding })),
      polylineCrossings: rayHits(segments, hue),
      planeDistanceOfEachCoreCrossing: exact.map((c) =>
        index.nearest(c.chroma * Math.cos(radians), c.chroma * Math.sin(radians)),
      ),
    };
  }
  const s = section("srgb", 0.44);
  const segments = loopSegments(s);
  let differing = 0;
  const hueOfDifference: number[] = [];
  const steps = 4001;
  for (let k = 0; k < steps; k++) {
    const hue = 262 + (4 * k) / (steps - 1);
    const exact = gamutRayCrossings(0.44, hue, "srgb").length;
    const approximate = rayHits(segments, hue).length;
    if (exact !== approximate) {
      differing++;
      hueOfDifference.push(hue);
    }
  }
  out["fold sweep sRGB L=0.44, hue 262 to 266 degrees, 4001 rays"] = {
    raysWhereCountsDiffer: differing,
    hueRangeOfDifferences: hueOfDifference.length
      ? [Math.min(...hueOfDifference), Math.max(...hueOfDifference)]
      : null,
    note: "Counts can differ only within the chordal tolerance of a fold (tangency), where two exact crossings are closer than the polyline's resolution.",
  };
  return out;
}

// 9. Deterministic failure and the empty/point/failed distinction.
function failureSemantics() {
  const probe = (lightness: number, options = {}) => {
    const result = generateLightnessSection({ space: "srgb", lightness, ...options });
    return result.ok ? { ok: true, kind: result.value.kind } : { ok: false, error: result.error };
  };
  return {
    lightnessZero: probe(0),
    lightnessOne: probe(1),
    belowRange: probe(-0.001),
    aboveRange: probe(1.001),
    nan: probe(Number.NaN),
    conversionBudget600: probe(0.44, { limits: { maxConversions: 600 } }),
    vertexBudget40: probe(0.44, { limits: { maxVertices: 40 } }),
    roundBudget1: probe(0.44, { chordTolerance: 1e-9, limits: { maxRefinementRounds: 1 } }),
    toleranceOneE13: probe(0.44, { chordTolerance: 1e-13 }),
    repeatable:
      JSON.stringify(probe(0.44, { limits: { maxConversions: 600 } })) ===
      JSON.stringify(probe(0.44, { limits: { maxConversions: 600 } })),
  };
}

const started = performance.now();
const report = {
  schema: "phase-3c1-section-measurements-v1",
  environment: {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: cpus()[0]?.model ?? "unknown",
    note: "Timings are single local observations with JIT and GC variability, not a controlled benchmark.",
  },
  declaredEnvelope: {
    stageHeightCssPx: 900,
    unitsAtZoom1: 1.42,
    pixelsPerUnitAtZoom1: PIXELS_PER_UNIT,
    proposedTargetCssPx: 0.5,
    note: "The 0.5 px figure is a proposed target, not an adopted gate.",
  },
  generator: { chordTolerance: DEFAULT_SECTION_CHORD_TOLERANCE, limits: DEFAULT_SECTION_LIMITS },
  monotonicity: monotonicity(),
  lightnessSweep: lightnessSweep(),
  coreCorrespondence: coreCorrespondence(),
  vertexProvenance: vertexProvenance(),
  membership: membership(),
  denseTrueCurve: denseTrueCurve(),
  meshContrast: meshContrast(),
  multiCrossing: notches(),
  failureSemantics: failureSemantics(),
  reportGenerationSeconds: (performance.now() - started) / 1000,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");

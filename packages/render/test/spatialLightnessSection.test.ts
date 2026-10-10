import { describe, expect, it, vi } from "vitest";
import { gamutRayCrossings, linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import {
  DEFAULT_SECTION_LIMITS,
  assembleSectionLoops,
  cubeEdgeId,
  generateLightnessSection,
  lightnessMonotonicityMargin,
  type LightnessSection,
  type SectionArc,
  SectionFailure,
} from "../src/spatial/lightnessSection.js";
import { generateRadialBoundaryMesh } from "../src/spatial/radialBoundaryMesh.js";
import { generateBoundaryMesh } from "../src/spatial/boundaryMesh.js";
import {
  compareWithCore,
  coreStatus,
  insideLoops,
  loopSegments,
  meshPlaneSegments,
  rayHits,
} from "../experiments/spatial/sectionContour.ts";
import { SegmentIndex } from "../experiments/spatial/silhouette.ts";

vi.setConfig({ testTimeout: 60_000 });

const spaces = ["srgb", "display-p3"] as const;
const LIGHTNESS = [0.002, 0.006, 0.05, 0.2, 0.3, 0.44, 0.452, 0.5, 0.68, 0.8, 0.9, 0.99, 0.9999];
const TOLERANCE = 1e-5;

function sectionOf(
  space: (typeof spaces)[number],
  lightness: number,
  options = {},
): LightnessSection {
  const result = generateLightnessSection({ space, lightness, ...options });
  if (!result.ok) throw new Error(`${result.error}: ${result.detail}`);
  return result.value;
}
function cornerLightness(space: (typeof spaces)[number], rgb: readonly number[]) {
  const result = linearRgbToOklabBatch(Float64Array.from(rgb), space);
  if (!result.ok) throw new Error(result.error.code);
  return result.value[0]!;
}

describe("lightness is monotone, so every section has the structure the solver relies on", () => {
  it.each(spaces)("%s: analytic margin and numerical finite differences", (space) => {
    expect(lightnessMonotonicityMargin(space)).toBeGreaterThan(10);
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const n = 20_000;
    const points = new Float64Array(n * 3 * 2 * 3);
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
    let nonIncreasing = 0;
    for (let i = 0; i < n * 3; i++)
      if (!(converted.value[(2 * i + 1) * 3]! > converted.value[2 * i * 3]!)) nonIncreasing++;
    expect(nonIncreasing).toBe(0);
  });
});

describe.each(spaces)("%s section geometry", (space) => {
  const sections = new Map(LIGHTNESS.map((l) => [l, sectionOf(space, l)] as const));

  it.each(LIGHTNESS)("L = %s is one counterclockwise loop on the plane", (level) => {
    const s = sections.get(level)!;
    expect(s.kind).toBe("region");
    expect(s.loops).toHaveLength(1);
    const loop = s.loops[0]!;
    expect(loop.signedArea).toBeGreaterThan(0);
    const n = loop.edges.length;
    expect(loop.positions.length).toBe(3 * n);
    for (let k = 0; k < n; k++) expect(loop.positions[3 * k + 1]).toBe(level);
    let shoelace = 0;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      shoelace +=
        loop.positions[3 * k]! * loop.positions[3 * j + 2]! -
        loop.positions[3 * j]! * loop.positions[3 * k + 2]!;
      // Generic planes meet no cube vertex, so no segment is degenerate.
      expect(
        Math.hypot(
          loop.positions[3 * j]! - loop.positions[3 * k]!,
          loop.positions[3 * j + 2]! - loop.positions[3 * k + 2]!,
        ),
      ).toBeGreaterThan(0);
    }
    expect(shoelace / 2).toBeCloseTo(loop.signedArea, 12);
  });

  it.each(LIGHTNESS)("L = %s: vertices lie on the true cube faces at lightness L", (level) => {
    const loop = sections.get(level)!.loops[0]!;
    const n = loop.edges.length;
    const converted = linearRgbToOklabBatch(loop.linearRgb, space);
    if (!converted.ok) throw new Error(converted.error.code);
    for (let k = 0; k < n; k++) {
      expect(Math.abs(converted.value[3 * k]! - level)).toBeLessThanOrEqual(
        1e-12 * Math.max(level, 1e-3),
      );
      expect(Math.abs(converted.value[3 * k + 1]! - loop.positions[3 * k]!)).toBeLessThan(1e-15);
      expect(Math.abs(converted.value[3 * k + 2]! - loop.positions[3 * k + 2]!)).toBeLessThan(
        1e-15,
      );
      for (let c = 0; c < 3; c++) {
        const value = loop.linearRgb[3 * k + c]!;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      // Each segment lies on the face named by its provenance, at both of its end vertices.
      const face = loop.segmentFaces[k]!;
      const j = (k + 1) % n;
      for (const vertex of [k, j]) expect(loop.linearRgb[3 * vertex + (face >> 1)]).toBe(face & 1);
      // A crossing of a cube edge has two channels exactly at their bounds and names that edge.
      if (loop.edges[k]! >= 0) {
        const bounds = [0, 1, 2].map((c) => loop.linearRgb[3 * k + c]!);
        const exact = bounds.map((v) => v === 0 || v === 1);
        expect(exact.filter(Boolean).length).toBeGreaterThanOrEqual(2);
        const varying = exact.indexOf(false);
        if (varying >= 0)
          expect(
            cubeEdgeId(varying, bounds.map((v) => (v === 1 ? 1 : 0)) as [number, number, number]),
          ).toBe(loop.edges[k]);
      }
    }
  });

  it.each(LIGHTNESS)(
    "L = %s: every face vertex is a core crossing with the matching binding",
    (level) => {
      const s = sections.get(level)!;
      const loop = s.loops[0]!;
      const n = loop.edges.length;
      let worst = 0;
      let faceVertices = 0;
      for (let k = 0; k < n; k++) {
        const a = loop.positions[3 * k]!,
          b = loop.positions[3 * k + 2]!;
        if (loop.edges[k]! >= 0) {
          // A crossing of a cube edge binds two channels at once. Where the hue ray merely touches the
          // gamut there (an isolated in-gamut point), core's interval logic reports no crossing, so
          // the vertex is checked by core's gamut analysis instead.
          expect(coreStatus(s, a, b)).not.toBe("outside");
          continue;
        }
        faceVertices++;
        const chroma = Math.hypot(a, b);
        const hue = (Math.atan2(b, a) * 180) / Math.PI;
        const crossings = gamutRayCrossings(level, hue, space);
        const match = crossings.reduce(
          (best, c) => (Math.abs(c.chroma - chroma) < Math.abs(best.chroma - chroma) ? c : best),
          crossings[0]!,
        );
        expect(match).toBeDefined();
        worst = Math.max(worst, Math.abs(match.chroma - chroma) / Math.max(chroma, 1e-3));
        expect([loop.segmentFaces[(k + n - 1) % n], loop.segmentFaces[k]]).toContain(match.binding);
      }
      expect(faceVertices).toBeGreaterThan(50);
      // Core's solver is independent of this construction; agreement is to rounding.
      expect(worst).toBeLessThan(1e-9);
    },
  );

  it("agrees with core's ray crossings on a 360-ray sweep at every lightness", () => {
    const hues = Array.from({ length: 360 }, (_, h) => h + 0.0625);
    for (const level of LIGHTNESS) {
      const report = compareWithCore(sections.get(level)!, hues);
      expect(report.countMismatches, `L=${level}`).toBe(0);
      expect(Math.max(0, ...report.planeDistance), `L=${level}`).toBeLessThan(2 * TOLERANCE);
    }
  });

  it("agrees with core gamut analysis on membership away from the boundary", () => {
    for (const level of [0.05, 0.44, 0.68, 0.95]) {
      const s = sections.get(level)! ?? sectionOf(space, level);
      const segments = loopSegments(s);
      const index = new SegmentIndex(segments, 0.02);
      const [minA, minB] = s.bounds!.min,
        [maxA, maxB] = s.bounds!.max;
      let skipped = 0,
        checked = 0;
      for (let i = 0; i < 40; i++)
        for (let j = 0; j < 40; j++) {
          const a = minA - 0.02 + ((maxA - minA + 0.04) * i) / 39;
          const b = minB - 0.02 + ((maxB - minB + 0.04) * j) / 39;
          if (index.nearest(a, b) < 4 * TOLERANCE) {
            skipped++;
            continue;
          }
          checked++;
          expect(insideLoops(segments, a, b), `L=${level} (${a}, ${b})`).toBe(
            coreStatus(s, a, b) !== "outside",
          );
        }
      expect(checked).toBeGreaterThan(1400);
      expect(skipped).toBeLessThan(200);
    }
  });

  it("the neutral point is inside and a boundary point is not outside, per core analysis", () => {
    for (const level of LIGHTNESS) {
      const s = sections.get(level)!;
      expect(insideLoops(loopSegments(s), 0, 0)).toBe(true);
      expect(coreStatus(s, 0, 0)).not.toBe("outside");
      const loop = s.loops[0]!;
      for (let k = 0; k < loop.edges.length; k += 7)
        expect(coreStatus(s, loop.positions[3 * k]!, loop.positions[3 * k + 2]!)).not.toBe(
          "outside",
        );
    }
  });

  it("lower faces are exact cones from black: the contour obeys L(t q) = t^(1/3) L(q)", () => {
    // An independent construction. For a vertex q on a face through black, scale it to the cone's
    // rim (largest remaining channel = 1) and rebuild the point from the rim's lightness alone.
    let checked = 0;
    for (const level of LIGHTNESS) {
      const loop = sections.get(level)!.loops[0]!;
      const n = loop.edges.length;
      for (let k = 0; k < n; k++) {
        const face = loop.segmentFaces[k]!;
        const prior = loop.segmentFaces[(k + n - 1) % n]!;
        if ((face & 1) !== 0 || (prior & 1) !== 0) continue; // interior of a lower face only
        const q = [0, 1, 2].map((c) => loop.linearRgb[3 * k + c]!);
        const peak = Math.max(...q);
        const rim = q.map((v) => v / peak);
        const rimL = cornerLightness(space, rim);
        const scale = (level / rimL) ** 3;
        const predicted = rim.map((v) => v * scale);
        for (let c = 0; c < 3; c++)
          expect(Math.abs(predicted[c]! - q[c]!)).toBeLessThanOrEqual(1e-10 * peak + 1e-300);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("is bit-identical between runs", () => {
    const again = sectionOf(space, 0.44);
    const first = sections.get(0.44)!;
    expect(Array.from(again.loops[0]!.positions)).toEqual(Array.from(first.loops[0]!.positions));
    expect(Array.from(again.loops[0]!.segmentFaces)).toEqual(
      Array.from(first.loops[0]!.segmentFaces),
    );
    expect(again.quality).toEqual(first.quality);
  });

  it("stays within its declared tolerance and work budget", () => {
    for (const level of LIGHTNESS) {
      const { quality } = sections.get(level)!;
      expect(quality.maxObservedChordDeviation).toBeLessThanOrEqual(TOLERANCE);
      expect(quality.maxLightnessResidual).toBeLessThan(1e-14);
      expect(quality.work.conversions).toBeLessThan(DEFAULT_SECTION_LIMITS.maxConversions / 10);
      expect(quality.work.vertices).toBeLessThan(DEFAULT_SECTION_LIMITS.maxVertices / 20);
      expect(quality.work.refinementRounds).toBeLessThanOrEqual(
        DEFAULT_SECTION_LIMITS.maxRefinementRounds,
      );
    }
  });
});

describe("multiple crossings and non-convex sections", () => {
  // Regression fixtures from core's ray solver (Phase 3A): three crossings along one hue ray.
  const notches = [
    {
      space: "srgb",
      l: 0.44,
      h: 264.1,
      chromas: [0.2622313696872526, 0.3008046110453045, 0.30474417289568767],
    },
    {
      space: "srgb",
      l: 0.006,
      h: 264.125,
      chromas: [0.0036069818085510933, 0.004068034743530852, 0.004154569394389988],
    },
  ] as const;
  it.each(notches)(
    "sRGB L=$l h=$h: the polyline crosses the ray three times at core's points",
    (n) => {
      const s = sectionOf(n.space, n.l);
      const exact = gamutRayCrossings(n.l, n.h, n.space);
      expect(exact.map((c) => c.exit)).toEqual([true, false, true]);
      const hits = rayHits(loopSegments(s), n.h);
      expect(hits).toHaveLength(3);
      const radians = (n.h * Math.PI) / 180;
      const index = new SegmentIndex(loopSegments(s), 0.01);
      n.chromas.forEach((chroma) =>
        expect(index.nearest(chroma * Math.cos(radians), chroma * Math.sin(radians))).toBeLessThan(
          2 * TOLERANCE,
        ),
      );
      // The notch gives a section that is not star-shaped about the neutral point, so it is also not
      // convex: its boundary turns both ways.
      const loop = s.loops[0]!;
      let left = 0,
        right = 0;
      const count = loop.edges.length;
      for (let k = 0; k < count; k++) {
        const p = [loop.positions[3 * k]!, loop.positions[3 * k + 2]!];
        const q = [
          loop.positions[3 * ((k + 1) % count)]!,
          loop.positions[3 * ((k + 1) % count) + 2]!,
        ];
        const r = [
          loop.positions[3 * ((k + 2) % count)]!,
          loop.positions[3 * ((k + 2) % count) + 2]!,
        ];
        const turn = (q[0]! - p[0]!) * (r[1]! - q[1]!) - (q[1]! - p[1]!) * (r[0]! - q[0]!);
        if (turn > 1e-14) left++;
        else if (turn < -1e-14) right++;
      }
      expect(left).toBeGreaterThan(0);
      expect(right).toBeGreaterThan(0);
    },
  );

  it("tracks the crossing-count change through the fold hues on both sides", () => {
    // Between the two hues below, core reports one crossing and then three; the polyline follows.
    const s = sectionOf("srgb", 0.44);
    const segments = loopSegments(s);
    let sawOne = false,
      sawThree = false;
    for (let h = 262; h <= 266; h += 0.0125) {
      const exact = gamutRayCrossings(0.44, h, "srgb").length;
      const approximate = rayHits(segments, h).length;
      if (exact === 1) sawOne = true;
      if (exact === 3) sawThree = true;
      if (Math.abs(approximate - exact) > 0) {
        // Only within the chordal tolerance of a fold may the counts differ.
        const gaps = gamutRayCrossings(0.44, h, "srgb")
          .map((c) => c.chroma)
          .slice(1)
          .map(
            (c, i, all) =>
              c - (i === 0 ? gamutRayCrossings(0.44, h, "srgb")[0]!.chroma : all[i - 1]!),
          );
        expect(Math.min(...gaps)).toBeLessThan(4 * TOLERANCE);
      }
    }
    expect(sawOne && sawThree).toBe(true);
  });
});

describe("planes through a cube vertex", () => {
  const corners = {
    red: [1, 0, 0],
    green: [0, 1, 0],
    blue: [0, 0, 1],
    cyan: [0, 1, 1],
    magenta: [1, 0, 1],
    yellow: [1, 1, 0],
  } as const;
  describe.each(spaces)("%s", (space) => {
    it.each(Object.entries(corners))(
      "L equal to the lightness of %s keeps one valid loop through it",
      (_name, rgb) => {
        const level = cornerLightness(space, rgb);
        const s = sectionOf(space, level);
        expect(s.kind).toBe("region");
        expect(s.loops).toHaveLength(1);
        const loop = s.loops[0]!;
        const n = loop.edges.length;
        expect(loop.signedArea).toBeGreaterThan(0);
        const at = Array.from({ length: n }, (_, k) => k).filter((k) =>
          [0, 1, 2].every((c) => loop.linearRgb[3 * k + c] === rgb[c]),
        );
        expect(at.length).toBeGreaterThanOrEqual(1);
        // The corner's color, observed independently, is on the contour to rounding.
        const lab = linearRgbToOklabBatch(Float64Array.from(rgb), space);
        if (!lab.ok) throw new Error(lab.error.code);
        expect(Math.abs(loop.positions[3 * at[0]!]! - lab.value[1]!)).toBeLessThan(1e-14);
        expect(Math.abs(loop.positions[3 * at[0]! + 2]! - lab.value[2]!)).toBeLessThan(1e-14);
        expect(
          compareWithCore(
            s,
            Array.from({ length: 90 }, (_, h) => 4 * h + 0.37),
          ).countMismatches,
        ).toBe(0);
      },
    );
  });
});

describe("degenerate, empty and failed sections are distinct", () => {
  it.each(spaces)("%s: L = 0 and L = 1 are the neutral point alone", (space) => {
    for (const level of [0, 1]) {
      const s = sectionOf(space, level);
      expect(s.kind).toBe("point");
      expect(s.loops).toHaveLength(0);
      expect(Array.from(s.points)).toEqual([0, level, 0]);
      expect(s.bounds).toBeNull();
    }
  });
  it.each(spaces)("%s: outside [0, 1] there is no color, which is an empty success", (space) => {
    for (const level of [-1e-9, -3, 1 + 1e-12, 2]) {
      const s = sectionOf(space, level);
      expect(s.kind).toBe("empty");
      expect(s.loops).toHaveLength(0);
      expect(s.points).toHaveLength(0);
    }
  });
  it("rejects invalid options as errors, never as empty sections", () => {
    const bad = [
      { space: "srgb", lightness: Number.NaN },
      { space: "srgb", lightness: Number.POSITIVE_INFINITY },
      { space: "rec2020", lightness: 0.5 },
      { space: "srgb", lightness: 0.5, chordTolerance: 0 },
      { space: "srgb", lightness: 0.5, chordTolerance: -1 },
      { space: "srgb", lightness: 0.5, chordTolerance: Number.NaN },
      { space: "srgb", lightness: 0.5, limits: { maxVertices: 0 } },
      { space: "srgb", lightness: 0.5, limits: { initialSamplesPerArc: 1.5 } },
    ];
    for (const options of bad) {
      const result = generateLightnessSection(options as never);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid-options");
    }
  });
  it("reports exhausted budgets as resource errors without partial geometry", () => {
    const cases = [
      { limits: { maxConversions: 600 } },
      { limits: { maxVertices: 40 } },
      { limits: { maxRefinementRounds: 1 }, chordTolerance: 1e-9 },
      { chordTolerance: 1e-13 },
    ];
    for (const options of cases) {
      const result = generateLightnessSection({ space: "srgb", lightness: 0.44, ...options });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("resource-budget");
    }
  });
  it("is deterministic about failure", () => {
    const run = () =>
      generateLightnessSection({ space: "srgb", lightness: 0.44, limits: { maxConversions: 600 } });
    expect(run()).toEqual(run());
  });
  it.each([1e-12, 1e-6, 1 - 1e-6, 1 - 1e-12, 0.9999999999999999, 5e-324])(
    "L = %s is either a verified section or an explicit error",
    (level) => {
      for (const space of spaces) {
        const result = generateLightnessSection({ space, lightness: level });
        if (!result.ok) {
          expect(["numerical-failure", "resource-budget", "topology-inconsistent"]).toContain(
            result.error,
          );
          continue;
        }
        expect(result.value.kind).toBe("region");
        for (const loop of result.value.loops) {
          for (let k = 0; k < loop.edges.length; k++) {
            expect(Number.isFinite(loop.positions[3 * k])).toBe(true);
            expect(loop.positions[3 * k + 1]).toBe(level);
          }
        }
      }
    },
  );
});

describe("assembly joins arcs by cube-edge identity only", () => {
  const node = (a: number, b: number) => ({ rgb: [0, 0, 0] as [number, number, number], a, b });
  const arc = (
    face: number,
    startEdge: number,
    endEdge: number,
    points: readonly (readonly [number, number])[],
  ): SectionArc => ({
    face,
    startEdge,
    endEdge,
    nodes: points.map(([a, b]) => node(a, b)),
  });
  /** Face of every undirected segment, from the input arcs. */
  const faceOfSegment = (arcs: readonly SectionArc[]) => {
    const map = new Map<string, number>();
    for (const item of arcs)
      for (let k = 0; k + 1 < item.nodes.length; k++) {
        const p = item.nodes[k]!,
          q = item.nodes[k + 1]!;
        map.set(
          JSON.stringify(
            [
              [p.a, p.b],
              [q.a, q.b],
            ].sort(),
          ),
          item.face,
        );
      }
    return map;
  };

  it("builds two disjoint loops, each counterclockwise, with each segment's own face", () => {
    // Loop A (edges 0 and 1) is clockwise as given; loop B (edges 4 and 5) counterclockwise.
    const arcs = [
      arc(0, 0, 1, [
        [0, 0],
        [0, 1],
        [1, 1],
      ]),
      arc(3, 1, 0, [
        [1, 1],
        [1, 0],
        [0, 0],
      ]),
      arc(2, 4, 5, [
        [5, 5],
        [6, 5],
        [7, 6],
      ]),
      arc(5, 5, 4, [
        [7, 6],
        [6, 7],
        [5, 5],
      ]),
    ];
    const loops = assembleSectionLoops(arcs, 0.5);
    expect(loops).toHaveLength(2);
    const lookup = faceOfSegment(arcs);
    for (const loop of loops) {
      const n = loop.edges.length;
      let area = 0;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        const p = [loop.positions[3 * k]!, loop.positions[3 * k + 2]!];
        const q = [loop.positions[3 * j]!, loop.positions[3 * j + 2]!];
        area += p[0]! * q[1]! - q[0]! * p[1]!;
        expect(loop.positions[3 * k + 1]).toBe(0.5);
        expect(loop.segmentFaces[k]).toBe(lookup.get(JSON.stringify([p, q].sort())));
      }
      expect(area / 2).toBeGreaterThan(0);
      expect(loop.signedArea).toBeCloseTo(area / 2, 12);
    }
    const crossings = loops.map((loop) =>
      Array.from(loop.edges)
        .filter((e) => e >= 0)
        .sort(),
    );
    expect(crossings.sort()).toEqual([
      [0, 1],
      [4, 5],
    ]);
  });

  it("never joins arcs whose endpoints merely coincide in the plane", () => {
    const arcs = [
      arc(0, 0, 1, [
        [0, 0],
        [0, 1],
        [1, 1],
      ]),
      arc(3, 1, 0, [
        [1, 1],
        [1, 0],
        [0, 0],
      ]),
      // A second loop with a vertex exactly on the first loop's corner (0, 0), under other edge ids.
      arc(2, 4, 5, [
        [0, 0],
        [-1, 0],
        [-1, -1],
      ]),
      arc(5, 5, 4, [
        [-1, -1],
        [0, -1],
        [0, 0],
      ]),
    ];
    const loops = assembleSectionLoops(arcs, 0.2);
    expect(loops).toHaveLength(2);
    expect(loops.map((loop) => loop.edges.length).sort()).toEqual([4, 4]);
  });

  it("rejects crossings that are not shared by exactly two arcs", () => {
    const open = [
      arc(0, 0, 1, [
        [0, 0],
        [1, 1],
      ]),
      arc(1, 1, 2, [
        [1, 1],
        [2, 0],
      ]),
    ];
    expect(() => assembleSectionLoops(open, 0.5)).toThrow(SectionFailure);
    const triple = [
      arc(0, 0, 1, [
        [0, 0],
        [1, 1],
      ]),
      arc(1, 1, 2, [
        [1, 1],
        [2, 0],
      ]),
      arc(2, 1, 0, [
        [1, 1],
        [0, 2],
      ]),
      arc(3, 2, 0, [
        [2, 0],
        [0, 0],
      ]),
    ];
    try {
      assembleSectionLoops(triple, 0.5);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SectionFailure);
      expect((error as SectionFailure).code).toBe("topology-inconsistent");
    }
  });
});

describe("a section is not a mesh-plane intersection", () => {
  // The scene's surface approximates the true boundary, so cutting it with a plane approximates the
  // section. This measures how far each tessellation's cut lies from the exact contour.
  const levels = [0.006, 0.05, 0.2, 0.44, 0.68, 0.9];
  function maxDistance(
    space: (typeof spaces)[number],
    mesh: { positions: Float64Array; triangles: Uint32Array },
  ) {
    let worst = 0;
    for (const level of levels) {
      const s = sectionOf(space, level);
      const index = new SegmentIndex(
        meshPlaneSegments(mesh.positions, mesh.triangles, level),
        0.02,
      );
      const loop = s.loops[0]!;
      for (let k = 0; k < loop.edges.length; k++)
        worst = Math.max(worst, index.nearest(loop.positions[3 * k]!, loop.positions[3 * k + 2]!));
    }
    return worst;
  }
  it.each(spaces)(
    "%s: the radial mesh's cut is within 5e-5 of the exact contour; the fixed grid's is not",
    (space) => {
      const radial = generateRadialBoundaryMesh({ space, subdivisions: 64, upperKnots: "encoded" });
      const grid = generateBoundaryMesh({ space, subdivisions: 64, distribution: "cubic" });
      if (!radial.ok || !grid.ok) throw new Error("mesh");
      const radialError = maxDistance(space, radial.value);
      const gridError = maxDistance(space, grid.value);
      expect(radialError).toBeLessThan(5e-5);
      expect(gridError).toBeGreaterThan(2e-4);
      expect(gridError / radialError).toBeGreaterThan(5);
    },
  );
});

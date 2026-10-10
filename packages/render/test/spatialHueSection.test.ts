import { describe, expect, it, vi } from "vitest";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { gamutRayCrossings, linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import {
  generateHueSection,
  type HueSection,
  type HueSectionOptions,
} from "../src/spatial/hueSection.js";
import { isolateRoots } from "../src/spatial/huePolynomial.js";
import {
  compareHueContour,
  independentLightnessCrossings,
  lightnessHits,
  hueSegments,
} from "../experiments/spatial/hueSectionOracle.ts";
import { inverseScene, scene } from "../experiments/spatial/oracle.ts";
import { SegmentIndex } from "../experiments/spatial/silhouette.ts";

vi.setConfig({ testTimeout: 60_000 });
const spaces = ["srgb", "display-p3"] as const;
function section(space: (typeof spaces)[number], hue: number, extra = {}): HueSection {
  const result = generateHueSection({ space, hue, ...extra });
  if (!result.ok) throw new Error(`${space} ${hue}: ${result.error}: ${result.detail}`);
  return result.value;
}

describe.each(spaces)("%s hue half-plane", (space) => {
  it("preserves source constraints, world embedding and graph identity across all hues", () => {
    for (let hue = 0; hue < 360; hue += 3) {
      const s = section(space, hue),
        angle = (hue * Math.PI) / 180;
      expect(s.kind).toBe("region");
      expect(s.arcs.filter((arc) => arc.kind === "domain-neutral")).toHaveLength(1);
      expect(s.vertices[0]).toMatchObject({ lightness: 0, chroma: 0, bindings: 21 });
      for (const loop of s.loops) {
        expect(s.arcs[loop[0]!]!.vertices[0]).toBe(0);
        let area = 0;
        for (let i = 0; i < loop.length; i++) {
          const arc = s.arcs[loop[i]!]!,
            next = s.arcs[loop[(i + 1) % loop.length]!]!;
          expect(arc.vertices.at(-1)).toBe(next.vertices[0]);
          if (next.vertices[0] !== 0 && arc.bindings !== next.bindings)
            expect(
              s.events.some(
                (event) =>
                  event.vertex === next.vertices[0] && event.kind === "constraint-transition",
              ),
            ).toBe(true);
          if (arc.kind === "domain-neutral") {
            expect(arc.bindings).toBe(0);
            expect(arc.geometry).toBe("line");
          } else expect(arc.bindings).toBeGreaterThan(0);
          for (let j = 1; j < arc.vertices.length; j++) {
            const a = s.vertices[arc.vertices[j - 1]!]!,
              b = s.vertices[arc.vertices[j]!]!;
            area += a.lightness * b.chroma - b.lightness * a.chroma;
          }
          for (const id of arc.vertices)
            for (let face = 0; face < 6; face++)
              if (arc.bindings & (1 << face))
                expect(Math.abs(s.linearRgb[3 * id + (face >> 1)]! - (face & 1))).toBeLessThan(
                  3e-11,
                );
        }
        expect(area).toBeGreaterThan(0);
      }
      s.vertices.forEach((v, i) => {
        expect(v.chroma).toBeGreaterThanOrEqual(0);
        expect(s.positions[3 * i] === v.chroma * Math.cos(angle)).toBe(true);
        expect(s.positions[3 * i + 1]).toBe(v.lightness);
        expect(s.positions[3 * i + 2] === v.chroma * Math.sin(angle)).toBe(true);
        const independent = inverseScene(Array.from(s.positions.slice(3 * i, 3 * i + 3)), space);
        independent.forEach((value, k) =>
          expect(Math.abs(value - s.linearRgb[3 * i + k]!)).toBeLessThan(2e-7),
        );
        const authored = createColorValue({
          space: "oklab",
          channels: [v.lightness, s.positions[3 * i]!, s.positions[3 * i + 2]!],
          alpha: 1,
        });
        if (!authored.ok) throw new Error(authored.error.code);
        const analysis = analyzeGamut(
          authored.value,
          space === "srgb" ? "srgb-gamut" : "display-p3-gamut",
        );
        if (!analysis.ok) throw new Error(analysis.error.code);
        expect(analysis.value.status).not.toBe("outside");
      });
      const neutral = s.arcs.find((arc) => arc.kind === "domain-neutral")!;
      const white = s.vertices[neutral.vertices[1]!]!;
      expect(white.lightness).toBeCloseTo(1, 13);
      expect(white.chroma).toBe(0);
    }
  });

  it("agrees with independently transcribed CSS contours in both directions", () => {
    for (const hue of [0, 29, 90, 142, 180, 220, 264.09, 264.1, 264.125, 264.14, 270, 328]) {
      const s = section(space, hue),
        comparison = compareHueContour(s);
      expect(comparison.referenceSectors).toBe(s.loops.length);
      expect(comparison.forward).toBeLessThan(1.05e-5);
      expect(comparison.reverse).toBeLessThan(1.05e-5);
    }
  });

  it("normalizes directed hue, preserves input and is deterministic", () => {
    const options = Object.freeze({
      space,
      hue: -30,
      limits: Object.freeze({ maxVertices: 8192 }),
    });
    const a = generateHueSection(options),
      b = generateHueSection(options);
    expect(a).toEqual(b);
    expect(section(space, 330).positions).toEqual(section(space, -30).positions);
    expect(section(space, 0).positions).toEqual(section(space, 360).positions);
    expect(section(space, 0).positions).toEqual(section(space, -0).positions);
    expect(section(space, 0).positions).not.toEqual(section(space, 180).positions);
    expect(section(space, Number.MAX_VALUE).hue).toBe(Number.MAX_VALUE % 360);
    expect(options.hue).toBe(-30);
  });

  it("preserves near-black and near-white crossings without a singular black evaluation", () => {
    for (const hue of [30, 180, 264.1, 264.125]) {
      const s = section(space, hue),
        index = new SegmentIndex(hueSegments(s));
      for (const l of [1e-12, 1e-8, 0.006, 0.44, 0.8, 0.99999, 1 - 1e-12]) {
        const crossings = gamutRayCrossings(l, hue, space);
        for (const crossing of crossings)
          expect(index.nearest(l, crossing.chroma)).toBeLessThan(1.01e-5);
        if (l < 1e-7) {
          const hits = lightnessHits(s, l);
          expect(hits).toHaveLength(crossings.length);
          hits.forEach((c, i) => expect(Math.abs(c - crossings[i]!.chroma)).toBeLessThan(1e-14));
        }
      }
    }
  });
});

it("preserves two sectors sharing only black and all three hard-case crossings", () => {
  for (const [l, hue] of [
    [0.44, 264.1],
    [0.006, 264.125],
  ]) {
    const s = section("srgb", hue!);
    expect(s.loops).toHaveLength(2);
    const first = new Set(s.loops[0]!.flatMap((id) => s.arcs[id]!.vertices));
    const second = new Set(s.loops[1]!.flatMap((id) => s.arcs[id]!.vertices));
    expect([...first].filter((id) => second.has(id))).toEqual([0]);
    expect(lightnessHits(s, l!)).toHaveLength(3);
    const independent = independentLightnessCrossings("srgb", hue!, l!, 131072);
    const core = gamutRayCrossings(l!, hue!, "srgb");
    expect(independent).toHaveLength(3);
    independent.forEach((c, i) => expect(Math.abs(c - core[i]!.chroma)).toBeLessThan(2e-7));
  }
});

it("does not assume an ordered contour is a single-valued chroma function of lightness", () => {
  const s = section("srgb", 264.1);
  for (const loop of s.loops) {
    const ids = loop.flatMap((id) => s.arcs[id]!.vertices);
    const differences = ids
      .slice(1)
      .map((id, i) => s.vertices[id]!.lightness - s.vertices[ids[i]!]!.lightness);
    expect(differences.some((d) => d > 0)).toBe(true);
    expect(differences.some((d) => d < 0)).toBe(true);
  }
});

it("qualifies cube-corner directions or explicitly refuses ambiguous coincident lower roots", () => {
  for (const space of spaces)
    for (const rgb of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
    ]) {
      const point = scene(rgb, space),
        hue = (Math.atan2(point[2], point[0]) * 180) / Math.PI;
      const result = generateHueSection({ space, hue });
      if (!result.ok) {
        expect(result.error).toBe("numerical-failure");
        expect(result.detail).toMatch(/coincident|multiple root/);
      } else {
        const index = new SegmentIndex(hueSegments(result.value));
        expect(index.nearest(point[1], Math.hypot(point[0], point[2]))).toBeLessThan(2e-7);
      }
    }
});

it("retains the canonical sRGB blue edge as an isolated contact ray omitted by core crossings", () => {
  const converted = linearRgbToOklabBatch(new Float64Array([0, 0, 1]), "srgb");
  if (!converted.ok) throw new Error(converted.error.code);
  const [l, a, b] = converted.value;
  const hue = (Math.atan2(b!, a!) * 180) / Math.PI;
  const s = section("srgb", hue);
  expect(s.contacts).toHaveLength(1);
  const arc = s.arcs[s.contacts[0]!]!;
  expect(arc).toMatchObject({ kind: "gamut-surface", bindings: 5, geometry: "line" });
  const tip = s.vertices[arc.vertices[1]!]!;
  expect(tip.bindings).toBe(37);
  expect(tip.lightness).toBeCloseTo(l!, 13);
  expect(tip.chroma).toBeCloseTo(Math.hypot(a!, b!), 13);
  expect(
    gamutRayCrossings(l!, hue, "srgb").every((hit) => Math.abs(hit.chroma - tip.chroma) > 0.01),
  ).toBe(true);
  // Independent CSS inverse confirms the whole edge, including the missing touching point.
  for (const scale of [1e-12, 0.001, 0.5, 1]) {
    const id = arc.vertices[1]!;
    const rgb = inverseScene(
      Array.from(s.positions.slice(id * 3, id * 3 + 3), (v) => v * scale),
      "srgb",
    );
    expect(Math.abs(rgb[0])).toBeLessThan(1e-13);
    expect(Math.abs(rgb[1])).toBeLessThan(1e-13);
    expect(rgb[2]).toBeCloseTo(scale ** 3, 13);
  }
  // Source identity is exact in normalized hue; nearby ambiguous roots are not welded.
  for (const offset of [-1e-12, 1e-12])
    expect(generateHueSection({ space: "srgb", hue: hue + offset })).toMatchObject({
      ok: false,
      error: "numerical-failure",
    });
  expect(section("srgb", hue - 0.001).contacts).toHaveLength(0);
  expect(section("srgb", hue + 0.001).loops).toHaveLength(2);
});

it("isolates close root pairs and fails closed at numerically unresolved tangencies", () => {
  const run = (p: number[]) =>
    isolateRoots(p, { polynomialEvaluations: 0, rootIterations: 0 }, 10000, 80);
  expect(run([0.25 - 1e-8, -1, 1])).toEqual(
    expect.arrayContaining([expect.closeTo(0.4999, 10), expect.closeTo(0.5001, 10)]),
  );
  expect(() => run([0.25, -1, 1])).toThrow(/multiple root/);
  expect(() => run([0, 0])).toThrow(/coincident/);
});

it("rejects invalid inputs and every exhausted budget without returning partial geometry", () => {
  for (const hue of [NaN, Infinity, -Infinity, undefined, null]) {
    const result = generateHueSection({ space: "srgb", hue } as HueSectionOptions);
    expect(result).toMatchObject({ ok: false, error: "invalid-options" });
    expect(result).not.toHaveProperty("value");
  }
  for (const limits of [
    { maxVertices: 2 },
    { maxEvaluations: 30 },
    { maxRootIterations: 1 },
    { maxDepth: 1 },
  ])
    expect(generateHueSection({ space: "srgb", hue: 30, limits })).toMatchObject({
      ok: false,
      error: "resource-budget",
    });
  expect(generateHueSection({ space: "srgb", hue: 30, chordTolerance: 1e-20 })).toMatchObject({
    ok: false,
    error: "resource-budget",
  });
  expect(generateHueSection({ space: "srgb", hue: 0, limits: { maxVertices: 1e9 } })).toMatchObject(
    { ok: false, error: "invalid-options" },
  );
});

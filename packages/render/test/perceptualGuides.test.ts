import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gamutRayCrossings, gamutRayIntervals } from "@gamut-plane/core/internal/capabilities";
import {
  GUIDE_FIDELITY_BOUND,
  getTracedPickerGuide,
  traceLightnessChromaGuide,
  traceOklabGuide,
} from "../src/perceptualGuides.js";
import { geometryToSvgPath } from "../src/geometry.js";
import {
  acceptanceHues,
  acceptanceLightnesses,
  acceptanceParameters,
  distanceToBoundary,
  fieldMembership,
  oracleCrossings,
} from "./perceptualOracle.js";

/** A trace that completed; a failure reason fails the test. */
function traced(guide: Float32Array | string): Float32Array {
  if (typeof guide === "string") throw new Error(`Guide trace failed: ${guide}`);
  return guide;
}

function distanceToPolyline(x: number, y: number, points: ArrayLike<number>): number {
  let best = Infinity;
  for (let index = 0; index + 3 < points.length; index += 2) {
    const ax = points[index]!;
    const ay = points[index + 1]!;
    const dx = points[index + 2]! - ax;
    const dy = points[index + 3]! - ay;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

describe("render-owned perceptual guides", () => {
  it("draws no contour for lightness outside the gamut's extent", () => {
    for (const gamut of ["srgb", "display-p3"] as const)
      for (const l of [-0.1, 1.1]) expect([...traced(traceOklabGuide(gamut, l))]).toEqual([]);
  });
  it("reports real endpoint-degeneracy work exhaustion rather than returning a partial contour", () => {
    for (const gamut of ["srgb", "display-p3"] as const)
      for (const l of [1e-13, 1 - 1e-13])
        expect(traceOklabGuide(gamut, l)).toBe("approximation-budget");
  });
  it("sets its fidelity target to 1 CSS px at 8x on a 480 px field", () => {
    expect(GUIDE_FIDELITY_BOUND * 8 * 480).toBeCloseTo(1, 12);
  });

  it.each([
    ["srgb", "lc"],
    ["srgb", "ab"],
    ["display-p3", "lc"],
    ["display-p3", "ab"],
  ] as const)(
    "accepts %s %s in both sampled directions including production SVG",
    (gamut, kind) => {
      const trace = (fixed: number) =>
        traced(
          kind === "lc" ? traceLightnessChromaGuide(gamut, fixed) : traceOklabGuide(gamut, fixed),
        );
      const maxima = {
        float32: { boundaryToContourPx: 0, contourToBoundaryPx: 0 },
        svg: { boundaryToContourPx: 0, contourToBoundaryPx: 0 },
      };
      let boundarySamples = 0;
      let contourSamples = 0;
      const unavailable: { fixed: number; reason: string }[] = [];
      const traceMs: number[] = [];
      const fixeds = kind === "lc" ? acceptanceHues : acceptanceLightnesses;
      for (const fixed of fixeds) {
        // A documented real depth/work safeguard, not permission for another slice to fail.
        if (gamut === "srgb" && kind === "ab" && fixed === 0.9999) {
          expect(traceOklabGuide(gamut, fixed)).toBe("approximation-budget");
          traceOklabGuide(gamut, 0.6);
          expect(traceOklabGuide(gamut, fixed)).toBe("approximation-budget");
          unavailable.push({ fixed, reason: "approximation-budget" });
          continue;
        }
        const begin = performance.now();
        const raw = trace(fixed);
        traceMs.push(performance.now() - begin);
        const svg = geometryToSvgPath(raw, kind === "ab");
        const serialized = (svg.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).map((v) => v / 1000);
        expect(serialized).toHaveLength(raw.length);
        // Evict the one-slice memo: this checks recomputation as well as serialization repeatability.
        trace(fixed + 0.00001);
        const repeated = trace(fixed);
        expect(repeated).toEqual(raw);
        expect(geometryToSvgPath(repeated, kind === "ab")).toBe(svg);
        expect(raw.length / 2).toBeLessThanOrEqual(16_384);
        expect(Array.from(raw).every(Number.isFinite)).toBe(true);
        if (kind === "lc") {
          expect(Array.from(raw.slice(0, 2))).toEqual([0, 1]);
          expect(Array.from(raw.slice(-2))).toEqual([0, 0]);
        } else expect(Array.from(raw.slice(0, 2))).toEqual(Array.from(raw.slice(-2)));

        const outputs = [
          ["float32", raw],
          ["svg", serialized],
        ] as const;
        const worst = {
          float32: { boundaryToContourPx: 0, contourToBoundaryPx: 0 },
          svg: { boundaryToContourPx: 0, contourToBoundaryPx: 0 },
        };
        for (const t of acceptanceParameters[kind]) {
          const l = kind === "lc" ? t : fixed;
          const h = kind === "lc" ? fixed : t;
          for (const c of oracleCrossings(l, h, gamut, 0.0005)) {
            if (c > 0.4) continue; // The nominal field domain, not an invented domain-edge contour.
            const radians = (h * Math.PI) / 180;
            const x = kind === "lc" ? c / 0.4 : 0.5 + (c * Math.cos(radians)) / 0.8;
            const y = kind === "lc" ? 1 - l : 0.5 - (c * Math.sin(radians)) / 0.8;
            boundarySamples += 1;
            for (const [name, points] of outputs)
              worst[name].boundaryToContourPx = Math.max(
                worst[name].boundaryToContourPx,
                distanceToPolyline(x, y, points) * 3840,
              );
          }
        }
        const inside = fieldMembership(kind, fixed, gamut);
        for (const [name, points] of outputs) {
          for (let k = 0; k + 3 < points.length; k += 2) {
            const dx = points[k + 2]! - points[k]!;
            const dy = points[k + 3]! - points[k + 1]!;
            for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
              const x = points[k]! + fraction * dx;
              const y = points[k + 1]! + fraction * dy;
              const distance = distanceToBoundary(x, y, dx, dy, inside, kind) * 3840;
              expect(
                Number.isFinite(distance),
                `${gamut} ${kind} fixed=${fixed} ${name} segment=${k / 2} fraction=${fraction} point=${x},${y}: oracle found no nearby transition`,
              ).toBe(true);
              contourSamples += 1;
              worst[name].contourToBoundaryPx = Math.max(worst[name].contourToBoundaryPx, distance);
            }
          }
          for (const direction of ["boundaryToContourPx", "contourToBoundaryPx"] as const) {
            expect(
              worst[name][direction],
              `${gamut} ${kind} fixed=${fixed} ${name} ${direction}`,
            ).toBeLessThanOrEqual(1);
            maxima[name][direction] = Math.max(maxima[name][direction], worst[name][direction]);
          }
        }
      }
      traceMs.sort((a, b) => a - b);
      const record = {
        acceptance: "phase-2o",
        gamut,
        kind,
        slices: fixeds.length,
        unavailable,
        boundarySamples,
        contourSamples,
        maxima,
        traceMs: {
          median: traceMs[Math.floor(traceMs.length / 2)],
          p95: traceMs[Math.floor(traceMs.length * 0.95)],
          max: traceMs.at(-1),
        },
      };
      console.info(JSON.stringify(record));
      const evidence = process.env.GAMUT_PLANE_ACCEPTANCE_EVIDENCE;
      if (evidence)
        writeFileSync(join(evidence, `${gamut}-${kind}.json`), JSON.stringify(record, null, 2));
    },
    120_000,
  );

  it("is deterministic, bounded and returns caller-owned copies", () => {
    const first = traced(traceOklabGuide("srgb", 0.44));
    first.fill(0);
    const second = traced(traceOklabGuide("srgb", 0.44));
    expect(second.some((value) => value !== 0)).toBe(true);
    traceOklabGuide("srgb", 0.5);
    expect([...traced(traceOklabGuide("srgb", 0.44))]).toEqual([...second]);
    expect(second.length / 2).toBeLessThan(2000);
    expect(traced(traceLightnessChromaGuide("display-p3", 200)).length / 2).toBeLessThan(2000);
  });

  it("preserves the independently observed notch crossings in both contour traversals", () => {
    for (const [l, h, count] of [
      [0.44, 264.1, 3],
      [0.006, 264, 1],
      [0.006, 264.1, 3],
      [0.006, 264.125, 3],
      [0.006, 264.25, 1],
      [0.45, 264.125, 3],
    ] as const) {
      const roots = oracleCrossings(l, h, "srgb", 0.0001);
      expect(roots).toHaveLength(count);
      for (const kind of ["lc", "ab"] as const) {
        const points = traced(
          kind === "lc" ? traceLightnessChromaGuide("srgb", h) : traceOklabGuide("srgb", l),
        );
        const radians = (h * Math.PI) / 180;
        const ox = kind === "lc" ? 0 : 0.5;
        const oy = kind === "lc" ? 1 - l : 0.5;
        const ux = kind === "lc" ? 1 / 0.4 : Math.cos(radians) / 0.8;
        const uy = kind === "lc" ? 0 : -Math.sin(radians) / 0.8;
        const hits: number[] = [];
        for (let k = 0; k + 3 < points.length; k += 2) {
          const ax = points[k]! - ox,
            ay = points[k + 1]! - oy;
          const dx = points[k + 2]! - points[k]!,
            dy = points[k + 3]! - points[k + 1]!;
          const determinant = dx * uy - dy * ux;
          if (determinant === 0) continue;
          const t = (ay * ux - ax * uy) / determinant;
          const c = (ay * dx - ax * dy) / determinant;
          if (t >= 0 && t < 1 && c > 0) hits.push(c);
        }
        hits.sort((a, b) => a - b);
        expect(hits, `${kind} L=${l} h=${h}`).toHaveLength(roots.length);
        // Ray displacement magnifies errors at a tangent; the contract uses nearest Euclidean
        // distance to the contour. Crossing count/order protects this fixture's traversal.
        roots.forEach((c) =>
          expect(distanceToPolyline(ox + c * ux, oy + c * uy, points) * 3840).toBeLessThanOrEqual(
            1,
          ),
        );
      }
    }
  });

  it("does not emit consecutive duplicate display vertices at rounded events or the seam", () => {
    for (const gamut of ["srgb", "display-p3"] as const)
      for (const points of [
        traced(traceOklabGuide(gamut, 0.44)),
        traced(traceLightnessChromaGuide(gamut, 264.125)),
      ])
        for (let index = 2; index < points.length; index += 2)
          expect([points[index], points[index + 1]]).not.toEqual([
            points[index - 2],
            points[index - 1],
          ]);
  });

  it("rejects nonfinite numerical inputs explicitly", () => {
    for (const gamut of ["srgb", "display-p3"] as const)
      for (const fixed of [NaN, Infinity, -Infinity]) {
        expect(() => traceOklabGuide(gamut, fixed)).toThrow(TypeError);
        expect(() => traceLightnessChromaGuide(gamut, fixed)).toThrow(TypeError);
      }
  });

  it("draws a lightness of 0 or 1 as the gray point alone", () => {
    for (const gamut of ["srgb", "display-p3"] as const)
      for (const lightness of [0, 1]) {
        const points = traced(traceOklabGuide(gamut, lightness));
        expect([...points]).toEqual([0.5, 0.5, 0.5, 0.5]);
        expect(geometryToSvgPath(points, true)).toBe("M 500.00 500.00 L 500.00 500.00 Z");
      }
  });

  it("puts the Reference on the exit that bounds the color's chroma and reports every interval", () => {
    const [inner, entry, outer] = gamutRayCrossings(0.44, 264.1, "srgb");
    const color = (c: number) => ({ l: 0.44, c, h: 264.1, alpha: 1 });
    // Inside the outer piece: no excursion, bounded by the outer exit.
    expect(getTracedPickerGuide(color((entry!.chroma + outer!.chroma) / 2), "srgb")).toMatchObject({
      maximumChroma: outer!.chroma,
      deltaC: 0,
    });
    // In the notch: the excursion reduces chroma to the inner exit.
    const notch = (inner!.chroma + entry!.chroma) / 2;
    const guide = getTracedPickerGuide(color(notch), "srgb");
    expect(guide.maximumChroma).toBe(inner!.chroma);
    expect(guide.deltaC).toBeCloseTo(notch - inner!.chroma, 15);
    expect(guide.color.c).toBe(inner!.chroma);
    expect(gamutRayIntervals(0.44, 264.1, "srgb")).toEqual([
      { start: 0, end: inner!.chroma },
      { start: entry!.chroma, end: outer!.chroma },
    ]);
    expect(gamutRayIntervals(0, 120, "srgb")).toEqual([{ start: 0, end: 0 }]);
  });
});

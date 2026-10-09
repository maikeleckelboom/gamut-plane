import { expect, it } from "vitest";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { gamutRayCrossings, linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import { generateBoundaryMesh } from "../src/spatial/boundaryMesh.js";
import { distanceToTriangle, readPoint } from "../src/spatial/quality.js";
import { oracleCrossings } from "./perceptualOracle.js";

// Regression fixtures from the existing numerical tracer, checked against its independent scan.
// These are NOT independent anchors for conversion mathematics (core tests provide those).
const fixtures = [
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
  { space: "srgb", l: 0.6, h: 30, chromas: [0.24063533667492565] },
  { space: "srgb", l: 0.5, h: 180, chromas: [0.09071495981111005] },
  { space: "srgb", l: 0.99, h: 90, chromas: [0.01262932728490359] },
  { space: "display-p3", l: 0.44, h: 264.1, chromas: [0.3047545978555229] },
  { space: "display-p3", l: 0.006, h: 264.125, chromas: [0.00415478564532477] },
  { space: "display-p3", l: 0.6, h: 30, chromas: [0.26892731780291157] },
  { space: "display-p3", l: 0.5, h: 180, chromas: [0.12296288937985803] },
  { space: "display-p3", l: 0.99, h: 90, chromas: [0.01536366757062206] },
] as const;

it.each(fixtures)(
  "retains horizontal/radial section correspondence: $space L=$l h=$h",
  (fixture) => {
    const result = generateBoundaryMesh({
      space: fixture.space,
      subdivisions: 64,
      distribution: "cubic",
    });
    if (!result.ok) throw new Error(result.error);
    const mesh = result.value;
    const crossings = gamutRayCrossings(fixture.l, fixture.h, fixture.space);
    const scanned = oracleCrossings(fixture.l, fixture.h, fixture.space, 0.0005);
    expect(crossings).toHaveLength(fixture.chromas.length);
    expect(scanned).toHaveLength(fixture.chromas.length);
    const radians = (fixture.h * Math.PI) / 180;
    for (let i = 0; i < crossings.length; i++) {
      const { chroma, binding } = crossings[i]!;
      expect(Math.abs(chroma - fixture.chromas[i]!)).toBeLessThan(1e-12);
      expect(Math.abs(chroma - scanned[i]!)).toBeLessThan(1e-10);
      const a = chroma * Math.cos(radians),
        b = chroma * Math.sin(radians);
      const point = [a, fixture.l, b] as const;
      expect(Math.abs(a * Math.sin(radians) - b * Math.cos(radians))).toBeLessThan(1e-15);
      expect(a * Math.cos(radians) + b * Math.sin(radians)).toBeGreaterThanOrEqual(0);
      const authored = createColorValue({ space: "oklab", channels: [fixture.l, a, b], alpha: 1 });
      if (!authored.ok) throw new Error(authored.error.code);
      const analysis = analyzeGamut(authored.value, mesh.gamut);
      if (!analysis.ok) throw new Error(analysis.error.code);
      expect(analysis.value.status).not.toBe("outside");
      expect(
        Math.abs(analysis.value.linearRgb[Math.floor(binding / 2)]! - (binding % 2)),
      ).toBeLessThan(1e-12);
      const converted = linearRgbToOklabBatch(
        new Float64Array(analysis.value.linearRgb),
        fixture.space,
      );
      if (!converted.ok) throw new Error(converted.error.code);
      expect(Math.abs(converted.value[0]! - fixture.l)).toBeLessThan(1e-12);
      expect(Math.abs(converted.value[1]! - a)).toBeLessThan(1e-12);
      expect(Math.abs(converted.value[2]! - b)).toBeLessThan(1e-12);
      let nearest = Infinity;
      for (let triangle = 0; triangle < mesh.faces.length; triangle++) {
        if (mesh.faces[triangle] !== binding) continue;
        const [p, q, r] = readPoint(mesh.triangles, triangle).map((index) =>
          readPoint(mesh.positions, index),
        );
        nearest = Math.min(nearest, distanceToTriangle(point, p!, q!, r!));
      }
      expect(nearest).toBeLessThan(0.0007); // only these 14 boundary points at this resolution
    }
  },
);

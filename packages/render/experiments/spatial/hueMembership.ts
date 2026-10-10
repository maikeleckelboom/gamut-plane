// Independent polygon interpretation: even/odd per loop, union across loops. Contacts have no area.
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import type { HueSection } from "../../src/spatial/hueSection.ts";
import { inverseScene } from "./oracle.ts";
import { hueSegments } from "./hueSectionOracle.ts";
import { SegmentIndex } from "./silhouette.ts";

export function inHueLoops(section: HueSection, l: number, c: number): boolean {
  return section.loops.some((loop) => {
    let inside = false;
    for (const id of loop) {
      const arc = section.arcs[id]!;
      for (let i = 1; i < arc.vertices.length; i++) {
        const a = section.vertices[arc.vertices[i - 1]!]!,
          b = section.vertices[arc.vertices[i]!]!;
        if (
          a.lightness > l !== b.lightness > l &&
          c < a.chroma + ((b.chroma - a.chroma) * (l - a.lightness)) / (b.lightness - a.lightness)
        )
          inside = !inside;
      }
    }
    return inside;
  });
}

export function qualifyHueMembership(section: HueSection) {
  const angle = (section.hue * Math.PI) / 180;
  const points: [number, number][] = [];
  // Rectangular samples and projective samples probe narrow sectors/gaps and near black/white.
  for (let i = 0; i <= 80; i++) for (let j = 0; j <= 64; j++) points.push([i / 80, j / 128]);
  const directions = [0, 0.01, 0.2, 0.38, 0.39, 0.4, 0.407, 0.42, 0.6];
  for (const v of section.vertices)
    if (v.direction !== null) directions.push(v.direction - 1e-4, v.direction + 1e-4);
  for (const u of directions.filter((v) => v >= 0 && v < 1))
    for (const l of [1e-12, 1e-8, 0.0001, 0.006, 0.1, 0.44, 0.7, 0.99, 0.99999, 1 - 1e-12])
      points.push([l, (l * u) / (1 - u)]);
  const boundary = new SegmentIndex(hueSegments(section));
  let unambiguous = 0,
    inside = 0,
    outside = 0,
    boundaryTolerance = 0;
  const disputes: { l: number; c: number; polygon: boolean; core: string }[] = [];
  for (const [l, c] of points) {
    const a = c * Math.cos(angle),
      b = c * Math.sin(angle);
    const color = createColorValue({ space: "oklab", channels: [l, a, b], alpha: 1 });
    if (!color.ok) throw new Error(color.error.code);
    const core = analyzeGamut(
      color.value,
      section.space === "srgb" ? "srgb-gamut" : "display-p3-gamut",
    );
    if (!core.ok) throw new Error(core.error.code);
    const rgb = inverseScene([a, l, b], section.space);
    // Exclude both chord approximation and core's boundary tolerance; report rather than hide them.
    if (
      boundary.nearest(l, c) <= 2 * section.quality.chordTolerance ||
      rgb.some((v) => Math.min(Math.abs(v), Math.abs(1 - v)) < 2e-6) ||
      core.value.status === "within-tolerance"
    ) {
      boundaryTolerance++;
      continue;
    }
    unambiguous++;
    const polygon = inHueLoops(section, l, c),
      member = core.value.status === "inside";
    if (member) inside++;
    else outside++;
    if (polygon !== member) disputes.push({ l, c, polygon, core: core.value.status });
  }
  return {
    hue: section.hue,
    space: section.space,
    points: points.length,
    unambiguous,
    inside,
    outside,
    boundaryTolerance,
    disputes,
  };
}

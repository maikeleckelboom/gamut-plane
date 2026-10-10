// Independent qualification only: CSS XYZ conversion, scanned signs + bisection, no production
// cubic coefficients, root partitioning, or contour assembly. Scans can miss sub-grid root pairs.
import { inverseScene, type Space } from "./oracle.ts";
import type { HueSection } from "../../src/spatial/hueSection.ts";
import { SegmentIndex, type Segment2 } from "./silhouette.ts";

export function hueSegments(section: HueSection): Segment2[] {
  return section.arcs.flatMap((arc) =>
    arc.vertices.slice(1).map((id, i) => {
      const a = section.vertices[arc.vertices[i]!]!,
        b = section.vertices[id]!;
      return [a.lightness, a.chroma, b.lightness, b.chroma] as Segment2;
    }),
  );
}
export function lightnessHits(section: HueSection, lightness: number): number[] {
  return hueSegments(section)
    .flatMap(([la, ca, lb, cb]) => {
      if (la > lightness === lb > lightness) return [];
      const c = ca + ((cb - ca) * (lightness - la)) / (lb - la);
      return c > 0 ? [c] : [];
    })
    .sort((a, b) => a - b);
}

export function independentHueContour(space: Space, hue: number, steps = 8192) {
  const angle = (hue * Math.PI) / 180,
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const qAt = (u: number) => inverseScene([u * cosine, 1 - u, u * sine], space);
  const cap = (u: number): [number, number] => {
    const scale = 1 / Math.cbrt(Math.max(...qAt(u)));
    return [(1 - u) * scale, u * scale];
  };
  const roots: number[] = [0, 1];
  let previous = qAt(0);
  for (let i = 1; i <= steps; i++) {
    const next = qAt(i / steps);
    for (let k = 0; k < 3; k++)
      if (previous[k]! > 0 !== next[k]! > 0) {
        let lo = (i - 1) / steps,
          hi = i / steps;
        const positive = previous[k]! > 0;
        for (let iteration = 0; iteration < 56; iteration++) {
          const mid = (lo + hi) / 2;
          if (qAt(mid)[k]! > 0 === positive) lo = mid;
          else hi = mid;
        }
        roots.push((lo + hi) / 2);
      }
    previous = next;
  }
  roots.sort((a, b) => a - b);
  const segments: Segment2[] = [];
  let sectors = 0;
  for (let i = 1; i < roots.length; i++) {
    const a = roots[i - 1]!,
      b = roots[i]!;
    if (qAt((a + b) / 2).some((v) => v < 0)) continue;
    sectors++;
    let last = cap(a);
    segments.push([0, 0, ...last]);
    const n = Math.max(16, Math.ceil((b - a) * steps));
    for (let j = 1; j <= n; j++) {
      const next = cap(a + ((b - a) * j) / n);
      segments.push([...last, ...next]);
      last = next;
    }
    segments.push([...last, 0, 0]);
  }
  return { segments, sectors, roots };
}

export function compareHueContour(section: HueSection, steps = 8192) {
  const reference = independentHueContour(section.space, section.hue, steps);
  const production = hueSegments(section);
  const productionIndex = new SegmentIndex(production),
    referenceIndex = new SegmentIndex(reference.segments);
  let forward = 0,
    reverse = 0;
  let worstForward: number[] = [],
    worstReverse: number[] = [];
  for (const [l, c] of reference.segments) {
    const distance = productionIndex.nearest(l, c);
    if (distance > forward) {
      forward = distance;
      worstForward = [l, c];
    }
  }
  for (const [la, ca, lb, cb] of production)
    for (let j = 0; j <= 8; j++) {
      const l = la + ((lb - la) * j) / 8,
        c = ca + ((cb - ca) * j) / 8;
      const distance = referenceIndex.nearest(l, c);
      if (distance > reverse) {
        reverse = distance;
        worstReverse = [l, c];
      }
    }
  return {
    forward,
    reverse,
    worstForward,
    worstReverse,
    referenceSectors: reference.sectors,
    referenceSegments: reference.segments.length,
  };
}

/** Independent raw-bound fixed-L crossing scan. Does not inherit core's gamut tolerance. */
export function independentLightnessCrossings(
  space: Space,
  hue: number,
  l: number,
  steps = 32768,
): number[] {
  const angle = (hue * Math.PI) / 180;
  const inside = (c: number) =>
    inverseScene([c * Math.cos(angle), l, c * Math.sin(angle)], space).every(
      (v) => v >= 0 && v <= 1,
    );
  const crossings: number[] = [];
  // C<=1 is a qualification search domain, not a production bound.
  let previous = inside(0);
  for (let i = 1; i <= steps; i++) {
    const current = inside(i / steps);
    if (current !== previous) {
      let lo = (i - 1) / steps,
        hi = i / steps;
      for (let j = 0; j < 56; j++) {
        const mid = (lo + hi) / 2;
        if (inside(mid) === previous) lo = mid;
        else hi = mid;
      }
      crossings.push((lo + hi) / 2);
    }
    previous = current;
  }
  return crossings;
}

import * as texel from "@texel/color";
import type { DisplayGamut } from "@gamut-plane/core";

/** Independent conversion path: no tracer or ray solver calls. A finite scan can miss narrow intervals. */
export function oracleCrossings(l: number, h: number, gamut: DisplayGamut, step = 0.001): number[] {
  const rgb = [0, 0, 0];
  const sample = [l, 0, h];
  const inside = (c: number) => {
    sample[1] = c;
    texel.convert(
      sample,
      texel.OKLCH,
      gamut === "srgb" ? texel.sRGBLinear : texel.DisplayP3Linear,
      rgb,
    );
    return texel.isRGBInGamut(rgb, 0);
  };
  const found: number[] = [];
  let previous = inside(0);
  // Near black the slice scales with L. Keep the scan dense in that shrinking region.
  const limit = l < 0.01 ? 2 * l : 0.5;
  const spacing = l < 0.01 ? step * l : step;
  const count = Math.ceil(limit / spacing);
  for (let index = 1; index <= count; index += 1) {
    const c = Math.min(limit, index * spacing);
    const now = inside(c);
    if (now === previous) continue;
    let low = (index - 1) * spacing;
    let high = c;
    for (let iteration = 0; iteration < 52; iteration += 1) {
      const middle = (low + high) / 2;
      if (inside(middle) === previous) low = middle;
      else high = middle;
    }
    found.push((low + high) / 2);
    previous = now;
  }
  return found;
}

export type PerceptualKind = "lc" | "ab";

// Fixed acceptance inputs, independent of tracer seeds, event signatures and output vertices.
export const acceptanceHues = [
  ...new Set([
    0,
    29.2,
    60,
    90,
    100,
    118,
    142.5,
    180,
    200,
    258,
    272,
    300,
    328,
    359.9,
    ...Array.from({ length: 29 }, (_, i) => 106 + i / 4),
    ...Array.from({ length: 49 }, (_, i) => 260 + i / 4),
    264.1,
    264.125,
    264.75,
    265.5,
  ]),
].sort((a, b) => a - b);

export const acceptanceLightnesses = [
  ...new Set([
    0.0001,
    0.001,
    0.01,
    0.04,
    0.11,
    0.2,
    0.6,
    0.9,
    0.966,
    0.97,
    0.995,
    0.999,
    0.9999,
    ...Array.from({ length: 21 }, (_, i) => 0.4 + i / 200),
    0.4775,
  ]),
].sort((a, b) => a - b);

export const acceptanceParameters = {
  lc: [
    ...new Set([
      ...Array.from({ length: 499 }, (_, i) => (i + 1) / 500),
      ...Array.from({ length: 99 }, (_, i) => 0.95 + (i + 1) / 2000),
      0.0001,
      0.0005,
      0.001,
      0.003,
      0.006,
      0.999,
      0.9995,
      0.9999,
    ]),
  ].sort((a, b) => a - b),
  ab: Array.from({ length: 3600 }, (_, i) => i / 10),
} as const;

/** Direct texel membership in field coordinates, including points beyond the editor domain. */
export function fieldMembership(kind: PerceptualKind, fixed: number, gamut: DisplayGamut) {
  const sample = [0, 0, 0];
  const rgb = [0, 0, 0];
  const radians = (fixed * Math.PI) / 180;
  return (x: number, y: number): boolean => {
    sample[0] = kind === "lc" ? 1 - y : fixed;
    sample[1] = kind === "lc" ? 0.4 * x * Math.cos(radians) : 0.8 * (x - 0.5);
    sample[2] = kind === "lc" ? 0.4 * x * Math.sin(radians) : 0.8 * (0.5 - y);
    texel.convert(
      sample,
      texel.OKLab,
      gamut === "srgb" ? texel.sRGBLinear : texel.DisplayP3Linear,
      rgb,
    );
    return texel.isRGBInGamut(rgb, 0);
  };
}

/**
 * A sampled contour point to an independently located membership transition. Five line searches
 * (four fixed directions, the segment normal and a gray-directed ray), uniform/logarithmic samples across
 * +/-2 CSS px, 40 bisections. Logarithmic samples resolve thin near-white feasible wedges.
 * This is a finite directional distance estimate, not a continuous nearest-point certificate.
 */
export function distanceToBoundary(
  x: number,
  y: number,
  dx: number,
  dy: number,
  inside: (x: number, y: number) => boolean,
  kind: PerceptualKind,
): number {
  // Canonical L/C black/white point witnesses; never the gray-axis segment between them.
  let best = kind === "lc" ? Math.min(Math.hypot(x, y), Math.hypot(x, 1 - y)) : Infinity;
  const length = Math.hypot(dx, dy);
  const directions = [
    [1, 0],
    [0, 1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2],
  ];
  if (length > 0) directions.push([-dy / length, dx / length]);
  // The gray is interior on nondegenerate nominal slices. At an acute cusp none of the fixed
  // directions need enter its feasible wedge; this independent radial direction does.
  const gx = kind === "lc" ? -x : 0.5 - x;
  const gy = kind === "lc" ? 0 : 0.5 - y;
  const grayLength = Math.hypot(gx, gy);
  if (grayLength > 0) directions.push([gx / grayLength, gy / grayLength]);
  const radius = 2 / 3840;
  const offsets = [
    ...new Set([
      ...Array.from({ length: 33 }, (_, i) => -radius + (i * radius) / 16),
      ...Array.from({ length: 21 }, (_, i) => radius * 2 ** -i),
      ...Array.from({ length: 21 }, (_, i) => -radius * 2 ** -i),
    ]),
  ].sort((a, b) => a - b);
  for (const [nx, ny] of directions) {
    let previous = inside(x - radius * nx!, y - radius * ny!);
    for (let i = 1; i < offsets.length; i += 1) {
      let low = offsets[i - 1]!;
      let high = offsets[i]!;
      const now = inside(x + high * nx!, y + high * ny!);
      if (now !== previous) {
        for (let iteration = 0; iteration < 40; iteration += 1) {
          const middle = (low + high) / 2;
          if (inside(x + middle * nx!, y + middle * ny!) === previous) low = middle;
          else high = middle;
        }
        const offset = (low + high) / 2;
        const bx = x + offset * nx!;
        const by = y + offset * ny!;
        // Membership may be queried beyond the domain to locate an actual target crossing,
        // but a witness must lie in the nominal domain. Its edge is never itself a crossing.
        const inDomain =
          kind === "lc"
            ? bx >= 0 && bx <= 1 && by >= 0 && by <= 1
            : Math.hypot(bx - 0.5, by - 0.5) <= 0.5;
        if (inDomain) best = Math.min(best, Math.abs(offset));
      }
      previous = now;
    }
  }
  return best;
}

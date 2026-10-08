import { DisplayP3Linear, sRGBLinear } from "@texel/color";

import type { DisplayGamut } from "../color/types.js";

/** Chroma search range; supported display RGB gamuts have no crossings above it. */
const CHROMA_LIMIT = 1;
const ROOT_ITERATIONS = 80;

/** OKLab to LMS' (cube-root cone response), identical to @texel/color's `OKLab_to_LMS_M`. */
export const OKLAB_TO_LMS_PRIME: readonly (readonly [number, number, number])[] = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];

function lmsToLinear(gamut: DisplayGamut): readonly (readonly number[])[] {
  const matrix = (gamut === "srgb" ? sRGBLinear : DisplayP3Linear).fromLMS_M;
  if (!matrix) throw new Error(`Missing LMS conversion for ${gamut}`);
  return matrix;
}

/** One boundary crossing along a chroma ray: where membership changes, and which bound binds. */
export interface GamutRayCrossing {
  readonly chroma: number;
  /** True when the ray leaves the gamut here (inside below, outside above). */
  readonly exit: boolean;
  /** Binding constraint: `2 * channel + bound`, bound 0 for the lower and 1 for the upper. */
  readonly binding: number;
}

interface Ray {
  /** LMS' at chroma 0. */
  readonly base: Float64Array;
  /** d LMS' / d chroma. */
  readonly direction: Float64Array;
}

/**
 * Every crossing of the gamut boundary along `base + chroma * direction`, chroma in (0, 1].
 * Each linear RGB channel is a cubic in chroma; its roots against 0 and 1 are solved on monotone
 * pieces with safeguarded Newton steps, and membership between roots is tested against the nominal channel bounds.
 */
function rayCrossings(
  ray: Ray,
  matrix: readonly (readonly number[])[],
  out: GamutRayCrossing[],
): GamutRayCrossing[] {
  out.length = 0;
  const coefficients: number[][] = [];
  const roots: { chroma: number; binding: number }[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    let a3 = 0;
    let a2 = 0;
    let a1 = 0;
    let a0 = 0;
    for (let cone = 0; cone < 3; cone += 1) {
      const weight = matrix[channel]![cone]!;
      const p = ray.base[cone]!;
      const q = ray.direction[cone]!;
      a3 += weight * q * q * q;
      a2 += 3 * weight * p * q * q;
      a1 += 3 * weight * p * p * q;
      a0 += weight * p * p * p;
    }
    coefficients.push([a3, a2, a1, a0]);
    const value = (c: number) => ((a3 * c + a2) * c + a1) * c + a0;
    const slope = (c: number) => (3 * a3 * c + 2 * a2) * c + a1;
    const cuts = [0];
    const A = 3 * a3;
    const B = 2 * a2;
    if (A !== 0) {
      const discriminant = B * B - 4 * A * a1;
      if (discriminant > 0) {
        const root = Math.sqrt(discriminant);
        const q = -0.5 * (B + (B >= 0 ? root : -root));
        for (const critical of [q / A, q !== 0 ? a1 / q : Number.NaN])
          if (critical > 0 && critical < CHROMA_LIMIT) cuts.push(critical);
      }
    } else if (B !== 0) {
      const critical = -a1 / B;
      if (critical > 0 && critical < CHROMA_LIMIT) cuts.push(critical);
    }
    cuts.push(CHROMA_LIMIT);
    cuts.sort((left, right) => left - right);
    for (let bound = 0; bound < 2; bound += 1) {
      for (let piece = 0; piece + 1 < cuts.length; piece += 1) {
        let low = cuts[piece]!;
        let high = cuts[piece + 1]!;
        let lowValue = value(low) - bound;
        const highValue = value(high) - bound;
        if (lowValue === 0 || lowValue > 0 === highValue > 0) continue;
        let x = (low + high) / 2;
        for (let iteration = 0; iteration < ROOT_ITERATIONS; iteration += 1) {
          const fx = value(x) - bound;
          if (fx === 0) break;
          if (fx > 0 === lowValue > 0) {
            low = x;
            lowValue = fx;
          } else high = x;
          const derivative = slope(x);
          let next = derivative !== 0 ? x - fx / derivative : Number.NaN;
          if (!(next > low && next < high)) next = (low + high) / 2;
          if (next === x || high - low <= Number.EPSILON * Math.max(1, x)) {
            x = next;
            break;
          }
          x = next;
        }
        roots.push({ chroma: x, binding: 2 * channel + bound });
      }
    }
  }
  roots.sort((left, right) => left.chroma - right.chroma || left.binding - right.binding);
  const inside = (c: number) => {
    for (const [a3, a2, a1, a0] of coefficients) {
      const v = ((a3! * c + a2!) * c + a1!) * c + a0!;
      if (v < 0 || v > 1) return false;
    }
    return true;
  };
  let previous = inside(0);
  for (let index = 0; index < roots.length; index += 1) {
    const next = index + 1 < roots.length ? roots[index + 1]!.chroma : CHROMA_LIMIT;
    const current = inside((roots[index]!.chroma + next) / 2);
    if (current !== previous)
      out.push({ chroma: roots[index]!.chroma, exit: previous, binding: roots[index]!.binding });
    previous = current;
  }
  return out;
}

function lightnessChromaRay(lightness: number, cosine: number, sine: number): Ray {
  const base = new Float64Array(3);
  const direction = new Float64Array(3);
  for (let cone = 0; cone < 3; cone += 1) {
    const row = OKLAB_TO_LMS_PRIME[cone]!;
    base[cone] = row[0] * lightness;
    direction[cone] = row[1] * cosine + row[2] * sine;
  }
  return { base, direction };
}

/**
 * Numerically solved boundary crossings along the chroma ray at OKLCH lightness `l` and hue `h`. A gray at
 * lightness strictly between 0 and 1 is inside; at 0 or 1 the in-gamut set is the gray alone.
 */
export function gamutRayCrossings(
  l: number,
  h: number,
  gamut: DisplayGamut,
): readonly GamutRayCrossing[] {
  if (!Number.isFinite(l) || !Number.isFinite(h))
    throw new TypeError("Lightness and hue must be finite");
  if (l <= 0 || l >= 1) return [];
  const radians = (((h % 360) + 360) % 360) * (Math.PI / 180);
  return rayCrossings(
    lightnessChromaRay(l, Math.cos(radians), Math.sin(radians)),
    lmsToLinear(gamut),
    [],
  );
}

/** In-gamut chroma intervals along one ray, each `[start, end]` in OKLCH chroma. */
export function gamutRayIntervals(
  l: number,
  h: number,
  gamut: DisplayGamut,
): readonly Readonly<{ start: number; end: number }>[] {
  const crossings = gamutRayCrossings(l, h, gamut);
  if (l < 0 || l > 1) return [];
  if (l === 0 || l === 1) return [{ start: 0, end: 0 }];
  const intervals: { start: number; end: number }[] = [];
  let start = 0;
  for (const crossing of crossings) {
    if (crossing.exit) intervals.push({ start, end: crossing.chroma });
    else start = crossing.chroma;
  }
  return intervals;
}

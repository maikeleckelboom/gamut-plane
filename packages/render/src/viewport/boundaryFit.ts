import { constrainViewport, MAX_VIEWPORT_ZOOM, type FieldViewport } from "./math.js";

export interface BoundaryContour {
  readonly points: Float32Array | Float64Array;
  readonly closed: boolean;
}
export interface BoundaryBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
export type BoundaryFit =
  | Readonly<{ kind: "available"; viewport: FieldViewport; bounds: BoundaryBounds }>
  | Readonly<{ kind: "unavailable"; reason: "empty" | "unavailable" }>;

/**
 * Bounds genuine contour segments intersecting the nominal editor domain. Clipping contributes
 * segment endpoints only; it never fabricates a boundary along the domain or current camera crop.
 * A disc occupies the normalized square with center (0.5, 0.5) and radius 0.5.
 */
export function fitBoundaryContour(
  contour: BoundaryContour,
  domain: "rectangle" | "disc",
): BoundaryFit {
  const { points, closed } = contour;
  if (points.length % 2 !== 0 || !points.every(Number.isFinite))
    return { kind: "unavailable", reason: "unavailable" };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const include = (x: number, y: number) => {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  };
  const count = points.length / 2;
  if (count === 1) {
    const x = points[0]!;
    const y = points[1]!;
    if (
      x >= 0 &&
      x <= 1 &&
      y >= 0 &&
      y <= 1 &&
      (domain === "rectangle" || Math.hypot(x - 0.5, y - 0.5) <= 0.5)
    )
      include(x, y);
  }
  const edges = closed && count > 1 ? count : count - 1;
  for (let index = 0; index < edges; index++) {
    const next = (index + 1) % count;
    const ax = points[2 * index]!;
    const ay = points[2 * index + 1]!;
    const dx = points[2 * next]! - ax;
    const dy = points[2 * next + 1]! - ay;
    if (!Number.isFinite(dx) || !Number.isFinite(dy))
      return { kind: "unavailable", reason: "unavailable" };
    let lo = 0;
    let hi = 1;
    for (const [a, d] of [
      [ax, dx],
      [ay, dy],
    ] as const) {
      if (d === 0) {
        if (a < 0 || a > 1) hi = -1;
      } else {
        const start = -a / d;
        const end = (1 - a) / d;
        // A huge off-domain segment can lose the entire unit interval in parameter space.
        // Reject that numerical collapse rather than inventing a clipped point from cancellation.
        if (start === end && Math.abs(d) > 1) return { kind: "unavailable", reason: "unavailable" };
        lo = Math.max(lo, Math.min(start, end));
        hi = Math.min(hi, Math.max(start, end));
      }
    }
    if (lo > hi) continue;
    // Work on the already square-clipped segment. This bounds disc arithmetic even for a
    // contour whose original vertices were far outside the nominal field.
    const sx = Math.max(0, Math.min(1, ax + lo * dx));
    const sy = Math.max(0, Math.min(1, ay + lo * dy));
    const ex = Math.max(0, Math.min(1, ax + hi * dx));
    const ey = Math.max(0, Math.min(1, ay + hi * dy));
    if (domain === "rectangle") {
      include(sx, sy);
      include(ex, ey);
      continue;
    }
    const vx = ex - sx;
    const vy = ey - sy;
    const px = sx - 0.5;
    const py = sy - 0.5;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) {
      if (Math.hypot(px, py) <= 0.5) include(sx, sy);
      continue;
    }
    const dot = px * vx + py * vy;
    const discriminant = dot * dot - lengthSquared * (px * px + py * py - 0.25);
    if (discriminant < 0) continue;
    const root = Math.sqrt(discriminant);
    const start = Math.max(0, (-dot - root) / lengthSquared);
    const end = Math.min(1, (-dot + root) / lengthSquared);
    if (start > end) continue;
    include(sx + start * vx, sy + start * vy);
    include(sx + end * vx, sy + end * vy);
  }
  if (!Number.isFinite(left)) return { kind: "unavailable", reason: "empty" };
  const extent = Math.max(right - left, bottom - top);
  const viewport = constrainViewport({
    // Ten percent breathing room on each side, limited by the existing camera bounds.
    zoom: extent <= 1 / (MAX_VIEWPORT_ZOOM * 1.2) ? MAX_VIEWPORT_ZOOM : 1 / (extent * 1.2),
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
  });
  return { kind: "available", viewport, bounds: { left, top, right, bottom } };
}
